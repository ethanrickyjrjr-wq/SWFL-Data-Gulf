"""Redfin FL city market-tracker ingest entry point.

Run with: python -m ingest.pipelines.redfin_city_swfl.pipeline [--dry-run]

Source: Redfin Data Center CITY market tracker (free public gzipped TSV).
Writes EVERY Florida city's rows to data_lake.redfin_city_swfl (Tier 2) —
separation happens in the lake. The desk hero reads the Cape Coral / Fort
Myers / Naples slice as its monthly source-faithful SOLD anchor.
"""
from __future__ import annotations

import argparse
import sys

from .constants import REDFIN_CITY_TRACKER_URL, REGION_TO_AREA
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
        print(f"redfin_city_swfl dry-run: {len(rows)} FL city rows")
        if rows:
            by_area: dict[str, int] = {}
            for r in rows:
                by_area[r["area"]] = by_area.get(r["area"], 0) + 1
            print(f"distinct areas: {len(by_area)}")
            hero = {a: by_area.get(a, 0) for a in sorted(REGION_TO_AREA.values())}
            print("desk-hero rows per area:", hero)
            print("property_types:", sorted({r["property_type"] for r in rows}))
            years = sorted({str(r["period_end"])[:4] for r in rows if r.get("period_end")})
            if years:
                print(f"period_end years: {years[0]}..{years[-1]}")
            latest = max((str(r["period_end"]) for r in rows if r.get("period_end")), default="")
            hero_areas = set(REGION_TO_AREA.values())
            headline = [
                (r["area"], r["median_sale_price"])
                for r in rows
                if str(r.get("period_end")) == latest
                and r["property_type"] == "All Residential"
                and r["area"] in hero_areas
            ]
            print(f"latest period_end {latest} All Residential median_sale_price:", sorted(headline))
        return 0

    ingest_redfin_city()
    return 0


if __name__ == "__main__":
    sys.exit(main())
