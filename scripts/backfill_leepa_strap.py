"""Backfill data_lake.leepa_parcels.strap from the LeePA ParcelsWFS FabricParcels crosswalk.

One-off companion to the 07/19/2026 pipeline change (ingest/pipelines/leepa/resources.py
`_fetch_strap_by_folio`) so strap goes live without re-running the full 548k-row annual
merge. Idempotent — safe to re-run; each run re-attaches the freshest crosswalk.

Applies migrations/20260719_leepa_parcels_strap.sql's ALTER inline (IF NOT EXISTS), COPYs
the folio->strap pairs into a temp table, UPDATE-joins once, then prints LIVE coverage:
  - strap coverage % of leepa_parcels rows (exit 1 below 90%)
  - % of straps that join data_lake.lee_parcels.parcel_id (the FDOR state roll)

Reads credentials from .dlt/secrets.toml (same pattern as apply_collier_sold_median_view.py;
`git rev-parse --git-common-dir` resolves to the MAIN checkout from a worktree, so secrets
are found either way). Run from repo root:
    python scripts/backfill_leepa_strap.py
"""
import os
import sys
from pathlib import Path

import psycopg

# ingest.lib imports come from THIS script's own repo root (worktree-safe: the code
# under test travels with the script; only credentials resolve via git-common-dir).
_SCRIPT_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_SCRIPT_REPO_ROOT))

from ingest.lib.arcgis_paginator import arcgis_count, paginate_arcgis_keyset  # noqa: E402
from ingest.pipelines.leepa.constants import LEEPA_FABRIC_PARCELS_URL  # noqa: E402


def _get_repo_root() -> Path:
    import subprocess

    result = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return Path(result.stdout.strip()).parent
    return _SCRIPT_REPO_ROOT


def _get_connection():
    conninfo = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if conninfo:
        return psycopg.connect(conninfo, sslmode="require", connect_timeout=15)
    secrets_path = _get_repo_root() / ".dlt" / "secrets.toml"
    secrets: dict[str, str] = {}
    if secrets_path.exists():
        section = None
        for line in secrets_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("[") and line.endswith("]"):
                section = line[1:-1]
                continue
            if "=" in line and section and "credentials" in section:
                k, _, v = line.partition("=")
                secrets[k.strip()] = v.strip().strip("'\"")
    return psycopg.connect(
        host=secrets["host"],
        port=int(secrets.get("port", "5432")),
        dbname=secrets.get("database", "postgres"),
        user=secrets["username"],
        password=secrets["password"],
        sslmode="require",
        connect_timeout=15,
    )


def _fetch_pairs() -> dict[str, str]:
    """Mirror of ingest.pipelines.leepa.resources._fetch_strap_by_folio, kept import-light
    (importing resources pulls dlt + the spatial stack; this one-off needs neither)."""
    straps: dict[str, str] = {}
    fetched = 0
    for feature in paginate_arcgis_keyset(
        LEEPA_FABRIC_PARCELS_URL,
        out_fields="Name,FolioID",
        page_size=1000,
        geometry=False,
    ):
        fetched += 1
        if fetched % 100_000 == 0:
            print(f"  ...{fetched:,} fabric rows")
        attrs = feature.get("attributes") or {}
        folio, name = attrs.get("FolioID"), attrs.get("Name")
        if folio is None or not name:
            continue
        key = str(folio)
        if key not in straps or name < straps[key]:
            straps[key] = name
    canonical = arcgis_count(LEEPA_FABRIC_PARCELS_URL)
    print(f"fabric pull: {fetched:,} rows fetched vs {canonical:,} canonical; "
          f"{len(straps):,} distinct folios")
    if canonical and fetched < 0.9 * canonical:
        print("ABORT: fabric pull under 90% of canonical — refusing a truncated backfill.")
        raise SystemExit(1)
    return straps


def main() -> int:
    pairs = _fetch_pairs()
    if not pairs:
        print("ABORT: zero folio->strap pairs fetched.")
        return 1

    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE data_lake.leepa_parcels ADD COLUMN IF NOT EXISTS strap varchar")
        conn.commit()
        print("column ready: data_lake.leepa_parcels.strap")

        with conn.cursor() as cur:
            cur.execute("CREATE TEMP TABLE _strap_map (folioid text PRIMARY KEY, strap text)")
            with cur.copy("COPY _strap_map (folioid, strap) FROM STDIN") as copy:
                for folio, strap in pairs.items():
                    copy.write_row((folio, strap))
            cur.execute(
                "UPDATE data_lake.leepa_parcels p SET strap = m.strap"
                " FROM _strap_map m WHERE p.folioid = m.folioid"
                " AND p.strap IS DISTINCT FROM m.strap"
            )
            updated = cur.rowcount
        conn.commit()
        print(f"updated: {updated:,} rows")

        # Live verification — print the real numbers, never assume.
        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(strap) FROM data_lake.leepa_parcels")
            total, with_strap = cur.fetchone()
            cur.execute(
                "SELECT count(*) FROM data_lake.leepa_parcels l"
                " JOIN data_lake.lee_parcels f ON l.strap = f.parcel_id"
            )
            (fdor_matched,) = cur.fetchone()
            cur.execute(
                "SELECT l.folioid, l.strap FROM data_lake.leepa_parcels l"
                " LEFT JOIN data_lake.lee_parcels f ON l.strap = f.parcel_id"
                " WHERE l.strap IS NOT NULL AND f.parcel_id IS NULL LIMIT 5"
            )
            unmatched_sample = cur.fetchall()

        cov = 100.0 * with_strap / total if total else 0.0
        joinrate = 100.0 * fdor_matched / with_strap if with_strap else 0.0
        print(f"\nstrap coverage: {with_strap:,}/{total:,} leepa parcels ({cov:.2f}%)")
        print(f"FDOR join rate: {fdor_matched:,}/{with_strap:,} straps match "
              f"lee_parcels.parcel_id ({joinrate:.2f}%)")
        if unmatched_sample:
            print("sample straps with no FDOR row (expected: appraiser-vs-state snapshot drift):")
            for folio, strap in unmatched_sample:
                print(f"  folio {folio} -> {strap}")
        if cov < 90.0:
            print("FAIL: strap coverage under 90%.")
            return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
