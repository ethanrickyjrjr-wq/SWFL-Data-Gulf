"""Pure markdown parser for a 55places.com community detail page.

No network. 55places explicitly does not carry HOA fee data (confirmed live
07/20/2026 — every detail page footnotes "55places does not provide or
maintain community HOA information") so this parser never emits an
hoa_fee_range key at all — merge.py must not expect one from this source."""
from __future__ import annotations

import re

_TOTAL_HOMES_RE = re.compile(r"\*\*Total homes:\*\*\s*([\d,]+)", re.IGNORECASE)
_GATED_RE = re.compile(r"\*\*Gated:\*\*\s*(Yes|No)", re.IGNORECASE)

_AMENITY_PATTERNS = {
    "pool": re.compile(r"\bpool\b", re.IGNORECASE),
    "tennis": re.compile(r"\btennis\b", re.IGNORECASE),
    "pickleball": re.compile(r"\bpickleball\b", re.IGNORECASE),
    "fitness": re.compile(r"\bfitness\b", re.IGNORECASE),
    "clubhouse": re.compile(r"\bclubhouse\b", re.IGNORECASE),
    "on_site_dining": re.compile(r"\brestaurant\b|\bdining\b", re.IGNORECASE),
    "boating_marina": re.compile(r"\bmarina\b|\bboating\b", re.IGNORECASE),
}


def _amenities_section(markdown: str) -> str:
    """Text between an 'Amenities' heading and the next '##' heading (or end)."""
    m = re.search(r"##\s*[\w' ]*Amenities\b(.*?)(?=\n##|\Z)", markdown, re.IGNORECASE | re.DOTALL)
    return m.group(1) if m else ""


def parse_55places_detail(markdown: str) -> dict:
    homes_match = _TOTAL_HOMES_RE.search(markdown)
    home_count = int(homes_match.group(1).replace(",", "")) if homes_match else None

    gated_match = _GATED_RE.search(markdown)
    gated = (gated_match.group(1).lower() == "yes") if gated_match else None

    amenities_text = _amenities_section(markdown)
    row: dict = {"home_count": home_count, "gated": gated}
    for key, pattern in _AMENITY_PATTERNS.items():
        row[key] = bool(pattern.search(amenities_text)) if amenities_text else None
    return row
