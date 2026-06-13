"""Redfin Lee County market-tracker ingest entry point.

Run with: python -m ingest.pipelines.redfin_lee.pipeline [--dry-run]

Source: Redfin Data Center county market tracker (free public gzipped TSV).
Writes Lee County, FL rows to data_lake.redfin_lee_market (Tier 2).
"""
from __future__ import annotations

import argparse
import sys

from .constants import REDFIN_COUNTY_TRACKER_URL
from .resources import ingest_redfin_lee, iter_lee_rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Redfin Lee County market-tracker ingest.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Download + filter only; print Lee row count + sample; skip dlt write.",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        rows = list(iter_lee_rows(REDFIN_COUNTY_TRACKER_URL))
        print(f"redfin_lee dry-run: {len(rows)} Lee County, FL rows")
        if rows:
            print("first row:", rows[0])
            print("property_types:", sorted({r["property_type"] for r in rows}))
            years = sorted({str(r["period_end"])[:4] for r in rows if r.get("period_end")})
            if years:
                print(f"period_end years: {years[0]}..{years[-1]}")
        return 0

    ingest_redfin_lee()
    return 0


if __name__ == "__main__":
    sys.exit(main())
