import argparse
import sys

import dlt

from .resources import ingest_nfip_claims


def run():
    inv = dlt.pipeline(pipeline_name="tier1_inventory", destination="postgres", dataset_name="data_lake")
    print("Ingesting NFIP Claims...", flush=True)
    try:
        ingest_nfip_claims(inv)
    except Exception as exc:
        print(f"WARNING: NFIP Claims failed — {exc}. Skipping.", flush=True)
    print("FEMA pipeline complete.", flush=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="FEMA NFIP/NFHL ingest pipeline.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate only; skip dlt write.")
    args = parser.parse_args(argv)

    if args.dry_run:
        from .resources import _fetch_all_nfip_claims

        print("fema dry-run NFIP claims: fetching...", flush=True)
        claims = _fetch_all_nfip_claims()
        print(f"fema dry-run NFIP claims: {len(claims)} rows", flush=True)
        if claims:
            print("first row:", claims[0], flush=True)
        return 0

    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
