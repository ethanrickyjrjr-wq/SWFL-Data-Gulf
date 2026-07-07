"""Raw-pool eviction: drop news_articles_swfl rows older than 45 days.
Lossless (see ingest/lib/pulse_lake.evict_stale_pool). --dry-run counts only.

  python -m ingest.pipelines.pulse_pool_evict --dry-run
  python -m ingest.pipelines.pulse_pool_evict
"""
from __future__ import annotations

import argparse
import sys

from ingest.lib.pulse_lake import evict_stale_pool

WINDOW_DAYS = 45


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--dry-run", action="store_true", help="Count only; delete nothing.")
    p.add_argument("--window-days", type=int, default=WINDOW_DAYS)
    args = p.parse_args(argv)
    n = evict_stale_pool(window_days=args.window_days, dry_run=args.dry_run)
    verb = "would evict" if args.dry_run else "evicted"
    print(f"pulse_pool_evict: {verb} {n} rows older than {args.window_days}d")
    return 0


if __name__ == "__main__":
    sys.exit(main())
