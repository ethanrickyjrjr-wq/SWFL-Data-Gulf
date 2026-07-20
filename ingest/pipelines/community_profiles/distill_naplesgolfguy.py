"""Pure markdown parser for a naplesgolfguy.com golf-community detail page.

No network — operates on the markdown string returned by
ingest.lib.crawl_client.fetch_page_markdown. A field with no match in the page
returns None (bool amenity fields return False — the amenities bullet list is
exhaustive per naplesgolfguy's own convention: an amenity not listed is absent,
not unknown)."""
from __future__ import annotations

import re

_MEMBERSHIP_RE = re.compile(r"Membership Type:\s*\n##\s*(\w+)", re.IGNORECASE)
_HOLES_RE = re.compile(r"Number of Courses\s*\|\s*(\d+)\s*\((\d+)\s*Holes?\)", re.IGNORECASE)

_AMENITY_PATTERNS = {
    "pool": re.compile(r"\bpool\b", re.IGNORECASE),
    "tennis": re.compile(r"\btennis\b", re.IGNORECASE),
    "pickleball": re.compile(r"\bpickleball\b", re.IGNORECASE),
    "fitness": re.compile(r"\bfitness\b", re.IGNORECASE),
    "clubhouse": re.compile(r"\bclubhouse\b", re.IGNORECASE),
    "on_site_dining": re.compile(r"\bdining\b|\brestaurant\b", re.IGNORECASE),
    "boating_marina": re.compile(r"\bmarina\b|\bboating\b|\bboat\s+(club|access|dock)\b", re.IGNORECASE),
}

_STRUCTURE_MAP = {"bundled": "bundled", "equity": "equity", "optional": "optional", "none": "none"}


def _amenities_section(markdown: str) -> str:
    """Return the text between an '### Amenities' heading and the next '###'
    heading (or end of string) — the bullet list naplesgolfguy renders per
    community. Empty string if no such heading exists."""
    m = re.search(r"###\s*Amenities\b(.*?)(?=\n###|\Z)", markdown, re.IGNORECASE | re.DOTALL)
    return m.group(1) if m else ""


def parse_naplesgolfguy_detail(markdown: str) -> dict:
    membership = _MEMBERSHIP_RE.search(markdown)
    golf_structure = _STRUCTURE_MAP.get(membership.group(1).lower()) if membership else None

    holes_match = _HOLES_RE.search(markdown)
    golf_courses = int(holes_match.group(1)) if holes_match else None
    golf_holes = int(holes_match.group(2)) if holes_match else None

    amenities_text = _amenities_section(markdown)
    row: dict = {
        "golf_structure": golf_structure,
        "golf_holes": golf_holes,
        "golf_courses": golf_courses,
    }
    for key, pattern in _AMENITY_PATTERNS.items():
        row[key] = bool(pattern.search(amenities_text)) if amenities_text else None
    return row
