"""Lee County parcel ingest entry point (FDOR Statewide Cadastral).

Run with: python -m ingest.pipelines.lee_parcels.pipeline [--dry-run]

Writes Lee parcels (CO_NO=46) to data_lake.lee_parcels (Tier 2). Sibling to
ingest/pipelines/collier_parcels — same FDOR ArcGIS source, same 102-field
scope, same shape. Gives Lee the FDOR-sourced parcel/value/sale detail that
collier_parcels gives Collier (properties-lee-value's existing SOH gap +
sales-velocity signal comes from the separate LeePA appraiser feed — this is
additive, not a replacement).
"""
from __future__ import annotations

import argparse
import sys

from ingest.lib.arcgis_paginator import arcgis_count

from .constants import LEE_CADASTRAL_URL, LEE_CO_NO_WHERE
from .resources import fetch_lee_parcels, ingest_lee_parcels


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Lee County FDOR cadastral parcel ingest.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch + normalize only; print count + sample; skip dlt write.",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        canonical = arcgis_count(LEE_CADASTRAL_URL, where=LEE_CO_NO_WHERE)
        rows = fetch_lee_parcels()
        print(f"lee_parcels dry-run: {len(rows)} parcels (server count {canonical})")
        if rows:
            print("first row:", rows[0])
            homesteaded = sum(1 for r in rows if (r.get("jv_hmstd") or 0) > 0)
            print(f"homesteaded (jv_hmstd>0): {homesteaded}")
        return 0

    ingest_lee_parcels()
    return 0


if __name__ == "__main__":
    sys.exit(main())
