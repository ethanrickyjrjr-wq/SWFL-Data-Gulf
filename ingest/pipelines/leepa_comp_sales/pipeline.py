"""LeePA layer 23 "Comparable Sales" ingest entrypoint.

  python -m ingest.pipelines.leepa_comp_sales.pipeline            # full run
  python -m ingest.pipelines.leepa_comp_sales.pipeline --dry-run  # fetch + guard, no write
"""
import argparse
import sys

from .resources import ingest_leepa_comp_sales


def _dry_run() -> int:
    """Fetch, normalize and run every guard — then stop before the write.

    A real dry run, not a smoke test: it exercises the same pagination, the same
    normalizer and the same non-null guards the live run uses, so a vendor field
    rename fails here instead of on the annual cron.
    """
    from ingest.lib.arcgis_paginator import arcgis_count

    from .constants import LEEPA_COMP_SALES_URL
    from .resources import _assert_shape, _normalize, fetch_comp_sales

    print("leepa_comp_sales dry-run: fetching layer 23...", flush=True)
    raw = fetch_comp_sales()
    canonical = arcgis_count(LEEPA_COMP_SALES_URL)
    print(f"leepa_comp_sales dry-run: {len(raw):,} rows fetched / {canonical:,} canonical", flush=True)
    if not raw:
        print("leepa_comp_sales dry-run: 0 rows — source returned nothing", flush=True)
        return 1

    normalized = [_normalize(r) for r in raw]
    print("first raw row:", raw[0], flush=True)
    print("first normalized row:", normalized[0], flush=True)

    distinct_ids = len({r["comp_id"] for r in normalized})
    print(
        f"comp_id uniqueness: {distinct_ids:,} distinct / {len(normalized):,} rows "
        f"({len(normalized) - distinct_ids:,} collapse on merge)",
        flush=True,
    )
    _assert_shape(normalized)
    print("leepa_comp_sales dry-run: all guards passed; no rows written.", flush=True)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="LeePA comparable sales (layer 23) ingest pipeline.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch, normalize and guard only; skip dlt write.")
    args = parser.parse_args(argv)

    if args.dry_run:
        return _dry_run()

    ingest_leepa_comp_sales()
    return 0


if __name__ == "__main__":
    sys.exit(main())
