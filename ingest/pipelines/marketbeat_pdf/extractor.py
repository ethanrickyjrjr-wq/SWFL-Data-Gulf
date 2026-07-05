"""
PDF text extractor for SWFL CRE broker market reports.

Supported sources:
  - Cushman & Wakefield MarketBeat Industrial (Fort Myers / Naples)
    filename pattern: MarketBeat_Industrial_Q{n}{YYYY}_*.pdf
  - Colliers International Industrial (Southwest Florida)
    filename pattern: Colliers_Industrial_Q{n}{YYYY}_*.pdf

Strategy: PyMuPDF text extraction + custom text parsers.
Both source PDFs are text-based — no OCR/vision needed.
Anthropic vision fallback fires only when page text is shorter than
MIN_TEXT_CHARS (likely an image-scanned page).
"""

from __future__ import annotations

import re
import base64
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF

try:
    import anthropic as _anthropic

    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _ANTHROPIC_AVAILABLE = False

# ──────────────────────────────────────────────────────────────────────────────
# Quarter / filename helpers
# ──────────────────────────────────────────────────────────────────────────────

_Q_RE = re.compile(r"Q(\d)(\d{4})", re.IGNORECASE)


def quarter_from_filename(path: Path) -> str:
    """
    Extract quarter string from PDF filename.
    'MarketBeat_Industrial_Q42025_FortMyers_Naples.pdf' → '2025-Q4'
    """
    m = _Q_RE.search(path.name)
    if not m:
        raise ValueError(f"Cannot parse quarter from filename: {path.name}")
    return f"{m.group(2)}-Q{m.group(1)}"


def source_from_filename(path: Path) -> str:
    name = path.name.lower()
    if name.startswith("marketbeat"):
        return "cw_marketbeat"
    if name.startswith("colliers"):
        return "colliers_industrial"
    raise ValueError(f"Unrecognised source prefix in filename: {path.name}")


# ──────────────────────────────────────────────────────────────────────────────
# Numeric helpers
# ──────────────────────────────────────────────────────────────────────────────

_STRIP_RE = re.compile(r"[\s,$]")


def _to_float(raw: str) -> float | None:
    cleaned = raw.strip()
    if cleaned in ("", "---", "N/A"):
        return None
    # Handle range format "$6.00 - $9.00" or "6.00 - 9.00" → midpoint
    if " - " in cleaned:
        parts = [_to_float(p) for p in cleaned.split(" - ", 1)]
        if parts[0] is not None and parts[1] is not None:
            return (parts[0] + parts[1]) / 2
    cleaned = _STRIP_RE.sub("", cleaned)
    try:
        return float(cleaned.rstrip("%"))
    except ValueError:
        return None


def _to_int(raw: str) -> int | None:
    f = _to_float(raw)
    return None if f is None else int(round(f))


# ──────────────────────────────────────────────────────────────────────────────
# C&W MarketBeat parser
# ──────────────────────────────────────────────────────────────────────────────

# All valid C&W submarket names as they appear in the PDF text.
# Maintained in sync with refinery/lib/marketbeat-submarket-aliases.mts.
_CW_SUBMARKETS: set[str] = {
    "Charlotte County",
    "Bonita Springs",
    "Cape Coral",
    "Estero",
    "City of Fort Myers",
    "South Fort Myers",
    "North Fort Myers",
    "Lehigh Acres",
    "The Islands",
    "East Naples",
    "North Naples",
    "Naples",
    "Marco Island",
    "Lely",
    "Outlying Collier County",
    "Golden Gate",
    # Future-proof aliases — ignored if not in alias file
    "Fort Myers",
    "Punta Gorda",
}

# Token patterns that are data values (not submarket names)
_VALUE_LIKE = re.compile(
    r"^(-?\d[\d,]*(%|\s*SF)?|---|\$\d[\d,.]*|\d+\.\d+%?|\d+%)$"
)

# County total / overall rows — skip (derived rows)
_SKIP_RE = re.compile(
    r"^[A-Z][A-Z\s]+TOTAL$|^SOUTHWEST FLORIDA TOTALS?$|^[A-Z\s]+COUNTY\s+TOTAL$"
)

_CW_HEADER_SENTINEL = "NET RENT (W/D)"


