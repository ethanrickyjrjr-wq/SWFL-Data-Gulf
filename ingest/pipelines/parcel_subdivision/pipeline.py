"""Collier + Lee parcel-name ingest entry point (communities-swfl Phase 1 T2).

Run with: python -m ingest.pipelines.parcel_subdivision.pipeline [--dry-run] [--county collier|lee|both]

Writes parcel names + property_type + just_value to data_lake.parcel_subdivision
(Tier 2) — the backbone T4's neighborhood_stats aggregation and the alias
reconciler's community rollup read. Both counties come off the same FDOR
statewide centroid layer (see constants.py's 07/14/2026 correction).
"""
from __future__ import annotations

import argparse
import sys

from .constants import CO_NO
from .resources import arcgis_count, fetch_parcel_subdivisions, ingest_parcel_subdivisions


def _dry_run_county(county: str) -> None:
    canonical = arcgis_count(f"CO_NO={CO_NO[county]}")
    rows = fetch_parcel_subdivisions(county)
    print(f"parcel_subdivision ({county}) dry-run: {len(rows)} homes (server count {canonical} incl. non-home)")
    if rows:
        print("first row:", rows[0])
        by_type: dict[str, int] = {}
        for r in rows:
            by_type[r["property_type"]] = by_type.get(r["property_type"], 0) + 1
        print("by property_type:", by_type)
        # Landmine 3a (handoff plan §3a): the source layer has, on Collier, stamped
        # one roll record onto multiple map points for condos. Verify this NAL-style
        # layer is one row per parcel before trusting any count.
        parcel_ids = [r["parcel_id"] for r in rows]
        n_distinct = len(set(parcel_ids))
        if n_distinct != len(parcel_ids):
            print(
                f"parcel_subdivision ({county}) dry-run: WARNING - {len(parcel_ids)} rows but only "
                f"{n_distinct} distinct parcel_id — condo fan-out present, dedup before trusting counts"
            )
        else:
            print(f"parcel_subdivision ({county}) dry-run: {n_distinct} distinct parcel_id == row count, no fan-out")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Collier + Lee parcel-name ingest (FDOR centroid layer).")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch + normalize only; print count + sample; skip dlt write.",
    )
    parser.add_argument(
        "--county",
        choices=["collier", "lee", "both"],
        default="both",
        help="Which county to run (default: both).",
    )
    args = parser.parse_args(argv)
    counties = ["collier", "lee"] if args.county == "both" else [args.county]

    if args.dry_run:
        for county in counties:
            _dry_run_county(county)
        return 0

    for county in counties:
        ingest_parcel_subdivisions(county)
    return 0


if __name__ == "__main__":
    sys.exit(main())
