"""Tier-1 pipeline — market_heat_swfl (realtor.com ZIP-grain market aggregates).

Pulls the two realtor.com History CSVs (Core Metrics + Hotness), filters to the
SWFL footprint, and writes two fixed-path Parquet snapshots to:
  lake-tier1/market/market_heat_core_swfl.parquet
  lake-tier1/market/market_heat_hotness_swfl.parquet

The files restate full history monthly, so each run OVERWRITES in place
(REPLACE, never append). A Gate-4 non-null row-count floor guards each write —
a truncated/empty fetch aborts before the destructive upload, leaving the prior
Parquet intact. Consumer brain: refinery/packs/market-heat-swfl.mts.
See docs/standards/pipeline-freshness.md for the freshness contract.
"""
from __future__ import annotations

import argparse
import sys
from datetime import date

from ingest.lib.guards import assert_min_rows
from ingest.lib.storage_uploader import upload_parquet
from ingest.lib.tier1_inventory import upsert_inventory_row

from .constants import (
    BUCKET,
    CORE_PARQUET_PATH,
    HOTNESS_PARQUET_PATH,
    MIN_ROWS,
    SOURCE_URL,
)
from .resources import fetch_core_swfl, fetch_hotness_swfl


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="realtor.com ZIP-grain market-aggregate ingest for the SWFL footprint."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch, filter, and validate only; skip Storage upload.",
    )
    args = parser.parse_args(argv)

    core_rows = fetch_core_swfl()
    hotness_rows = fetch_hotness_swfl()
    print(
        f"market_heat_swfl: core={len(core_rows)} rows, hotness={len(hotness_rows)} rows fetched."
    )

    if args.dry_run:
        print("market_heat_swfl: --dry-run, skipping upload.")
        if core_rows:
            print("core first:", core_rows[0])
            print("core last: ", core_rows[-1])
        if hotness_rows:
            print("hotness first:", hotness_rows[0])
        return 0

    # ── Gate 4: non-null floor before either destructive REPLACE write ───────
    assert_min_rows(len(core_rows), MIN_ROWS, label="market_heat_core_swfl")
    assert_min_rows(len(hotness_rows), MIN_ROWS, label="market_heat_hotness_swfl")

    today = date.today().isoformat()

    core_bytes = upload_parquet(BUCKET, CORE_PARQUET_PATH, core_rows)
    upsert_inventory_row(
        bucket=BUCKET,
        path=CORE_PARQUET_PATH,
        vintage=today,
        byte_size=core_bytes,
        pack_id="market-heat-swfl",
        source_url=SOURCE_URL,
    )

    hotness_bytes = upload_parquet(BUCKET, HOTNESS_PARQUET_PATH, hotness_rows)
    upsert_inventory_row(
        bucket=BUCKET,
        path=HOTNESS_PARQUET_PATH,
        vintage=today,
        byte_size=hotness_bytes,
        pack_id="market-heat-swfl",
        source_url=SOURCE_URL,
    )

    print(
        f"market_heat_swfl: uploaded core={len(core_rows)} + hotness={len(hotness_rows)} rows "
        f"to {BUCKET}/market/."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
