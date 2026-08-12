"""Normalizer for collier_official_records — parses one <tr> from the Document
Search results grid (a Telerik/Kendo Blazor grid, cor.collierclerk.com) into a
flat dict ready for the dlt merge.

Column order (confirmed live 08/12/2026, matches the grid's own <th> header text
Party Names / Recorded / Doc Type / Instrument / Book / Page / #Pgs /
Legal Description/Comments / Parcel IDs):
  0 checkbox (ignored) · 1 party names · 2 recorded date · 3 doc type ·
  4 instrument · 5 book · 6 page · 7 #pgs · 8 legal description · 9 parcel ids

No network, no dlt — pure functions on a BeautifulSoup Tag, unit-tested in
test_normalize.py against REAL captured markup (not invented shape).
"""
from __future__ import annotations

import re
from typing import Any, Optional

from bs4.element import Tag


def parse_party_names(td: Tag) -> tuple[list[str], list[str]]:
    """Each party is its own <span>F: NAME</span> or <span>T: NAME</span> sibling,
    separated by <br/>. Reading spans directly (not td.get_text()) is the fix for
    the real bug this parser exists to avoid: flattening multiple stacked spans
    with get_text(strip=True) concatenates them with no separator
    ("F: NAMEF: NAME2T: NAME3"), which is unparseable.
    """
    grantors: list[str] = []
    grantees: list[str] = []
    for span in td.find_all("span"):
        text = span.get_text(strip=True)
        if text.startswith("F:"):
            grantors.append(text[2:].strip())
        elif text.startswith("T:"):
            grantees.append(text[2:].strip())
    return grantors, grantees


def parse_record_date(raw: Optional[str]) -> Optional[str]:
    """"08/12/2026" (MM/DD/YYYY) -> "2026-08-12" (ISO). Unparseable -> None.

    Never invent a date — an unparseable cell lands with a NULL content date
    rather than a fabricated one (same discipline as Lee's parse_record_date).
    """
    if not raw:
        return None
    m = re.match(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$", str(raw))
    if not m:
        return None
    month, day, year = m.group(1), m.group(2), m.group(3)
    try:
        month_i, day_i = int(month), int(day)
        if not (1 <= month_i <= 12 and 1 <= day_i <= 31):
            return None
    except ValueError:
        return None
    return f"{year}-{month.zfill(2)}-{day.zfill(2)}"


def parse_book_page(td: Tag) -> tuple[Optional[str], Optional[str]]:
    """<div><span>OR-</span>6619</div> -> ("OR", "6619"). Splits the book-type
    prefix (mirrors Lee's book_type/book column split) from the numeric book. A
    book cell with no prefix span returns (None, <full text>)."""
    div = td.find("div") or td
    span = div.find("span")
    full_text = div.get_text(strip=True)
    if span is None:
        return None, full_text or None
    span_text = span.get_text(strip=True)
    book_type = span_text.rstrip("-").strip() or None
    book = full_text[len(span_text):].strip() or None
    return book_type, book


def _cell_text(td: Optional[Tag]) -> Optional[str]:
    if td is None:
        return None
    text = td.get_text(strip=True)
    return text or None


def _parse_int(raw: Optional[str]) -> Optional[int]:
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _parse_parcel_ids(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    return [p for p in re.split(r"[,\s;]+", raw.strip()) if p]


def normalize_row(tr: Tag) -> dict[str, Any]:
    """One <tr> -> one normalized row. Column positions per the module docstring."""
    tds = tr.find_all("td")
    if len(tds) < 10:
        raise ValueError(f"collier_official_records: expected 10 <td> cells, got {len(tds)}")

    grantors, grantees = parse_party_names(tds[1])
    book_type, book = parse_book_page(tds[5])

    return {
        "instrument_number": _cell_text(tds[4]),
        "record_date": parse_record_date(_cell_text(tds[2])),
        "doc_type": _cell_text(tds[3]),
        "book_type": book_type,
        "book": book,
        "page": _cell_text(tds[6]),
        "page_count": _parse_int(_cell_text(tds[7])),
        "grantors": grantors,
        "grantees": grantees,
        "legal_description": _cell_text(tds[8]),
        "parcel_ids": _parse_parcel_ids(_cell_text(tds[9])),
    }
