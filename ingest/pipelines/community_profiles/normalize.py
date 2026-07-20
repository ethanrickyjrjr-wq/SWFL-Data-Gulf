"""Slug + name-matching for the community_profiles amenity scrape.

Distinct from ingest.lib.community_aliases' plat-name normalizer (which strips
UNIT/PHASE/TRACT — plat-filing qualifiers). This one strips MARKETED-NAME
suffixes (Golf & Country Club, Country Club, Community Association Inc, ...) so
the same community's name from four different websites collapses to one key.
"""
from __future__ import annotations

import re

_SUFFIX_RE = re.compile(
    r"\b("
    r"GOLF\s*&\s*COUNTRY\s*CLUB|GOLF\s+AND\s+COUNTRY\s+CLUB|GOLF\s+COUNTRY\s+CLUB|"
    r"COUNTRY\s+CLUB|GOLF\s*&\s*CC|GOLF\s+CLUB|"
    r"COMMUNITY\s+ASSOCIATION,?\s*INC\.?|HOMEOWNERS\s*'?\s*ASSOCIATION,?\s*INC\.?|"
    r"ASSOCIATION,?\s*INC\.?|CC|INC\.?"
    r")\.?\s*$"
)


def normalize_community_name(name: str) -> str:
    """Uppercase, strip trailing marketed-name/entity suffixes, strip punctuation,
    collapse whitespace. "Heritage Bay Golf & Country Club" -> "HERITAGE BAY"."""
    upper = name.upper().strip().replace("'", "")
    prev = None
    while prev != upper:
        prev = upper
        upper = _SUFFIX_RE.sub("", upper).strip()
    upper = re.sub(r"[^A-Z0-9 ]", " ", upper)
    upper = re.sub(r"\s+", " ", upper).strip()
    return upper


def slugify(name: str) -> str:
    """"Fiddler's Creek" -> "fiddlers-creek". Lowercase, drop apostrophes, replace
    every run of non-alphanumeric characters with one hyphen, strip edge hyphens."""
    s = name.lower().replace("'", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")
