"""Sweep every LandMarkWeb Export-button XLSX in Downloads, union by date into
raw/<YYYY-MM-DD>.json, never losing a row already captured (on disk or in any
export file, capped or not, single-day or multi-day).

Why a sweep instead of one-file-at-a-time: files arrive with an unpredictable
filename (browser autosave, no control over order or duplicates), and a
multi-day file can be capped mid-range (the export truncates at 2,000 rows).
Unioning by clerk_file_number, across every file for a given date plus
whatever is already in raw/, is the only way to not silently drop a row a
later, better file *would* have covered as well as an earlier partial one.

Usage: python sync_all_exports.py [--downloads DIR] [--out-dir raw]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

from convert_export_xlsx import _clean_legalfield, _split_parties

RAW_DIR = Path(__file__).parent / "raw"
DEFAULT_DOWNLOADS = Path.home() / "Downloads"


def _row_to_raw(r: tuple, idx: dict[str, int]) -> dict:
    clerk_file_number = r[idx["Clerk File Number"]]
    return {
        "status": r[idx["Status"]],
        "considerationRaw": r[idx["Consideration"]],
        "grantors": _split_parties(r[idx["Grantor"]]),
        "grantees": _split_parties(r[idx["Grantee"]]),
        "recordDate": r[idx["Record Date"]],
        "docType": r[idx["Doc Type"]],
        "bookType": r[idx["Book Type"]],
        "book": r[idx["Book"]],
        "page": r[idx["Page"]],
        "clerkFileNumber": clerk_file_number,
        "legalFull": r[idx["Legal"]],
        "lot": _clean_legalfield(r[idx["Lot"]]),
        "block": _clean_legalfield(r[idx["Block"]]),
        "unit": _clean_legalfield(r[idx["Unit"]]),
        "subdivision": _clean_legalfield(r[idx["Subdivision"]]),
        "section": _clean_legalfield(r[idx["Section"]]),
        "township": _clean_legalfield(r[idx["Township"]]),
        "range": _clean_legalfield(r[idx["Range"]]),
        "internalDocId": str(clerk_file_number).strip() if clerk_file_number else None,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--downloads", type=Path, default=DEFAULT_DOWNLOADS)
    parser.add_argument("--out-dir", type=Path, default=RAW_DIR)
    args = parser.parse_args(argv)

    files = sorted(args.downloads.glob("_ExportResults_*.xlsx"))
    if not files:
        print(f"no _ExportResults_*.xlsx found under {args.downloads}")
        return 1

    # iso_date -> {clerk_file_number: raw_row}
    by_date: dict[str, dict[str, dict]] = defaultdict(dict)
    no_key_count = 0
    file_report: list[str] = []

    for path in files:
        try:
            wb = openpyxl.load_workbook(path, data_only=True)
        except Exception as e:  # noqa: BLE001 — report and keep going
            file_report.append(f"{path.name}: FAILED TO OPEN ({e})")
            continue
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        header = rows[0]
        idx = {name: i for i, name in enumerate(header)}
        data = rows[1:]
        dates_in_file: set[str] = set()
        for r in data:
            mmddyyyy = r[idx["Record Date"]]
            if not mmddyyyy:
                continue
            m, d, y = str(mmddyyyy).split("/")
            iso = f"{y}-{m.zfill(2)}-{d.zfill(2)}"
            dates_in_file.add(iso)
            raw = _row_to_raw(r, idx)
            key = raw["internalDocId"]
            if key:
                by_date[iso][key] = raw
            else:
                no_key_count += 1
        file_report.append(f"{path.name}: {len(data)} rows, dates {sorted(dates_in_file)}")

    # Union in whatever is already on disk for each date (never lose prior data).
    args.out_dir.mkdir(parents=True, exist_ok=True)
    for existing in args.out_dir.glob("*.json"):
        iso = existing.stem
        try:
            prior = json.loads(existing.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        if not isinstance(prior, list):
            continue
        bucket = by_date[iso]  # touches defaultdict even if file had no new rows for this date
        for raw in prior:
            key = raw.get("internalDocId")
            if key and key not in bucket:
                bucket[key] = raw

    written = []
    for iso, bucket in sorted(by_date.items()):
        out_path = args.out_dir / f"{iso}.json"
        out_path.write_text(json.dumps(list(bucket.values()), indent=2, default=str), encoding="utf-8")
        written.append((iso, len(bucket)))

    print("\n".join(file_report))
    print()
    print(f"{no_key_count} rows dropped (no clerk file number to key on)")
    print(f"wrote {len(written)} date files:")
    for iso, n in written:
        print(f"  {iso}: {n} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
