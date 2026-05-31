import argparse
import sys

from .resources import fhfa_hpi_resource, _fetch_hpi_rows, _promote_hpi_to_tier2


def run():
    print("Ingesting FHFA HPI master (~133k records)...")
    _promote_hpi_to_tier2(_fetch_hpi_rows())
    print("FHFA HPI pipeline complete.")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="FHFA HPI ingest pipeline.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch and validate only; skip dlt write.")
    args = parser.parse_args(argv)

    if args.dry_run:
        print("fhfa dry-run: fetching FHFA HPI master...")
        rows = list(fhfa_hpi_resource())
        print(f"fhfa dry-run: {len(rows)} rows")
        if rows:
            print("first row:", rows[0])
        return 0

    run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
