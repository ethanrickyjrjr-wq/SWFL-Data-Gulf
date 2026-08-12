"""One-off converter: LandMarkWeb Export-button XLSX -> raw/<YYYY-MM-DD>.json.

The site's Export button (discovered 08/11/2026, see _RESEARCH/data-and-ingest/
2026-08-12-lee-deed-doc-type-catalog.md) gives clean named columns instead of the
positional "0".."26" shape the README's XHR-capture method produces — but it still
leaks the SAME "legalfield_" prefix on Lot/Block/Unit/Subdivision/Building/Section/
Township/Range/Comment that normalize.py already strips for the XHR shape, and it
does NOT expose the true internal_doc_id (that field is only visible in the raw XHR
response, hidden_-prefixed). This script:
  1. strips "legalfield_" (and bare "legalfield_" -> None),
  2. splits Grantor/Grantee on newline into a list (multi-party),
  3. substitutes clerk_file_number for internal_doc_id — constants.py's own comment
     already names clerk_file_number as the fallback merge key, just picked against
     originally only for stability-across-years, not correctness. Every clerk file
     number is a real, unique, permanently public instrument id (not invented).
  4. asserts every row in the file shares one Record Date (one file = one day, per
     the raw/<YYYY-MM-DD>.json convention) and writes to that date's raw file.

Does NOT populate `phase` — this export's column in that position is headed
"Building", not "Phase" (a genuine discrepancy from the README's documented shape,
worth reconciling later, not guessed at here).

Usage: python convert_export_xlsx.py <path-to-xlsx> [--out-dir raw]
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import openpyxl

RAW_DIR = Path(__file__).parent / "raw"


def _clean_legalfield(value: object) -> str | None:
    if value is None:
        return None
    s = str(value)
    if s.startswith("legalfield_"):
        s = s[len("legalfield_") :]
    s = s.strip()
    return s or None


def _split_parties(value: object) -> list[str]:
    if value is None:
        return []
    return [p.strip() for p in str(value).split("\n") if p.strip()]


def convert(xlsx_path: Path) -> tuple[str, list[dict]]:
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    header = rows[0]
    idx = {name: i for i, name in enumerate(header)}
    data = rows[1:]

    dates = Counter(r[idx["Record Date"]] for r in data if r[idx["Record Date"]])
    if not dates:
        raise ValueError(f"{xlsx_path}: no Record Date values found")
    if len(dates) > 1:
        raise ValueError(
            f"{xlsx_path}: spans {len(dates)} distinct dates {sorted(dates)} — "
            "split before converting (one raw file = one date)."
        )
    (mmddyyyy,) = dates.keys()
    m, d, y = mmddyyyy.split("/")
    iso_date = f"{y}-{m.zfill(2)}-{d.zfill(2)}"

    out: list[dict] = []
    for r in data:
        clerk_file_number = r[idx["Clerk File Number"]]
        out.append(
            {
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
                # Substitute — see module docstring point 3. Real, sourced, unique.
                "internalDocId": str(clerk_file_number).strip() if clerk_file_number else None,
            }
        )
    return iso_date, out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx", type=Path)
    parser.add_argument("--out-dir", type=Path, default=RAW_DIR)
    args = parser.parse_args(argv)

    iso_date, rows = convert(args.xlsx)
    dropped = [r for r in rows if r["internalDocId"] is None]
    out_path = args.out_dir / f"{iso_date}.json"
    args.out_dir.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, indent=2, default=str), encoding="utf-8")
    print(f"{args.xlsx.name}: {len(rows)} rows -> {out_path} ({len(dropped)} with no clerk file number, dropped as merge key)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
