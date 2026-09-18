"""Create the archive-root transport manifest consumed by Sol's history comparison."""
from __future__ import annotations

import argparse
from pathlib import Path

from ingest.lib.research_capture import write_combined_history_manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Combine immutable RSW and Census BPS captures without copying them.")
    parser.add_argument("--root", required=True, help="explicit SWFL_RESEARCH_ROOT archive directory")
    parser.add_argument("--from", dest="start", required=True, help="requested YYYY-MM start")
    parser.add_argument("--through", required=True, help="requested YYYY-MM end")
    parser.add_argument("--manifest", action="append", required=True, help="source manifest path; pass once per source")
    args = parser.parse_args(argv)
    path = write_combined_history_manifest(
        Path(args.root), requested_period={"from": args.start, "through": args.through}, source_manifests=args.manifest,
    )
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
