"""Redfin Data Center — price drops → Parquet in Tier 1 Storage.

Run with: python -m ingest.duckdb_pipelines.redfin_price_drops.pipeline

What it does:
  1. Stream-downloads price_drops/monthly/all_zips.csv from Redfin's public S3
     to a local temp file (~333 MB, plain CSV, no compression).
  2. DuckDB filters to SWFL metro ZIPs and writes a small Parquet to
     s3://lake-tier1/market/redfin_price_drops.parquet.
  3. Upserts one row in data_lake._tier1_inventory.

Key columns kept:
  - pct_active_with_drops  — share of active listings with a price drop (%)
  - avg_price_drop_pct     — average size of the price cut (%)
  - price_drops_count      — raw count of price drops in the period
  - homes_sold_with_drops  — homes that sold after a price drop
  + MoM/YoY variants for each

Update schedule: Redfin Data Center publishes the 15th of each month.
Cron target: 15th at 17:00 UTC (4 hours after the existing redfin-monthly slot).
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


def _load_env() -> None:
    env_path = Path(__file__).parent.parent.parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip("'\""))


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

    print("redfin-price-drops: starting ingest")
    print(f"  source: {REDFIN_URL}")
    print(f"  target: {target}")

    con = duckdb.connect()
    if target.startswith("s3://"):
        _configure_s3(con)

    with tempfile.TemporaryDirectory() as tmp_dir:
        tmp_file = Path(tmp_dir) / "price_drops.csv"

        _download_source(REDFIN_URL, tmp_file)

        metro_filter = _build_metro_filter()
        print(f"  filtering: {metro_filter}")
        con.execute(f"""
            CREATE TABLE redfin_price_drops AS
            SELECT
                "PERIOD BEGIN"                            AS period_begin,
                "PERIOD END"                              AS period_end,
                "FREQUENCY"                               AS frequency,
                "REGION NAME"                             AS zip_code,
                "METRO"                                   AS metro,
                "PRICE DROPS"                             AS price_drops_count,
                "PRICE DROPS MOM (%)"                     AS price_drops_mom_pct,
                "PRICE DROPS YOY (%)"                     AS price_drops_yoy_pct,
                "AVERAGE SIZE OF PRICE DROP (%)"          AS avg_price_drop_pct,
                "AVERAGE SIZE OF PRICE DROP MOM (PPTS)"   AS avg_price_drop_mom_ppts,
                "AVERAGE SIZE OF PRICE DROP YOY (PPTS)"   AS avg_price_drop_yoy_ppts,
                "PERCENT ACTIVE WITH PRICE DROPS (%)"     AS pct_active_with_drops,
                "PERCENT ACTIVE WITH PRICE DROPS MOM (PPTS)" AS pct_active_with_drops_mom_ppts,
                "PERCENT ACTIVE WITH PRICE DROPS YOY (PPTS)" AS pct_active_with_drops_yoy_ppts,
                "HOMES SOLD WITH PRICE DROPS"             AS homes_sold_with_drops,
                "HOMES SOLD WITH PRICE DROPS MOM (%)"     AS homes_sold_with_drops_mom_pct,
                "HOMES SOLD WITH PRICE DROPS YOY (%)"     AS homes_sold_with_drops_yoy_pct,
                "LAST UPDATED"                            AS last_updated,
                '{ingested_at}'                           AS ingested_at
            FROM read_csv('{tmp_file}', header=true, quote='"')
            WHERE {metro_filter}
        """)

        row_count = con.execute("SELECT COUNT(*) FROM redfin_price_drops").fetchone()[0]
        zip_count = con.execute(
            "SELECT COUNT(DISTINCT zip_code) FROM redfin_price_drops"
        ).fetchone()[0]
        print(f"  rows loaded: {row_count:,} across {zip_count} ZIP codes")

        if row_count == 0:
            print("  ERROR: zero rows matched the filter — aborting", file=sys.stderr)
            sys.exit(1)

        con.execute(f"COPY redfin_price_drops TO '{target}' (FORMAT PARQUET, COMPRESSION ZSTD)")
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

    print("redfin-price-drops: ingest complete")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args(argv)

    if args.dry_run:
        print(f"redfin_price_drops dry-run: would download {REDFIN_URL}")
        print(f"redfin_price_drops dry-run: would write to {PARQUET_TARGET}")
        return 0

    try:
        run()
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        sys.exit(130)
    return 0


if __name__ == "__main__":
    main()
