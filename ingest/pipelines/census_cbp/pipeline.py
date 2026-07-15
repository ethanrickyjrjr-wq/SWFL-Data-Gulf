import argparse
import sys

import dlt

from .resources import census_cbp_fl


def run():
    pipeline = dlt.pipeline(
        pipeline_name="census_cbp",
        # replace_strategy: dlt's postgres default empties this table before/while
        # inserting, with no atomic swap — a run killed mid-load leaves it empty.
        # "insert-from-staging" loads into staging first, swaps only on success. See
        # check fema_nfip_claims_data_loss_replace_strategy for the incident that
        # surfaced this across every dlt+postgres replace pipeline in this codebase.
        # The row-count/non-null volume guard for this replace resource (BIBLE §0.2
        # rule 5, ingest.lib.guards) lives in census_cbp_fl() in resources.py — it
        # runs to completion before this destructive write starts.
        destination=dlt.destinations.postgres(replace_strategy="insert-from-staging"),
        dataset_name="data_lake",
    )
    load_info = pipeline.run(census_cbp_fl())
    print(load_info)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Census CBP ingest pipeline.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate only; skip dlt write.")
    args = parser.parse_args(argv)

    if args.dry_run:
        print("census_cbp dry-run: fetching FL CBP data...")
        rows = list(census_cbp_fl())
        print(f"census_cbp dry-run: {len(rows)} rows")
        if rows:
            print("first row:", rows[0])
        return 0

    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