def _parse_cw_text(text: str, quarter: str) -> list[dict[str, Any]]:
    """
    Parse C&W MarketBeat page text into a list of row dicts.
    Columns (10 values per submarket, in order):
      inventory_sf, vacant_sf, vacancy_rate, absorption_current,
      absorption_ytd, under_construction, completions,
      rent_mf, rent_os, rent_wd
    """
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    # Find where actual data starts (after the last header column)
    try:
        start = max(i for i, ln in enumerate(lines) if _CW_HEADER_SENTINEL in ln) + 1
    except ValueError:
        return []

    rows: list[dict[str, Any]] = []
    i = start
    while i < len(lines):
        token = lines[i]

        if _SKIP_RE.match(token):
            i += 1
            continue

        # Stop once we reach the SW Florida totals line (data ends here)
        if "SOUTHWEST FLORIDA TOTAL" in token:
            break

        # Only process known submarket names — unknown tokens are skipped
        if token.rstrip() not in _CW_SUBMARKETS or _VALUE_LIKE.match(token):
            i += 1
            continue

        # Collect 10 value tokens following the submarket name
        vals: list[str] = []
        j = i + 1
        while j < len(lines) and len(vals) < 10:
            t = lines[j].strip()
            # Stop if we hit another submarket name or skip row
            if t in _CW_SUBMARKETS or _SKIP_RE.match(t):
                break
            vals.append(t)
            j += 1

        if len(vals) < 8:
            i += 1
            continue

        # Pad to 10 if short (older PDFs may omit MF/OS rent columns)
        while len(vals) < 10:
            vals.append("---")

        submarket = token.rstrip()
        rows.append(
            {
                "source_name": "cw_marketbeat",
                "sector": "industrial",
                "submarket": submarket,
                "quarter": quarter,
                "inventory_sf": _to_int(vals[0]),
                "vacancy_rate": _to_float(vals[2]),
                "absorption_sqft": _to_int(vals[3]),
                "ytd_absorption_sqft": _to_int(vals[4]),
                "under_construction": _to_int(vals[5]),
                "deliveries": _to_int(vals[6]),
                "asking_rent_mf": _to_float(vals[7]),
                "asking_rent_os": _to_float(vals[8]),
                "asking_rent_nnn": _to_float(vals[9]),
                "geographic_type": "submarket",
            }
        )
        i = j  # advance past consumed tokens

    return rows


# ──────────────────────────────────────────────────────────────────────────────
# Colliers parser
# ──────────────────────────────────────────────────────────────────────────────

# The 6 Colliers submarket names as they appear in the PDF.
_COLLIERS_SUBMARKETS: set[str] = {
    "Charlotte County",
    "Cape Coral/N. Fort Myers",
    "Lehigh",
    "Fort Myers",
    "Bonita/Estero",
    "Naples",
}

_COLLIERS_SECTORS: set[str] = {"Industrial", "Flex", "Total", "Overall"}
_COLLIERS_FOOTER = "Southwest Florida Submarket Breakdown"
# Header sentinel variants across Colliers report generations
_COLLIERS_HEADER_VARIANTS = ("AVG DIRECT", "Avg Direct", "Average Direct")


def _parse_colliers_text(text: str, quarter: str) -> list[dict[str, Any]]:
    """
    Parse Colliers Southwest Florida Industrial stats page.
    Columns per sector row (9 values):
      bldgs, inventory_sf, direct_vac%, total_vac%,
      net_abs_current, net_abs_ytd, deliveries,
      under_construction, asking_rate_nnn
    Only Industrial and Flex rows are stored (Total/Overall is derived).
    Handles multiple report layout generations (2022–2025).
    """
    # Normalize line-wrapped submarket names (older PDFs wrap long names)
    text = re.sub(r"Cape Coral/\s*\n\s*N\.?\s*Fort Myers", "Cape Coral/N. Fort Myers", text)

    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    # Find data start: after the header sentinel (case-varies by generation)
    start = None
    for sentinel in _COLLIERS_HEADER_VARIANTS:
        idxs = [i for i, ln in enumerate(lines) if sentinel in ln]
        if idxs:
            start = max(idxs) + 1
            break
    if start is None:
        return []

    rows: list[dict[str, Any]] = []
    i = start
    current_submarket: str | None = None

    while i < len(lines):
        token = lines[i]

        if _COLLIERS_FOOTER in token:
            break

        if token in _COLLIERS_SUBMARKETS:
            current_submarket = token
            i += 1
            continue

        if token in _COLLIERS_SECTORS and current_submarket is not None:
            sector = token.lower()
            vals: list[str] = []
            j = i + 1
            while j < len(lines) and len(vals) < 9:
                t = lines[j].strip()
                if t in _COLLIERS_SUBMARKETS or t in _COLLIERS_SECTORS or _COLLIERS_FOOTER in t:
                    break
                vals.append(t)
                j += 1

            if sector not in ("total", "overall") and len(vals) >= 8:
                while len(vals) < 9:
                    vals.append("---")

                rows.append(
                    {
                        "source_name": "colliers_industrial",
                        "sector": sector,
                        "submarket": current_submarket,
                        "quarter": quarter,
                        "inventory_sf": _to_int(vals[1]),
                        "vacancy_rate": _to_float(vals[3]),  # total vacancy %
                        "absorption_sqft": _to_int(vals[4]),
                        "ytd_absorption_sqft": _to_int(vals[5]),
                        "deliveries": _to_int(vals[6]),
                        "under_construction": _to_int(vals[7]),
                        "asking_rent_nnn": _to_float(vals[8]),
                        "geographic_type": "submarket",
                    }
                )
            i = j
            continue

        i += 1

    return rows


