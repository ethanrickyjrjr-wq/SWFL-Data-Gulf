"""Normalizer for lee_deed_official_records.

The raw/*.json files are ALREADY in the README's cleaned shape (camelCase keys,
prefixes stripped, multi-party fields split on the nameSeperator div). This module
only:
  1. snake_cases the keys (internalDocId -> internal_doc_id, ...),
  2. parses the two derived, load-bearing values the brain reads:
       - consideration_usd (NUMERIC) from the "$304,900.00" string,
       - record_date (DATE) from the "MM/DD/YYYY" string,
       - parcel_strap (TEXT) from legal_full — README calls this the join key into
         data_lake.lee_parcels,
  3. preserves grantors/grantees VERBATIM, including the literal "..." truncation
     marker the SOURCE emits past ~3 parties (README documents this as a real
     completeness gap — do NOT drop the marker, do NOT claim completeness).

No network, no dlt — pure functions, unit-tested in test_normalize.py.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any


# camelCase raw key -> snake_case column name. Every field the raw shape carries.
_KEY_MAP: dict[str, str] = {
    "status": "status",
    "considerationRaw": "consideration_raw",
    "grantors": "grantors",
    "grantees": "grantees",
    "recordDate": "record_date",
    "docType": "doc_type",
    "bookType": "book_type",
    "book": "book",
    "page": "page",
    "clerkFileNumber": "clerk_file_number",
    "legalFull": "legal_full",
    "lot": "lot",
    "block": "block",
    "unit": "unit",
    "subdivision": "subdivision",
    "phase": "phase",
    "section": "section",
    "township": "township",
    "range": "range",
    "internalDocId": "internal_doc_id",
}

# "Parcel 22-46-25-E4-10000.1700" — the STRAP embedded in legal_full (README idx 15).
_PARCEL_RE = re.compile(r"Parcel\s+([0-9A-Za-z][0-9A-Za-z.\-]+)", re.IGNORECASE)


def parse_consideration_usd(raw: str | None) -> float | None:
    """"$304,900.00" -> 304900.0 ; "" / None -> None. Strips $ and thousands commas."""
    if not raw:
        return None
    cleaned = re.sub(r"[^0-9.]", "", str(raw))
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_record_date(raw: str | None) -> date | None:
    """"07/16/2026" (MM/DD/YYYY) -> date(2026, 7, 16). Anything unparseable -> None.

    Never invent a date — a row with no parseable record date lands with a NULL
    content date (honest) rather than a fabricated one.
    """
    if not raw:
        return None
    m = re.match(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$", str(raw))
    if not m:
        return None
    month, day, year = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_parcel_strap(legal_full: str | None) -> str | None:
    """Extract the `Parcel XX-XX-XX-XX-XXXXX.XXXX` STRAP from the legal description.

    README idx 15: this is the join key into data_lake.lee_parcels. The parcel token
    can appear before OR after the plat description — the regex anchors on the literal
    "Parcel " label, so position does not matter. No parcel label -> None (many condo /
    metes-and-bounds legals carry none).
    """
    if not legal_full:
        return None
    m = _PARCEL_RE.search(str(legal_full))
    return m.group(1) if m else None


def _clean_list(value: Any) -> list[str]:
    """Grantor / grantee list — keep verbatim (INCLUDING the literal '...' marker)."""
    if not isinstance(value, list):
        return []
    return [str(v) for v in value]


def normalize_row(raw: dict[str, Any], source_file: str | None = None) -> dict[str, Any]:
    """One raw record -> one normalized row ready for the dlt merge.

    Returns keys exactly matching the DDL columns. record_source_file is audit-only
    provenance (which raw/<date>.json this row came from).
    """
    out: dict[str, Any] = {}
    for raw_key, col in _KEY_MAP.items():
        out[col] = raw.get(raw_key)

    # Lists preserved verbatim (source truncation "..." kept).
    out["grantors"] = _clean_list(raw.get("grantors"))
    out["grantees"] = _clean_list(raw.get("grantees"))

    # Derived, load-bearing.
    out["consideration_usd"] = parse_consideration_usd(raw.get("considerationRaw"))
    out["record_date"] = parse_record_date(raw.get("recordDate"))
    out["parcel_strap"] = parse_parcel_strap(raw.get("legalFull"))

    # Normalize internal_doc_id to a stripped string (it is the merge key).
    if out.get("internal_doc_id") is not None:
        out["internal_doc_id"] = str(out["internal_doc_id"]).strip() or None

    if source_file is not None:
        out["record_source_file"] = source_file
    return out
