"""Redfin SWFL city market-tracker ingest entry point.

Run with: python -m ingest.pipelines.redfin_city_swfl.pipeline [--dry-run]

Source: Redfin Data Center CITY market tracker (free public gzipped TSV).
Writes Cape Coral / Fort Myers / Naples, FL rows to data_lake.redfin_city_swfl
(Tier 2) — the monthly source-faithful SOLD anchor for the daily desk hero.
"""
from __future__ import annotations

import argparse
import sys

from .constants import REDFIN_CITY_TRACKER_URL
from .resources import ingest_redfin_city, iter_city_rows


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Redfin SWFL city market-tracker ingest.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Download + filter only; print city row counts + sample; skip dlt write.",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        rows = list(iter_city_rows(REDFIN_CITY_TRACKER_URL))
        print(f"redfin_city_swfl dry-run: {len(rows)} SWFL city rows")
        if rows:
            by_area: dict[str, int] = {}
            for r in rows:
                by_area[r["area"]] = by_area.get(r["area"], 0) + 1
            print("rows per area:", dict(sorted(by_area.items())))
            print("property_types:", sorted({r["property_type"] for r in rows}))
            years = sorted({str(r["period_end"])[:4] for r in rows if r.get("period_end")})
            if years:
                print(f"period_end years: {years[0]}..{years[-1]}")
            latest = max((str(r["period_end"]) for r in rows if r.get("period_end")), default="")
            headline = [
                (r["area"], r["median_sale_price"])
                for r in rows
                if str(r.get("period_end")) == latest and r["property_type"] == "All Residential"
            ]
            print(f"latest period_end {latest} All Residential median_sale_price:", sorted(headline))
        return 0

    ingest_redfin_city()
    return 0


if __name__ == "__main__":
    sys.exit(main())
