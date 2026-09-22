import argparse
import sys

import dlt

from .resources import build_resources, collect_all_datasets


def run(data: dict[str, list[dict]]) -> None:
    pipeline = dlt.pipeline(
        pipeline_name="fdic_bankfind",
        # insert-from-staging: replace loads into staging and swaps only on success — a run killed
        # mid-load never leaves an empty table (check fema_nfip_claims_data_loss_replace_strategy).
        destination=dlt.destinations.postgres(replace_strategy="insert-from-staging"),
        dataset_name="data_lake",
    )
    print(pipeline.run(build_resources(data)))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="FDIC BankFind ingest (Lee/Collier/Hendry branches + deposits).")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate only; skip dlt write.")
    args = parser.parse_args(argv)

    data = collect_all_datasets()
    for name, rows in data.items():
        print(f"fdic_bankfind: {name} {len(rows):,} rows")
    if args.dry_run:
        print("fdic_bankfind dry-run: first sod row:", data["fdic_sod"][0] if data["fdic_sod"] else None)
        return 0
    run(data)
    return 0


if __name__ == "__main__":
    sys.exit(main())
