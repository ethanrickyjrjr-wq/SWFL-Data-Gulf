"""Apply docs/sql/20260711_collier_sold_median_by_zip.sql (+ the grant) and verify live.

Creates data_lake.collier_sold_median_by_zip — Collier homes-only SOLD median per ZIP
from FDOR recorded-deed sale prices. Mirror of the Lee view, minus the crosswalk join
(Collier's FDOR row carries a native situs ZIP, so there is no centroid->ZCTA step).

REQUIRES the collier_parcels re-ingest (centroid source + SALE_PRC1) to have landed —
the view reads sale_prc1, which the old 14-field polygon layer did not carry.

Reads credentials from .dlt/secrets.toml (same pattern as apply_tier_divergence_views.py).
Run from repo root:
    python scripts/apply_collier_sold_median_view.py
"""
import os
import sys
from pathlib import Path

import psycopg


def _get_repo_root() -> Path:
    import subprocess

    result = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        capture_output=True,
        text=True,
    )
    if result.returncode == 0:
        return Path(result.stdout.strip()).parent
    return Path(__file__).parent.parent


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


def main() -> int:
    root = _get_repo_root()
    view_sql = (root / "docs" / "sql" / "20260711_collier_sold_median_by_zip.sql").read_text()
    grant_sql = (root / "docs" / "sql" / "collier_sold_median_grant.sql").read_text()

    conn = _get_connection()
    try:
        # Precondition: sale_prc1 must exist and be populated, else the view is all-empty
        # and we'd ship a silently-dead metric (the exact failure class this whole
        # session is about). Fail LOUD instead.
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM information_schema.columns"
                " WHERE table_schema='data_lake' AND table_name='collier_parcels'"
                " AND column_name='sale_prc1'"
            )
            if (cur.fetchone() or [0])[0] == 0:
                print(
                    "ABORT: data_lake.collier_parcels has no sale_prc1 column — run the "
                    "re-ingest first (python -m ingest.pipelines.collier_parcels.pipeline)."
                )
                return 1
            cur.execute(
                "SELECT count(*) FROM data_lake.collier_parcels WHERE sale_prc1 > 20000"
            )
            priced = (cur.fetchone() or [0])[0]
            if priced == 0:
                print("ABORT: sale_prc1 exists but ZERO rows carry a real price — re-ingest incomplete.")
                return 1
            print(f"precondition OK — {priced:,} parcels carry a sale price > $20,000")

        with conn.cursor() as cur:
            cur.execute(view_sql)
        conn.commit()
        print("view applied: data_lake.collier_sold_median_by_zip")

        with conn.cursor() as cur:
            cur.execute(grant_sql)
        conn.commit()
        print("grant applied + PostgREST schema reloaded")

        # Live verification — print the real numbers, never assume.
        with conn.cursor() as cur:
            cur.execute(
                "SELECT county_median, county_n FROM data_lake.collier_sold_median_by_zip LIMIT 1"
            )
            row = cur.fetchone()
            if not row:
                print("WARNING: view created but returns ZERO rows.")
                return 1
            print(f"\nCollier homes-only SOLD median: ${int(row[0]):,}  (n = {row[1]:,} home sales)")

            cur.execute(
                "SELECT zip_code, home_sales_n, median_sale, county_fallback"
                " FROM data_lake.collier_sold_median_by_zip"
                " ORDER BY home_sales_n DESC LIMIT 8"
            )
            print("\ntop ZIPs by qualifying home sales:")
            for z, n, med, fb in cur.fetchall():
                flag = "  (county fallback)" if fb else ""
                print(f"  {z}  n={n:>5}  median ${int(med):>9,}{flag}")
    finally:
        conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
