"""
Lee & Associates SWFL market report PDF extractor.

Target: quarterly Fort Myers market reports (Office, Retail, Industrial, Multifamily).
Each PDF is 2 pages and contains a "MARKET INDICATORS" block with 5 quarters of data.

PDF URL pattern (verify each quarter):
  https://www.lee-associates.com/wp-content/uploads/YYYY/MM/YYYY-Q{n}-Fort-Myers-FL-{Sector}.pdf

Gap this fills: C&W MarketBeat SWFL covers Industrial only;
Lee & Associates is the primary public source for Fort Myers Office, Retail,
and Multifamily market stats.

Source: lee-associates.com (quarterly, published ~4–6 weeks after quarter-end)
Target table: data_lake.marketbeat_swfl (source_name='lee_associates')
"""

from __future__ import annotations

import re
from typing import Any

import pdfplumber
import requests

# ── known URL pattern ────────────────────────────────────────────────────────

SECTORS = ["Office", "Retail", "Industrial", "Multifamily"]
URL_TEMPLATE = (
    "https://www.lee-associates.com/wp-content/uploads/{yyyy}/{mm:02d}/"
    "{yyyy}-Q{q}-Fort-Myers-FL-{sector}.pdf"
)
SOURCE_NAME = "lee_associates"

# ── numeric helpers ───────────────────────────────────────────────────────────

_STRIP_RE = re.compile(r"[\$,%]")
_PAREN_RE = re.compile(r"\(([0-9,]+)\)")


def _parse_num(raw: str | None) -> float | None:
    if not raw:
        return None
    raw = raw.strip()
    neg = _PAREN_RE.match(raw)
    if neg:
        return -float(neg.group(1).replace(",", ""))
    cleaned = _STRIP_RE.sub("", raw).replace(",", "").strip()
    if cleaned in ("", "-", "N/A"):
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


# ── MARKET INDICATORS parser ──────────────────────────────────────────────────

_INDICATOR_NAMES = {
    "12 Mo. Net Absorption SF": "absorption_sqft",
    "Qtrly Net Absorption SF": "absorption_sqft",
    "12 Mo. Absorption Units": "absorption_sqft",
    "Vacancy Rate": "vacancy_rate",
    "Avg NNN Asking Rent PSF": "asking_rent_nnn",
    "Avg NNN Asking Rate PSF": "asking_rent_nnn",
    "Asking Rent/Unit": "asking_rent_mf",
    "Sale Price PSF": "sale_price_psf",
    "Sale Price/Unit": "sale_price_psf",
    "Cap Rate": "cap_rate",
    "Under Construction": "under_construction",
    "Under Construction SF": "under_construction",
    "Under Construction Units": "under_construction",
    "Inventory": "inventory_sf",
    "Inventory SF": "inventory_sf",
    "Inventory Units": "inventory_sf",
}

# Quarter labels appear as "Q1 2026" in the header row
_QTR_RE = re.compile(r"Q(\d)\s+(\d{4})")

# Token extractors per value format — used instead of whitespace-split because
# the PDF text has single spaces between column values, not multi-space.
_PCT_TOKEN = re.compile(r"\d[\d.]*%")          # e.g. 6.05%
_DOLLAR_TOKEN = re.compile(r"\$[\d,.]+")       # e.g. $27.74
_PAREN_TOKEN = re.compile(r"\([0-9,]+\)")      # e.g. (243,083)
_INT_TOKEN = re.compile(r"\b\d[\d,]*\b")       # e.g. 114,119

def _extract_tokens(col: str, remainder: str) -> list[str]:
    """Extract N numeric tokens from remainder using the format known for col."""
    if col in ("vacancy_rate", "cap_rate"):
        return _PCT_TOKEN.findall(remainder)
    if col in ("asking_rent_nnn", "asking_rent_mf", "sale_price_psf"):
        return _DOLLAR_TOKEN.findall(remainder)
    # absorption_sqft, under_construction, inventory_sf: mix of parens + plain ints
    tokens: list[str] = []
    pos = 0
    while pos < len(remainder):
        pm = _PAREN_TOKEN.search(remainder, pos)
        im = _INT_TOKEN.search(remainder, pos)
        if pm and (not im or pm.start() <= im.start()):
            tokens.append(pm.group())
            pos = pm.end()
        elif im:
            tokens.append(im.group())
            pos = im.end()
        else:
            break
    return tokens


