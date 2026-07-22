"""Redfin Data Center — delistings & relistings → Parquet in Tier 1 Storage.

Run with: python -m ingest.duckdb_pipelines.redfin_delistings_relistings.pipeline

What it does:
  1. Stream-downloads delistings_relistings/monthly/all_zips.csv from Redfin's
     public S3 to a local temp file (~328 MB, plain CSV, no compression).
  2. DuckDB filters to SWFL metro ZIPs and writes a small Parquet to
     s3://lake-tier1/market/redfin_delistings_relistings.parquet.
  3. Upserts one row in data_lake._tier1_inventory.

Key columns kept:
  - share_delisted_pct   — % of active listings pulled from market (fatigue signal)
  - share_relisted_pct   — % of inventory recycled back on (stale-inventory signal)
  - total_delistings     — raw count of delisted listings
  - total_relistings     — raw count of relisted listings
  + MoM/YoY variants

Update schedule: Redfin Data Center publishes the 15th of each month.
Cron target: 15th at 19:00 UTC (staggered after redfin-monthly, price-drops, cancellations slots).
"""

import argparse
import os
import sys
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb
import requests

from .constants import (
    BUCKET,
    PACK_ID,
    PARQUET_PATH,
    PARQUET_TARGET,
    REDFIN_URL,
    SWFL_METRO_SUBSTRINGS,
)
from ingest.lib.tier1_inventory import upsert_inventory_row
from ingest.lib.env_local import load_env_local


def _load_env() -> None:
    load_env_local()


def _configure_s3(con: duckdb.DuckDBPyConnection) -> None:
    con.execute("INSTALL httpfs; LOAD httpfs;")
    endpoint = (
        os.environ["SUPABASE_S3_ENDPOINT"]
        .replace("https://", "")
        .replace("http://", "")
    )
    con.execute(f"""
        SET s3_endpoint='{endpoint}';
        SET s3_access_key_id='{os.environ["SUPABASE_S3_ACCESS_KEY_ID"]}';
        SET s3_secret_access_key='{os.environ["SUPABASE_S3_SECRET_ACCESS_KEY"]}';
        SET s3_region='us-east-1';
        SET s3_url_style='path';
        SET s3_use_ssl=true;
    """)


def _download_source(url: str, dest: Path) -> None:
    print(f"  downloading {url}")
    with requests.get(url, stream=True, timeout=300) as resp:
        resp.raise_for_status()
        total = int(resp.headers.get("content-length", 0))
        written = 0
        with dest.open("wb") as f:
            for chunk in resp.iter_content(chunk_size=8 * 1024 * 1024):
                f.write(chunk)
                written += len(chunk)
                if total:
                    pct = written / total * 100
                    print(f"\r  {written / 1e6:.0f} MB / {total / 1e6:.0f} MB ({pct:.0f}%)", end="", flush=True)
    print()
    print(f"  download complete: {written / 1e6:.1f} MB")


def _build_metro_filter() -> str:
    clauses = " OR ".join(
        f"\"METRO\" LIKE '%{s}%'" for s in SWFL_METRO_SUBSTRINGS
    )
    return f"\"REGION TYPE\" = 'Zip' AND ({clauses})"


def run(*, target: str = PARQUET_TARGET) -> None:
    _load_env()
    ingested_at = datetime.now(timezone.utc).isoformat()
    vintage = date.today().isoformat()

    print("redfin-delistings-relistings: starting ingest")
    print(f"  source: {REDFIN_URL}")
    print(f"  target: {target}")

    con = duckdb.connect()
    if target.startswith("s3://"):
        _configure_s3(con)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_file = Path(tmp_dir) / "delistings_relistings.csv"

        _download_source(REDFIN_URL, tmp_file)

        metro_filter = _build_metro_filter()
        print(f"  filtering: {metro_filter}")
        con.execute(f"""
            CREATE TABLE redfin_delistings_relistings AS
            SELECT
                "PERIOD BEGIN"                            AS period_begin,
                "PERIOD END"                              AS period_end,
                "FREQUENCY"                               AS frequency,
                "REGION NAME"                             AS zip_code,
                "METRO"                                   AS metro,
                "TOTAL DELISTINGS"                        AS total_delistings,
                "TOTAL DELISTINGS MOM (%)"                AS total_delistings_mom_pct,
                "TOTAL DELISTINGS YOY (%)"                AS total_delistings_yoy_pct,
                "TOTAL RELISTINGS"                        AS total_relistings,
                "TOTAL RELISTINGS MOM (%)"                AS total_relistings_mom_pct,
                "TOTAL RELISTINGS YOY (%)"                AS total_relistings_yoy_pct,
                "SHARE OF LISTINGS DELISTED (%)"          AS share_delisted_pct,
                "SHARE OF LISTINGS DELISTED MOM (PPTS)"   AS share_delisted_mom_ppts,
                "SHARE OF LISTINGS DELISTED YOY (PPTS)"   AS share_delisted_yoy_ppts,
                "SHARE OF LISTINGS RELISTED (%)"          AS share_relisted_pct,
                "SHARE OF LISTINGS RELISTED MOM (PPTS)"   AS share_relisted_mom_ppts,
                "SHARE OF LISTINGS RELISTED YOY (PPTS)"   AS share_relisted_yoy_ppts,
                "LAST UPDATED"                            AS last_updated,
                '{ingested_at}'                           AS ingested_at
            FROM read_csv('{tmp_file}', header=true, quote='"')
            WHERE {metro_filter}
        """)

        row_count = con.execute("SELECT COUNT(*) FROM redfin_delistings_relistings").fetchone()[0]
        zip_count = con.execute(
            "SELECT COUNT(DISTINCT zip_code) FROM redfin_delistings_relistings"
        ).fetchone()[0]
        print(f"  rows loaded: {row_count:,} across {zip_count} ZIP codes")

        if row_count == 0:
            print("  ERROR: zero rows matched the filter — aborting", file=sys.stderr)
            sys.exit(1)

        con.execute(f"COPY redfin_delistings_relistings TO '{target}' (FORMAT PARQUET, COMPRESSION ZSTD)")
        print(f"  Parquet written: {target}")

    if target.startswith("s3://"):
        byte_size = con.execute(
            f"SELECT total_compressed_size FROM parquet_metadata('{target}') LIMIT 1"
        ).fetchone()
        upsert_inventory_row(
            bucket=BUCKET,
            path=PARQUET_PATH,
            vintage=vintage,
            byte_size=int(byte_size[0]) if byte_size else None,
            pack_id=PACK_ID,
            source_url=REDFIN_URL,
        )
        print("  inventory row upserted")

    print("redfin-delistings-relistings: ingest complete")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    if args.dry_run:
        print(f"redfin_delistings_relistings dry-run: would download {REDFIN_URL}")
        print(f"redfin_delistings_relistings dry-run: would write to {PARQUET_TARGET}")
        return 0

    try:
        run()
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        sys.exit(130)
    return 0


if __name__ == "__main__":
    main()
