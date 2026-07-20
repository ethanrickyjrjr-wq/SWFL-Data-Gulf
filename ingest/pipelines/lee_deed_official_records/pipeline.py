"""Tier 2 dlt pipeline — lee_deed_official_records (LOAD half only).

Reads every human-captured raw/<YYYY-MM-DD>.json (see README — the FETCH is manual
because Akamai blocks unattended access) and merges them into
data_lake.lee_deed_official_records on internal_doc_id.

Idempotent: safe to run on a schedule even when no new raw file has landed since the
last run — it just re-merges what is already committed. See docs/standards/
pipeline-freshness.md and the Operation Dumbo Drop standard
(docs/superpowers/plans/2026-06-05-operation-dumbo-drop.md).
"""
from __future__ import annotations

import argparse
import sys

import dlt

from .constants import RAW_DIR, TABLE_NAME
from .resources import _read_raw_files, lee_deed_official_records_resource


def run_pipeline() -> None:
    pipeline = dlt.pipeline(
        pipeline_name=TABLE_NAME,
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(lee_deed_official_records_resource())
    # House convention (lee_permits, fema, fdot, collier_parcels): without this, dlt
    # swallows a per-job failure into LoadInfo and the process exits 0 with a
    # half-written table.
    load_info.raise_on_failed_jobs()
    print(f"{TABLE_NAME} pipeline complete.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="lee_deed_official_records LOAD pipeline.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Read + normalize the raw/*.json files and report; skip the dlt write.",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        rows = _read_raw_files(RAW_DIR)
        print(f"{TABLE_NAME} dry-run: {len(rows)} rows from {RAW_DIR}")
        if rows:
            print("first row:", rows[0])
        return 0

    run_pipeline()
    return 0


if __name__ == "__main__":
    sys.exit(main())
