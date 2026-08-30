"""Lee Planned Developments ingest — entry point.

    python -m ingest.pipelines.lee_planned_developments.pipeline [--dry-run]

--dry-run fetches, normalizes and reports (row count, drop count, status/category
spread) without touching storage or Postgres. The spatial join is a SEPARATE entry
point (spatial_join.py) so a boundary refresh and a re-assignment can run — and
fail — independently.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter

from .resources import archive_tier1, fetch_and_normalize, grant_and_reload, promote_to_tier2


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Lee Planned Developments boundary ingest.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and validate only; skip Tier-1 archive and dlt write.")
    args = parser.parse_args(argv)

    rows, features, dropped = fetch_and_normalize()
    print(f"lee_planned_developments: {len(features)} features fetched, "
          f"{len(rows)} rows normalized, {dropped} dropped (empty name / no geometry)")
    status = Counter(r["ims_status"] for r in rows)
    category = Counter(r["zoning_category"] for r in rows)
    print(f"  IMS_STATUS: {dict(status.most_common(6))}")
    print(f"  ZONING_CATEGORY (top): {dict(category.most_common(8))}")

    if args.dry_run:
        print("dry-run: skipping Tier-1 archive and Tier-2 write.")
        if rows:
            sample = {k: v for k, v in rows[0].items() if k != "geometry"}
            print("  sample row (geometry elided):", sample)
        return 0

    archive_tier1(features)
    promote_to_tier2(rows)
    grant_and_reload()
    print(f"lee_planned_developments: {len(rows)} rows merged into data_lake.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
