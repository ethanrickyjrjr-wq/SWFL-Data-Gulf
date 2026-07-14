import argparse
import sys

import dlt

from .resources import (
    noaa_ghcn_rainfall_resource,
    build_years,
    _fetch_year_coverage,
    STATUS_KEPT,
)


def run() -> None:
    years = build_years()
    print(f"noaa_ghcn_rainfall: ingesting years {years[0]}–{years[-1]} for SWFL anchor stations...")

    pipeline = dlt.pipeline(
        pipeline_name="noaa_ghcn_rainfall",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(noaa_ghcn_rainfall_resource(years))
    load_info.raise_on_failed_jobs()
    print("noaa_ghcn_rainfall pipeline complete.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="NOAA GHCN-Daily rainfall ingest pipeline.")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and validate only; skip dlt write.",
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        years = build_years()
        print(f"noaa_ghcn_rainfall dry-run: fetching {years[0]}–{years[-1]}...")
        landed = 0
        for year in years:
            coverage = _fetch_year_coverage(year)
            for rec in coverage:
                kept = rec["status"] == STATUS_KEPT
                landed += 1 if kept else 0
                print(
                    f"  {year} {rec['station_id']} {rec['station_name']!r:36} "
                    f"{'KEEP' if kept else 'DROP'}  status={rec['status']:28} "
                    f"day_count={rec['day_count']:>3} "
                    f"(rows_seen={rec['rows_seen']} qc_failed={rec['qc_failed']} "
                    f"missing={rec['missing_value']}) annual_in={rec['annual_in']}"
                )
        print(f"noaa_ghcn_rainfall dry-run: {landed} rows would land")
        return 0

    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
