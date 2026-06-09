"""
MHS (Maxwell Hendry & Simmons) annual Data Book — Recipe 2: Issued Permits.

Extracts the "COMMERCIAL STATS — ISSUED PERMITS {year}" tables from the annual
MHS Market Trends PDF and returns structured permit rows.

PDF layout
----------
Multiple pages share a repeated header:
  COMMERCIAL STATS ◆ ISSUED PERMITS
  {YEAR}
  {Jurisdiction Name}
  Date | Asset Class | Project Address | Project Name | Permit Value | Building SF

A jurisdiction section can span two pages ("Continued"). Tables are extracted
via pdfplumber; malformed table cells fall back to regex text parsing.

Known URL pattern (update each March when the new book drops):
  https://mhsappraisal.com/wp-content/uploads/YYYY/MM/YYYY-Market-Trends-Report-Magazine-Version-All-Permits.pdf

Source: mhsappraisal.com (annual, published ~March)
Target table: data_lake.mhs_permits_swfl
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

import pdfplumber
import requests

# ── constants ────────────────────────────────────────────────────────────────

SOURCE_NAME = "mhs_databook"
SOURCE_URL_2026 = (
    "https://mhsappraisal.com/wp-content/uploads/2026/03/"
    "2026-Market-Trends-Report-Magazine-Version-All-Permits.pdf"
)

_PERMIT_HEADER_RE = re.compile(
    r"COMMERCIAL\s+STATS.*ISSUED\s+PERMITS", re.IGNORECASE
)
_YEAR_RE = re.compile(r"^\s*(\d{4})\s*$")
_CONTINUED_RE = re.compile(r"-\s*continued\s*$", re.IGNORECASE)
_DATE_RE = re.compile(r"^(\d{1,2})/(\d{2})$")
_DOLLAR_RE = re.compile(r"^\$[\d,]+$")
_VALUE_STRIP_RE = re.compile(r"[\$,]")

# Columns that define a table header row
_HEADER_COLS = {"date", "asset class", "project address", "project name", "permit value"}

# ── download ─────────────────────────────────────────────────────────────────


def download_pdf(url: str, timeout: int = 120) -> bytes:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.content


# ── ID generation ─────────────────────────────────────────────────────────────


def make_row_id(jurisdiction: str, issued_date: str, project_name: str, project_address: str) -> str:
    """Deterministic PK matching the DDL convention."""
    jslug = re.sub(r"[^a-z0-9]+", "_", jurisdiction.lower()).strip("_")
    digest = hashlib.md5(f"{project_name}|{project_address}".encode()).hexdigest()[:12]
    return f"{SOURCE_NAME}_{jslug}_{issued_date}_{digest}"


# ── value parsers ─────────────────────────────────────────────────────────────


def _parse_value(raw: str | None) -> float | None:
    if not raw:
        return None
    cleaned = _VALUE_STRIP_RE.sub("", raw).strip()
    if cleaned in ("", "Not Available"):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_sf(raw: str | None) -> int | None:
    if not raw:
        return None
    cleaned = raw.replace(",", "").strip()
    if cleaned in ("", "Not Available"):
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def _parse_date(mm_dd: str, year: int) -> str:
    """'MM/DD' → 'YYYY-MM-DD'."""
    mm, dd = mm_dd.strip().split("/")
    return f"{year}-{mm.zfill(2)}-{dd.zfill(2)}"


# ── table-row cleaning ────────────────────────────────────────────────────────


def _is_header_row(cells: list[str | None]) -> bool:
    cleaned = {(c or "").lower().strip() for c in cells}
    return bool(cleaned & _HEADER_COLS)


def _clean_cell(c: Any) -> str:
    if c is None:
        return ""
    return str(c).strip()


def _row_from_cells(cells: list[str | None], year: int, jurisdiction: str) -> dict | None:
    """Convert a raw pdfplumber table row to a permit dict. Returns None if not a data row."""
    # Strip empty / None entries that pdfplumber inserts for merged cells
    stripped = [_clean_cell(c) for c in cells if _clean_cell(c) != ""]
    if len(stripped) < 4:
        return None
    if _is_header_row(stripped):
        return None

    # Attempt structured parse: first non-empty cell should be MM/DD
    if not _DATE_RE.match(stripped[0]):
        # Sometimes the first cell is blank and date is cell[1]
        if len(stripped) >= 2 and _DATE_RE.match(stripped[1]):
            stripped = stripped[1:]
        else:
            # Could be a flat text row — fall through to text parser
            return None

    # stripped[0]=date, [1]=asset_class, [2]=address, [3]=name, then value/sf
    date_str = stripped[0]
    asset_class = stripped[1] if len(stripped) > 1 else None
    # Remaining cells: find value ($X) and sf (numeric)
    address = stripped[2] if len(stripped) > 2 else None
    name = stripped[3] if len(stripped) > 3 else None

    permit_value_raw = None
    building_sf_raw = None
    for cell in stripped[4:]:
        if _DOLLAR_RE.match(cell) and permit_value_raw is None:
            permit_value_raw = cell
        elif re.match(r"^[\d,]+$", cell) and building_sf_raw is None:
            building_sf_raw = cell
        elif cell == "Not Available":
            pass

    if not name:
        return None

    issued_date = _parse_date(date_str, year)
    return {
        "id": make_row_id(jurisdiction, issued_date, name, address or ""),
        "source_name": SOURCE_NAME,
        "jurisdiction": jurisdiction,
        "calendar_year": year,
        "issued_date": issued_date,
        "asset_class": asset_class,
        "project_address": address,
        "project_name": name,
        "permit_value_usd": _parse_value(permit_value_raw),
        "building_sf": _parse_sf(building_sf_raw),
        "verified": False,
        "source_url": SOURCE_URL_2026,
    }


# ── text-line fallback parser ─────────────────────────────────────────────────

_TEXT_ROW_RE = re.compile(
    r"^(\d{1,2}/\d{2})\s+"          # date MM/DD
    r"([A-Za-z][^$]+?)\s+"          # asset class (greedy-stop before $)
    r"(\d[^$]+?)\s+"                # address (starts with digit)
    r"([^$]+?)\s+"                  # project name
    r"(\$[\d,]+)"                   # permit value
    r"(?:\s+([\d,]+|Not Available))?$"  # optional building SF
)


def _parse_text_lines(text: str, year: int, jurisdiction: str) -> list[dict]:
    """Fallback: parse raw page text lines when table extraction fails."""
    rows = []
    for line in text.splitlines():
        line = line.strip()
        m = _TEXT_ROW_RE.match(line)
        if not m:
            continue
        date_str, ac, addr, name, pv, sf = m.groups()
        issued_date = _parse_date(date_str, year)
        rows.append({
            "id": make_row_id(jurisdiction, issued_date, name.strip(), addr.strip()),
            "source_name": SOURCE_NAME,
            "jurisdiction": jurisdiction,
            "calendar_year": year,
            "issued_date": issued_date,
            "asset_class": ac.strip() or None,
            "project_address": addr.strip() or None,
            "project_name": name.strip(),
            "permit_value_usd": _parse_value(pv),
            "building_sf": _parse_sf(sf),
            "verified": False,
            "source_url": SOURCE_URL_2026,
        })
    return rows


# ── jurisdiction detection ────────────────────────────────────────────────────

_KNOWN_JURISDICTIONS = {
    "Unincorporated Lee County",
    "City of Cape Coral",
    "City of Fort Myers",
    "City of Bonita Springs",
    "City of Sanibel",
    "Town of Fort Myers Beach",
    "Estero",
    "Unincorporated Collier",
    "City of Naples",
    "City of Marco Island",
    "Unincorporated Charlotte County",
    "City of Punta Gorda",
    "City of Immokalee",
    "City of Bonita Springs",
}


def _detect_jurisdiction(text: str) -> str | None:
    """
    Find the jurisdiction name from the section HEADER, not from address text.

    The PDF layout places the jurisdiction as an EXACT line immediately after
    the year line (before the column headers). We look for lines that are
    exact known jurisdiction names, or match the City/Town/Unincorporated
    pattern as a standalone line (no trailing address words).
    """
    # Strip the "- Continued" suffix before matching
    lines = [_CONTINUED_RE.sub("", ln).strip() for ln in text.splitlines()]
    # Exact match against known jurisdictions (case-insensitive)
    for line in lines:
        for jur in _KNOWN_JURISDICTIONS:
            if line.lower() == jur.lower():
                return jur
    # Generic heuristic: standalone line matching City/Town/Unincorporated pattern
    # Use \Z to anchor — rejects lines with trailing street numbers/names
    for line in lines:
        m = re.match(
            r"^((?:City|Town|Village)\s+of\s+[\w\s]{2,40}|Unincorporated\s+[\w\s]{2,30}County)$",
            line,
        )
        if m:
            candidate = m.group(1).strip()
            # Reject if the line looks like an address (contains digits)
            if not re.search(r"\d", candidate):
                return candidate
    return None


# ── page-level extraction ─────────────────────────────────────────────────────


def _is_permit_page(page_text: str) -> bool:
    return bool(_PERMIT_HEADER_RE.search(page_text))


def _extract_year(page_text: str) -> int | None:
    for line in page_text.splitlines():
        m = _YEAR_RE.match(line)
        if m:
            return int(m.group(1))
    return None


def _extract_page_rows(page, default_year: int, default_jurisdiction: str | None) -> tuple[list[dict], str | None, int]:
    """
    Extract permit rows from a single pdfplumber Page object.

    Returns (rows, jurisdiction_found, year_found).
    """
    text = page.extract_text() or ""
    if not _is_permit_page(text):
        return [], default_jurisdiction, default_year

    year = _extract_year(text) or default_year
    jurisdiction = _detect_jurisdiction(text) or default_jurisdiction

    rows: list[dict] = []
    # Try pdfplumber table extraction first
    tables = page.extract_tables()
    found_via_table = False
    for table in tables:
        for raw_row in table:
            row = _row_from_cells(raw_row, year, jurisdiction or "Unknown")
            if row:
                rows.append(row)
                found_via_table = True

    # If table extraction returned nothing useful, fall back to text parsing
    if not found_via_table:
        rows.extend(_parse_text_lines(text, year, jurisdiction or "Unknown"))

    # Handle "Continued" pages — jurisdiction carries over from previous page
    # (already handled via default_jurisdiction pass-through)

    return rows, jurisdiction, year


# ── public entry point ────────────────────────────────────────────────────────

# KNOWN LIMITATION (2026 cohort): pages that contain multiple jurisdiction
# sections (e.g. page 14: Naples / Marco Island / Charlotte / Punta Gorda)
# assign all rows on that page to whichever jurisdiction appears first in the
# header scan. For future annual drops, split the page text at each
# jurisdiction header boundary before extracting tables — see TODO below.
#
# TODO (next annual drop, ~March 2027):
#   1. In _extract_page_rows, scan text line-by-line for jurisdiction headers
#      and split the page into per-jurisdiction bands.
#   2. Crop page using pdfplumber's page.crop(bbox) per band, then extract
#      tables from each crop separately.
#   3. Re-run against the 2027 PDF and verify counts match the Data Book.
#
# The 2025 cohort (281 rows) was loaded from the hand-parsed PDF text, which
# correctly assigned all rows. The extractor is functional for single-
# jurisdiction pages and as a scaffold for the next drop.


def extract_from_pdf(pdf_bytes: bytes, source_url: str = SOURCE_URL_2026) -> list[dict[str, Any]]:
    """
    Extract all permit rows from an MHS Data Book PDF.

    Parameters
    ----------
    pdf_bytes : bytes
        Raw PDF content.
    source_url : str
        URL to stamp on every row.

    Returns
    -------
    list of dicts matching the data_lake.mhs_permits_swfl schema
    (minus _ingested_at, which the loader sets).
    """
    all_rows: list[dict] = []
    seen_ids: set[str] = set()

    with pdfplumber.open(__import__("io").BytesIO(pdf_bytes)) as pdf:
        current_jurisdiction: str | None = None
        current_year: int = 2025  # default; updated per page

        for page in pdf.pages:
            rows, jur, yr = _extract_page_rows(page, current_year, current_jurisdiction)
            current_jurisdiction = jur
            current_year = yr

            for row in rows:
                row["source_url"] = source_url
                if row["id"] not in seen_ids:
                    seen_ids.add(row["id"])
                    all_rows.append(row)

    return all_rows
