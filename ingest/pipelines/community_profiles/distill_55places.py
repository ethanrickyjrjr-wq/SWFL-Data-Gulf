"""Pure markdown parser for a 55places.com community detail page.

No network. 55places explicitly does not carry HOA fee data (confirmed live
07/20/2026 — every detail page footnotes "55places does not provide or
maintain community HOA information") so this parser never emits an
hoa_fee_range key at all — merge.py must not expect one from this source.

Also carries the rest of the community's listed profile bullets, all raw
strings straight off the page (no parsing into numbers/enums -- formatting
varies enough across communities, e.g. "Low $200ks - Low $1Ms", that a parsed
figure risks being wrong more often than a preserved string is unclear):
price_range, home_types, new_or_resale, builder, years_built, age_restrictions.
activity_director is a bool, same Yes/No convention as gated."""
from __future__ import annotations

import re

_TOTAL_HOMES_RE = re.compile(r"\*\*Total homes:\*\*\s*([\d,]+)", re.IGNORECASE)
_GATED_RE = re.compile(r"\*\*Gated:\*\*\s*(Yes|No)", re.IGNORECASE)
_ACTIVITY_DIRECTOR_RE = re.compile(r"\*\*Activity director:\*\*\s*(Yes|No)", re.IGNORECASE)

_TEXT_FIELD_LABELS = {
    "price_range": r"Price range",
    "home_types": r"Home types",
    "new_or_resale": r"New or resale",
    "builder": r"Builder",
    "years_built": r"Years built",
    "age_restrictions": r"Age restrictions",
}

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


def _parse_text_field(markdown: str, label: str) -> str | None:
    m = re.search(r"\*\*" + label + r":\*\*\s*([^\n]+)", markdown, re.IGNORECASE)
    return m.group(1).strip() if m else None


def parse_55places_detail(markdown: str) -> dict:
    homes_match = _TOTAL_HOMES_RE.search(markdown)
    home_count = int(homes_match.group(1).replace(",", "")) if homes_match else None

    gated_match = _GATED_RE.search(markdown)
    gated = (gated_match.group(1).lower() == "yes") if gated_match else None

    activity_director_match = _ACTIVITY_DIRECTOR_RE.search(markdown)
    activity_director = (
        (activity_director_match.group(1).lower() == "yes") if activity_director_match else None
    )

    amenities_text = _amenities_section(markdown)
    row: dict = {"home_count": home_count, "gated": gated, "activity_director": activity_director}
    for key, label in _TEXT_FIELD_LABELS.items():
        row[key] = _parse_text_field(markdown, label)
    for key, pattern in _AMENITY_PATTERNS.items():
        row[key] = bool(pattern.search(amenities_text)) if amenities_text else None
    return row
