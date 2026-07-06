"""Collier parcel-name ingest entry point (communities-swfl Phase 1 T2).

Run with: python -m ingest.pipelines.parcel_subdivision.pipeline [--dry-run]

Writes Collier parcel names + property_type + just_value to
data_lake.parcel_subdivision (Tier 2) — the backbone T4's neighborhood_stats
aggregation and the alias reconciler's community rollup read.

Lee lands via a separate pipeline (follow-up F1) into the SAME table.
"""
from __future__ import annotations

import argparse
import sys

from .resources import (
    arcgis_count,
    fetch_collier_parcel_subdivisions,
    ingest_collier_parcel_subdivisions,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Collier parcel-name ingest (FDOR centroid layer).")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch + normalize only; print count + sample; skip dlt write.",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        canonical = arcgis_count("CO_NO=21")
        rows = fetch_collier_parcel_subdivisions()
        print(f"parcel_subdivision (collier) dry-run: {len(rows)} homes (server count {canonical} incl. non-home)")
        if rows:
            print("first row:", rows[0])
            by_type: dict[str, int] = {}
            for r in rows:
                by_type[r["property_type"]] = by_type.get(r["property_type"], 0) + 1
            print("by property_type:", by_type)
        return 0

    ingest_collier_parcel_subdivisions()
    return 0


if __name__ == "__main__":
    sys.exit(main())
