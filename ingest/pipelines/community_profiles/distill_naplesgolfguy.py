"""Pure markdown parser for a naplesgolfguy.com golf-community detail page.

No network — operates on the markdown string returned by
ingest.lib.crawl_client.fetch_page_markdown. A field with no match in the page
returns None (bool amenity fields return False — the amenities bullet list is
exhaustive per naplesgolfguy's own convention: an amenity not listed is absent,
not unknown).

Also carries: club_type (raw label, e.g. "Private Country Club"); the four
"### Membership Fees" table fields (golf_initiation_fee, golf_annual_dues,
social_initiation_fee, social_annual_dues) as raw strings -- annotations like
"(equity)" preserved verbatim, never parsed into a number, since the table's
shape and labels are NOT identical across membership types (confirmed live
2026-07-20 across equity/bundled/"one time initiation fee" pages -- see
_FEE_FIELD_LABELS); and fnb_minimum_disclosed, a bool signal (never a dollar
figure) for the page's own food-and-beverage-minimum disclaimer text."""
from __future__ import annotations

import re

_MEMBERSHIP_RE = re.compile(r"Membership Type:\s*\n##\s*(\w+)", re.IGNORECASE)
_HOLES_RE = re.compile(r"Number of Courses\s*\|\s*(\d+)\s*\((\d+)\s*Holes?\)", re.IGNORECASE)
_CLUB_TYPE_RE = re.compile(r"Club Type:\s*\n##\s*([^\n]+)", re.IGNORECASE)

# "food and beverage minimum" disclaimer -- confirmed boilerplate on live pages
# (Fiddler's Creek, Talis Park), never a dollar figure. Loose word-proximity
# match (not one fixed phrase) so trivial rewording elsewhere still counts as
# "disclosed" without over-matching unrelated mentions of any single word.
_FNB_MINIMUM_RE = re.compile(
    r"food\b.{0,30}?\bbeverage\b.{0,30}?\bminimum\b", re.IGNORECASE | re.DOTALL
)

# Row labels as they actually render in the "### Membership Fees" table.
# Confirmed live 2026-07-20 across three membership types (equity: Fiddler's
# Creek; bundled: Heritage Bay; "one time initiation fee": Talis Park) -- the
# site is NOT consistent about these labels across membership types (Heritage
# Bay's 3rd row is "Annual Social Membership Fee:", Talis Park's is "Sports
# Membership Initiation Fee:" -- neither matches "Social Membership
# Initiation Fee:" below, so social_initiation_fee correctly degrades to None
# on both rather than guessing which slot a differently-named fee belongs in).
# Fees?: tolerates the singular/plural variance actually observed (Fiddler's
# Creek/Talis Park use "Fee:", Heritage Bay uses "Fees:") for the SAME field.
_FEE_FIELD_LABELS = {
    "golf_initiation_fee": r"Golf Membership Initiation Fees?:",
    "golf_annual_dues": r"Annual Golf Dues:",
    "social_initiation_fee": r"Social Membership Initiation Fee:",
    "social_annual_dues": r"Annual Social Dues:",
}

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


def _membership_fees_section(markdown: str) -> str:
    """Return the text between an '### Membership Fees' heading and the next
    '###' heading (or end of string) — the fee table naplesgolfguy renders per
    community. Empty string if no such heading exists (confirmed some pages
    carry only a '### Membership Information' table with no separate fees
    table -- callers must treat that as an honest absence, not a parse bug)."""
    m = re.search(r"###\s*Membership Fees\b(.*?)(?=\n###|\Z)", markdown, re.IGNORECASE | re.DOTALL)
    return m.group(1) if m else ""


def _parse_fee_field(fees_section: str, label_pattern: str) -> str | None:
    """Match one '| <label> | <value> |' row inside the Membership Fees
    section text. Returns the raw value string verbatim (annotations like
    "(equity)" preserved, never parsed into a number) or None when this
    section doesn't carry that exact label -- a differently-worded row on
    another membership type is a real absence, not a value to guess at."""
    m = re.search(r"\|\s*" + label_pattern + r"\s*\|\s*([^|]+?)\s*\|", fees_section, re.IGNORECASE)
    return m.group(1).strip() if m else None


def parse_naplesgolfguy_detail(markdown: str) -> dict:
    membership = _MEMBERSHIP_RE.search(markdown)
    golf_structure = _STRUCTURE_MAP.get(membership.group(1).lower()) if membership else None

    holes_match = _HOLES_RE.search(markdown)
    golf_courses = int(holes_match.group(1)) if holes_match else None
    golf_holes = int(holes_match.group(2)) if holes_match else None

    club_type_match = _CLUB_TYPE_RE.search(markdown)
    club_type = club_type_match.group(1).strip() if club_type_match else None

    fees_section = _membership_fees_section(markdown)
    fee_fields = {
        key: (_parse_fee_field(fees_section, pattern) if fees_section else None)
        for key, pattern in _FEE_FIELD_LABELS.items()
    }

    fnb_minimum_disclosed = True if _FNB_MINIMUM_RE.search(markdown) else None

    amenities_text = _amenities_section(markdown)
    row: dict = {
        "golf_structure": golf_structure,
        "golf_holes": golf_holes,
        "golf_courses": golf_courses,
        "club_type": club_type,
        "fnb_minimum_disclosed": fnb_minimum_disclosed,
        **fee_fields,
    }
    for key, pattern in _AMENITY_PATTERNS.items():
        row[key] = bool(pattern.search(amenities_text)) if amenities_text else None
    return row
