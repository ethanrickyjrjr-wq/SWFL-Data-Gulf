"""Zillow ZHVI SWFL Tier 2 loader entry point.

Run with: python -m ingest.pipelines.zhvi_swfl.pipeline

Reads the Tier 1 Parquet at s3://lake-tier1/market/zhvi_swfl.parquet via DuckDB
and merges into data_lake.zhvi_swfl on (zip_code, period_end). Idempotent —
re-running against an unchanged Parquet is a no-op.

Chained from npm: `npm run ingest:zhvi-swfl` runs the Tier 1 DuckDB pipeline
first (writes the Parquet) and then this script (merges to Postgres).
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, timedelta
from typing import Optional

import dlt

from .resources import zhvi_swfl_resource

ZHVI_PARQUET_ID = "lake-tier1/market/zhvi_swfl.parquet"


def _ensure_tier1_fresh() -> None:
    """Refuse to load if the upstream Tier 1 Parquet didn't refresh today."""
    import psycopg  # lazy import — not needed on dry-run or test paths

    dsn = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if not dsn:
        sys.exit("DESTINATION__POSTGRES__CREDENTIALS not set; cannot verify Tier 1 freshness.")
    with psycopg.connect(dsn) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT vintage FROM data_lake._tier1_inventory WHERE id = %s",
            (ZHVI_PARQUET_ID,),
        )
        row = cur.fetchone()
    if row is None:
        sys.exit(
            f"Tier 1 fetch did not succeed: no _tier1_inventory row for {ZHVI_PARQUET_ID}."
        )
    vintage = row[0]
    if vintage < date.today() - timedelta(days=1):
        sys.exit(
            f"Tier 1 fetch did not succeed today: vintage={vintage} is older than yesterday. "
            f"Run `gh workflow run zhvi-tier1-monthly.yml -f dry_run=false` first."
        )


def run_pipeline(parquet_path: Optional[str] = None) -> None:
    """Run the dlt merge into Tier 2.

    Args:
        parquet_path: Optional override for the Parquet location (tests use
            a local file; production reads from S3).
    """
    pipeline = dlt.pipeline(
        pipeline_name="zhvi_swfl",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(zhvi_swfl_resource(parquet_path=parquet_path))
    print(load_info)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--parquet-path",
        default=None,
        help="Override the Parquet source (default: s3 production path).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate Tier 1 Parquet is readable; skip dlt write and freshness check.",
    )
    args = parser.parse_args()
    if not args.dry_run:
        _ensure_tier1_fresh()
    try:
        if args.dry_run:
            rows = list(zhvi_swfl_resource(parquet_path=args.parquet_path))
            print(f"zhvi_swfl dry-run: {len(rows)} rows")
            if rows:
                print(f"first row: {rows[0]}")
            return
        run_pipeline(parquet_path=args.parquet_path)
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        sys.exit(130)


if __name__ == "__main__":
    main()