# ──────────────────────────────────────────────────────────────────────────────
# Anthropic vision fallback
# ──────────────────────────────────────────────────────────────────────────────

_VISION_PROMPT = """
This is a page from a commercial real estate market report for Southwest Florida.
Extract the industrial submarket statistics table as JSON. Return ONLY valid JSON.
Each row should be an object with these keys (use null for missing/dashes):
  submarket, sector (industrial|flex), inventory_sf, vacancy_rate_pct,
  absorption_current_sf, absorption_ytd_sf, under_construction_sf,
  deliveries_sf, asking_rent_nnn_per_sf
Return a JSON array of these objects, nothing else.
"""

MIN_TEXT_CHARS = 200  # below this triggers vision fallback


def _vision_extract(page: fitz.Page, quarter: str, source_name: str) -> list[dict[str, Any]]:
    if not _ANTHROPIC_AVAILABLE:
        return []
    mat = fitz.Matrix(2, 2)
    pix = page.get_pixmap(matrix=mat)
    img_b64 = base64.standard_b64encode(pix.tobytes("png")).decode()

    client = _anthropic.Anthropic()
    msg = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
                    {"type": "text", "text": _VISION_PROMPT},
                ],
            }
        ],
    )
    from ingest.lib.api_usage import log_api_usage

    log_api_usage(model=msg.model, call_type="ingest_marketbeat", usage=msg.usage)
    import json

    raw = msg.content[0].text.strip()
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        return []

    rows = []
    for item in items:
        if not isinstance(item, dict):
            continue
        rows.append(
            {
                "source_name": source_name,
                "sector": item.get("sector", "industrial"),
                "submarket": item.get("submarket", ""),
                "quarter": quarter,
                "inventory_sf": item.get("inventory_sf"),
                "vacancy_rate": item.get("vacancy_rate_pct"),
                "absorption_sqft": item.get("absorption_current_sf"),
                "ytd_absorption_sqft": item.get("absorption_ytd_sf"),
                "deliveries": item.get("deliveries_sf"),
                "under_construction": item.get("under_construction_sf"),
                "asking_rent_nnn": item.get("asking_rent_nnn_per_sf"),
                "geographic_type": "submarket",
            }
        )
    return rows


# ──────────────────────────────────────────────────────────────────────────────
# Public entry point
# ──────────────────────────────────────────────────────────────────────────────


def extract_pdf(pdf_path: Path) -> list[dict[str, Any]]:
    """
    Extract submarket rows from a MarketBeat or Colliers PDF.
    Returns a list of row dicts ready for loader.py upsert.
    """
    quarter = quarter_from_filename(pdf_path)
    source = source_from_filename(pdf_path)

    doc = fitz.open(str(pdf_path))

    rows: list[dict[str, Any]] = []

    # Pass 1: text-based parsers (fast, free)
    for page in doc:
        text = page.get_text()
        if source == "cw_marketbeat" and _CW_HEADER_SENTINEL in text:
            rows = _parse_cw_text(text, quarter)
            if rows:
                break
        elif source == "colliers_industrial" and any(h in text for h in _COLLIERS_HEADER_VARIANTS):
            rows = _parse_colliers_text(text, quarter)
            if rows:
                break

    # Pass 2: vision fallback only when every page had too little text
    if not rows:
        for page in doc:
            text = page.get_text()
            if len(text) < MIN_TEXT_CHARS:
                rows = _vision_extract(page, quarter, source)
                if rows:
                    break

    doc.close()

    if not rows:
        raise ValueError(
            f"No submarket rows extracted from {pdf_path.name}. "
            "PDF may be image-based or use an unexpected layout. "
            "Set MARKETBEAT_PDF_FORCE_VISION=1 to force Anthropic vision."
        )

    return rows
