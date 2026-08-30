"""Backfill data_lake.leepa_parcels.latitude/longitude from LeePA FabricParcels.

One-off companion to the 08/28/2026 pipeline change (community crosswalk Piece 1,
ingest/pipelines/leepa/resources.py `_fetch_fabric_by_folio`) so parcel coordinates
go live without re-running the full 548k-row annual merge — the exact shape of
scripts/backfill_leepa_strap.py, which did the same for `strap` on 07/19/2026.

Idempotent — safe to re-run; each run re-attaches the freshest crosswalk. Coordinates
come from the SAME fabric row the min-Name strap dedupe selects (never mixed across
rows), and 0.0 or out-of-envelope values are stored as NULL (a (0,0) point is the
null-island artifact, never a Lee coordinate). Prints LIVE coverage and exits 1
below 90%.

Run from repo root:
    python scripts/backfill_leepa_parcel_coords.py
"""
import os
import sys
from pathlib import Path

import psycopg

_SCRIPT_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_SCRIPT_REPO_ROOT))

from ingest.lib.arcgis_paginator import arcgis_count, paginate_arcgis_keyset  # noqa: E402
from ingest.pipelines.leepa.constants import LEEPA_FABRIC_PARCELS_URL  # noqa: E402

# Lee County envelope — same guard as the boundary ingest (bounds, not a served number).
LAT_MIN, LAT_MAX = 26.0, 27.1
LON_MIN, LON_MAX = -82.6, -81.2


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


def _coord(v, lo, hi):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f == 0.0 or not (lo <= f <= hi):
        return None
    return f


def _fetch_fabric() -> dict[str, tuple[str, float | None, float | None]]:
    """folio -> (strap, lat, lon); min-Name dedupe, coords from the winning row.
    Kept import-light like backfill_leepa_strap._fetch_pairs (no dlt import)."""
    fabric: dict[str, tuple[str, float | None, float | None]] = {}
    fetched = 0
    for feature in paginate_arcgis_keyset(
        LEEPA_FABRIC_PARCELS_URL,
        out_fields="Name,FolioID,Latitude,Longitude",
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
        if key not in fabric or name < fabric[key][0]:
            fabric[key] = (
                name,
                _coord(attrs.get("Latitude"), LAT_MIN, LAT_MAX),
                _coord(attrs.get("Longitude"), LON_MIN, LON_MAX),
            )
    canonical = arcgis_count(LEEPA_FABRIC_PARCELS_URL)
    with_coords = sum(1 for _, lat, lon in fabric.values() if lat is not None and lon is not None)
    print(f"fabric pull: {fetched:,} rows fetched vs {canonical:,} canonical; "
          f"{len(fabric):,} distinct folios; {with_coords:,} with in-envelope coords")
    if canonical and fetched < 0.9 * canonical:
        print("ABORT: fabric pull under 90% of canonical — refusing a truncated backfill.")
        raise SystemExit(1)
    return fabric


def main() -> int:
    fabric = _fetch_fabric()
    if not fabric:
        print("ABORT: zero fabric rows fetched.")
        return 1

    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("ALTER TABLE data_lake.leepa_parcels "
                        "ADD COLUMN IF NOT EXISTS latitude double precision")
            cur.execute("ALTER TABLE data_lake.leepa_parcels "
                        "ADD COLUMN IF NOT EXISTS longitude double precision")
        conn.commit()
        print("columns ready: data_lake.leepa_parcels.latitude/longitude")

        with conn.cursor() as cur:
            cur.execute("CREATE TEMP TABLE _coord_map (folioid text PRIMARY KEY, "
                        "lat double precision, lon double precision)")
            with cur.copy("COPY _coord_map (folioid, lat, lon) FROM STDIN") as copy:
                for folio, (_strap, lat, lon) in fabric.items():
                    if lat is not None and lon is not None:
                        copy.write_row((folio, lat, lon))
            cur.execute(
                "UPDATE data_lake.leepa_parcels p SET latitude = m.lat, longitude = m.lon"
                " FROM _coord_map m WHERE p.folioid = m.folioid"
                " AND (p.latitude IS DISTINCT FROM m.lat OR p.longitude IS DISTINCT FROM m.lon)"
            )
            updated = cur.rowcount
        conn.commit()
        print(f"updated: {updated:,} rows")

        # Live verification — print the real numbers, never assume.
        with conn.cursor() as cur:
            cur.execute("SELECT count(*), count(latitude) FROM data_lake.leepa_parcels")
            total, with_coords = cur.fetchone()
            cur.execute("SELECT count(*) FROM data_lake.leepa_parcels "
                        "WHERE latitude IS NOT NULL AND strap IS NOT NULL")
            (joinable,) = cur.fetchone()

        cov = 100.0 * with_coords / total if total else 0.0
        print(f"\ncoordinate coverage: {with_coords:,}/{total:,} leepa parcels ({cov:.2f}%)")
        print(f"spatial-join-ready (coords AND strap): {joinable:,}")
        if cov < 90.0:
            print("FAIL: coordinate coverage under 90%.")
            return 1
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
