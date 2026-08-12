"""Tier 2 dlt pipeline — collier_official_records.

Live-fetches cor.collierclerk.com's Document Search (all 37 doc types, no filter)
for a date range and merges normalized rows into
data_lake.collier_official_records on instrument_number. Default window is
YESTERDAY only, matching a daily cron — keeps each run to roughly one day's
volume (~400 documents / ~20 pages, well inside the safety ceiling), not an
ever-growing backfill.

No LLM calls in this pipeline (pure crawl4ai + parsing), so RunBudget does not
apply (ingest/CLAUDE.md's $1/run rule is for LLM-calling pipelines).
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta

import dlt

from .constants import TABLE_NAME
from .resources import collier_official_records_resource


def run_pipeline(start: date, end: date) -> None:
    pipeline = dlt.pipeline(
        pipeline_name=TABLE_NAME,
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(collier_official_records_resource(start, end))
    # House convention (lee_permits, fema, fdot, collier_parcels): without this,
    # dlt swallows a per-job failure into LoadInfo and the process exits 0 with a
    # half-written table.
    load_info.raise_on_failed_jobs()
    print(f"{TABLE_NAME} pipeline complete: {start.isoformat()}..{end.isoformat()}")


def _parse_date(raw: str) -> date:
    return date.fromisoformat(raw)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="collier_official_records pipeline.")
    parser.add_argument("--start", type=_parse_date, default=None, help="ISO date, default: yesterday")
    parser.add_argument("--end", type=_parse_date, default=None, help="ISO date, default: yesterday")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch + normalize the date range and report; skip the dlt write.",
    )
    args = parser.parse_args(argv)

    yesterday = date.today() - timedelta(days=1)
    start = args.start or yesterday
    end = args.end or yesterday

    if args.dry_run:
        from .resources import _fetch_and_normalize

        rows = _fetch_and_normalize(start, end)
        print(f"{TABLE_NAME} dry-run: {len(rows)} rows for {start.isoformat()}..{end.isoformat()}")
        if rows:
            print("first row:", rows[0])
        return 0

    run_pipeline(start, end)
    return 0


if __name__ == "__main__":
    sys.exit(main())
