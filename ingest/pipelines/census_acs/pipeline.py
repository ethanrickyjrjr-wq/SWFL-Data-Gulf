import argparse
import sys

import dlt

from .resources import census_acs_zcta


def run():
    pipeline = dlt.pipeline(
        pipeline_name="census_acs",
        destination="postgres",
        dataset_name="data_lake",
    )
    load_info = pipeline.run(census_acs_zcta())
    print(load_info)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Census ACS 5-year ZCTA ingest pipeline.")
    parser.add_argument(
        "--dry-run", action="store_true", help="Fetch + validate only; skip dlt write."
    )
    args = parser.parse_args(argv)

    if args.dry_run:
        print("census_acs dry-run: fetching ACS 5-year ZCTA data for in-scope ZIPs...")
        rows = list(census_acs_zcta())
        print(f"census_acs dry-run: {len(rows)} rows")
        if rows:
            print("first row:", rows[0])
            populated = sum(1 for r in rows if r["median_household_income"] is not None)
            print(f"median_household_income populated: {populated}/{len(rows)}")
        return 0

    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