def _parse_indicator_block(text: str, sector: str) -> list[dict[str, Any]]:
    """
    Parse the MARKET INDICATORS table from raw page text.
    Returns one dict per quarter column (5 quarters max).
    """
    lines = text.splitlines()
    # Find the header line: "MARKET INDICATORS  Q1 2026  Q4 2025 ..."
    header_idx = None
    quarters: list[str] = []
    for i, line in enumerate(lines):
        if "MARKET INDICATORS" in line:
            header_idx = i
            for m in _QTR_RE.finditer(line):
                quarters.append(f"{m.group(2)}-Q{m.group(1)}")
            break
    if header_idx is None or not quarters:
        return []

    # Initialize one dict per quarter
    records: list[dict[str, Any]] = [{
        "source_name": SOURCE_NAME,
        "submarket": "Fort Myers",
        "sector": sector.lower(),
        "quarter": q,
        "geographic_type": "market",
        "report_label": "Fort Myers, FL",
        "verified": False,
    } for q in quarters]

    # Parse metric lines until a non-metric line is hit
    for line in lines[header_idx + 1:]:
        line_clean = line.strip()
        if not line_clean:
            continue
        # Stop at the chart/chart header lines
        if any(kw in line_clean for kw in ("NET ABSORPTION", "TOP SALE", "TOP LEASE", "UNDER CONSTRUCTION")):
            break

        # Match indicator names
        matched_key = None
        for indicator, col in _INDICATOR_NAMES.items():
            # Strip leading bullet char
            text_stripped = re.sub(r"^[^\w]+", "", line_clean)
            if text_stripped.startswith(indicator):
                matched_key = col
                remainder = text_stripped[len(indicator):].strip()
                tokens = _extract_tokens(col, remainder)
                for idx, tok in enumerate(tokens[:len(quarters)]):
                    n = _parse_num(tok.strip())
                    if n is not None:
                        records[idx][matched_key] = n
                break

    # Build IDs
    for rec in records:
        rec["id"] = f"{SOURCE_NAME}_{rec['sector']}_{rec['submarket']}_{rec['quarter']}"

    return records


# ── download + extract ────────────────────────────────────────────────────────


def download_pdf(url: str, timeout: int = 60) -> bytes:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.content


def extract_from_pdf(pdf_bytes: bytes, sector: str) -> list[dict[str, Any]]:
    """
    Extract quarterly market indicators from a Lee & Associates Fort Myers PDF.

    Parameters
    ----------
    pdf_bytes : bytes
    sector : str
        e.g. "Office", "Retail", "Industrial", "Multifamily"

    Returns
    -------
    list of dicts — one per quarter; map onto data_lake.marketbeat_swfl columns.
    """
    import io
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        # Page 1 contains the market indicators
        text = pdf.pages[0].extract_text(x_tolerance=3, y_tolerance=3) or ""
    return _parse_indicator_block(text, sector)


def extract_all_sectors(year: int, quarter: int, month: int = 4) -> list[dict[str, Any]]:
    """
    Download and extract all 4 sector PDFs for a given quarter.

    Usage
    -----
        rows = extract_all_sectors(year=2026, quarter=1, month=4)
    """
    all_rows: list[dict] = []
    for sector in SECTORS:
        url = URL_TEMPLATE.format(yyyy=year, mm=month, q=quarter, sector=sector)
        print(f"  Downloading {sector}: {url}")
        pdf_bytes = download_pdf(url)
        rows = extract_from_pdf(pdf_bytes, sector)
        print(f"    → {len(rows)} quarters extracted")
        all_rows.extend(rows)
    return all_rows
