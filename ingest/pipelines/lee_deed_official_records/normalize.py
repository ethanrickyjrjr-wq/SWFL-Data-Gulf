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
  3. splits grantors/grantees into a party list PLUS an explicit completeness flag.

THE PARTY-LIST ELISION (measured 08/27/2026, all 22 committed raw/*.json):
The Lee Clerk grid caps a party list at TWO real names and appends a literal "..."
when the instrument has more parties. Stored verbatim, that reads downstream as a
complete two-party list plus a party literally named "..." — a WRONG fact, not a
missing one. Measured: 4,529 of 28,186 rows (16.07%) carry the marker on at least
one side (grantor 3,190 / grantee 1,563); 25.97% of the 5,353 DEED rows the
consuming pack serves. Every one of the 4,753 marked lists is exactly length 3 with
the marker LAST — the source never emits 3 real names, so the README's "more than
~3 parties" undercounts the loss: a THREE-party deed already loses a party.

So this module strips the marker and records the elision as `grantors_complete` /
`grantees_complete`. The transform is bijective — ["A","B","..."] <-> ["A","B"] +
complete=False — nothing is lost, and no bogus party named "..." ever ships.
Polarity is deliberate: `_complete` (not `_truncated`) so a consumer reading a NULL
or absent flag falls to "not complete" and stays conservative. Per-side (not one
`parties_truncated`) because the two sides are elided independently — 224 rows
carry the marker on BOTH, so a single flag would lose which side is short.

We still cannot RECOVER the missing names — the source never sent them. This makes
the loss legible; it does not fill it.

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


# The exact string the Lee Clerk grid appends when it elides a party list. Matched on
# EXACT equality after .strip() — never endswith("..."), which would eat a real party
# name that happens to end in dots (e.g. "SMITH ET AL...").
ELISION_MARKER = "..."


def split_parties(value: Any) -> tuple[list[str], bool]:
    """Party list -> (names WITHOUT the elision marker, list_is_complete).

    Returns (names, True) for any list the source gave in full, and (names, False)
    when the source elided it. A non-list (None, missing key) is ([], True):
    nothing was elided, there is simply nothing there — distinct from an elided list.
    """
    if not isinstance(value, list):
        return [], True
    names: list[str] = []
    complete = True
    for v in value:
        s = str(v)
        if s.strip() == ELISION_MARKER:
            complete = False
            continue
        names.append(s)
    return names, complete


def normalize_row(raw: dict[str, Any], source_file: str | None = None) -> dict[str, Any]:
    """One raw record -> one normalized row ready for the dlt merge.

    Returns keys exactly matching the DDL columns. record_source_file is audit-only
    provenance (which raw/<date>.json this row came from).
    """
    out: dict[str, Any] = {}
    for raw_key, col in _KEY_MAP.items():
        out[col] = raw.get(raw_key)

    # Party lists: marker stripped, elision recorded explicitly. A consumer that
    # ignores the flag now sees a SHORTER list rather than a fabricated party named
    # "..." — and one that reads it cannot mistake an elided list for a complete one.
    out["grantors"], out["grantors_complete"] = split_parties(raw.get("grantors"))
    out["grantees"], out["grantees_complete"] = split_parties(raw.get("grantees"))

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
