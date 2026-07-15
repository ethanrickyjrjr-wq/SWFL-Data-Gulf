"""
MarketBeat PDF ingest pipeline.

Usage:
  # Process all PDFs in the drop folder
  python -m ingest.pipelines.marketbeat_pdf.pipeline

  # Process specific PDFs
  python -m ingest.pipelines.marketbeat_pdf.pipeline path/to/file.pdf ...

  # Dry-run (extract + print, no DB write)
  python -m ingest.pipelines.marketbeat_pdf.pipeline --dry-run

  # Try to auto-download new quarter then process
  python -m ingest.pipelines.marketbeat_pdf.pipeline --download 2025-Q4

  # Process PDFs from Downloads folder (useful for manual drops)
  python -m ingest.pipelines.marketbeat_pdf.pipeline --from-downloads
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from ingest.lib.api_usage import RunBudget, RunBudgetExceeded

from .extractor import (
    extract_pdf,
    quarter_from_filename,
    sector_from_filename,
    source_from_filename,
)
from .loader import already_loaded, upsert_rows

DROP_DIR = Path("ingest/drops/marketbeat_pdf")
DOWNLOADS_DIR = Path.home() / "Downloads"

_PDF_RE = re.compile(
    r"^(MarketBeat|Colliers)_(Industrial|MedicalOffice)_Q\d\d{4}_.*\.pdf$", re.IGNORECASE
)


def _find_pdfs(base_dir: Path) -> list[Path]:
    return sorted(
        p for p in base_dir.glob("*.pdf") if _PDF_RE.match(p.name)
    )


def process_pdf(pdf_path: Path, budget: RunBudget, dry_run: bool = False, force: bool = False) -> int:
    """
    Extract + upsert one PDF. Returns number of rows written (0 on skip).
    """
    try:
        quarter = quarter_from_filename(pdf_path)
        source = source_from_filename(pdf_path)
        # colliers_industrial PDFs hold multiple sectors in one file; source+quarter
        # is the right load unit there. cw_marketbeat is one sector per file, so
        # narrow the dedup check or a same-quarter Medical/Office PDF silently
        # no-ops once Industrial for that quarter is already loaded.
        sector = sector_from_filename(pdf_path) if source == "cw_marketbeat" else None
    except ValueError as e:
        print(f"[skip] {pdf_path.name}: {e}", flush=True)
        return 0

    if not force and not dry_run and already_loaded(source, quarter, sector):
        print(f"[skip] {source} {sector or ''} {quarter} already in DB", flush=True)
        return 0

    print(f"[extract] {pdf_path.name} -> {source} {quarter}", flush=True)
    try:
        rows = extract_pdf(pdf_path, budget)
    except ValueError as e:
        print(f"[error] {pdf_path.name}: {e}", file=sys.stderr, flush=True)
        return 0

    print(f"  {len(rows)} rows extracted", flush=True)
    n = upsert_rows(rows, dry_run=dry_run)
    if not dry_run:
        print(f"  {n} rows upserted -> data_lake.marketbeat_swfl", flush=True)
    return n


def run(args: argparse.Namespace) -> None:
    pdfs: list[Path] = []

    if args.files:
        pdfs = [Path(f) for f in args.files]
    elif args.from_downloads:
        pdfs = _find_pdfs(DOWNLOADS_DIR)
        print(f"Found {len(pdfs)} PDFs in {DOWNLOADS_DIR}", flush=True)
    elif args.download:
        from .downloader import try_download_colliers, try_download_cw
        DROP_DIR.mkdir(parents=True, exist_ok=True)
        quarter = args.download
        for fn in (try_download_colliers, try_download_cw):
            result = fn(quarter, DROP_DIR)
            if result:
                pdfs.append(result)
        if not pdfs:
            print(f"No PDFs auto-downloaded for {quarter}.", flush=True)
            sys.exit(1)
    else:
        pdfs = _find_pdfs(DROP_DIR)
        if not pdfs:
            # Also check Downloads as a convenience
            pdfs = _find_pdfs(DOWNLOADS_DIR)
            if pdfs:
                print(
                    f"Drop folder empty; found {len(pdfs)} PDFs in Downloads.",
                    flush=True,
                )

    if not pdfs:
        print("No MarketBeat/Colliers PDFs found to process.", flush=True)
        sys.exit(0)

    # Hard run budget (operator guard 07/05/2026, same pattern as city_pulse): the only
    # paid call left is the Haiku vision fallback (~2k tokens/page, fires only on scanned
    # pages), so quarterly runs structurally ceiling well under $1. Crossing it means the
    # run is misbehaving — abort loudly rather than silently drain the account.
    budget = RunBudget("marketbeat_pdf", default_usd=1.0, env_var="MARKETBEAT_PDF_MAX_USD")

    total = 0
    errors = 0
    for pdf in pdfs:
        try:
            n = process_pdf(pdf, budget, dry_run=args.dry_run, force=args.force)
            total += n
        except RunBudgetExceeded:
            raise  # blown budget kills the whole run — never continue to the next PDF
        except Exception as e:
            print(f"[error] {pdf.name}: {e}", file=sys.stderr, flush=True)
            errors += 1

    print(
        f"\nDone. {len(pdfs)} PDFs processed, {total} rows upserted, {errors} errors.",
        flush=True,
    )
    if errors:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="MarketBeat PDF ingest pipeline")
    parser.add_argument("files", nargs="*", help="Specific PDF file paths to process")
    parser.add_argument("--dry-run", action="store_true", help="Extract only, no DB write")
    parser.add_argument("--force", action="store_true", help="Re-process even if already loaded")
    parser.add_argument("--from-downloads", action="store_true", help="Scan ~/Downloads for PDFs")
    parser.add_argument(
        "--download",
        metavar="QUARTER",
        help="Auto-download + process a specific quarter, e.g. 2025-Q4",
    )
    run(parser.parse_args())


if __name__ == "__main__":
    main()
