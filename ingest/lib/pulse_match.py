# ingest/lib/pulse_match.py
"""Deterministic (no-LLM, no-DB) matcher: does a news article concern a given
SWFL city or corridor? Permissive by design — the pulse distill applies the
strict per-unit location guard, so the matcher optimizes for recall, not
precision. A missed article is a lost fact; an over-matched one is filtered
downstream at zero extra cost (still $0 — the distill runs once per unit)."""
from __future__ import annotations

import re

_ROAD_ABBR = {
    "rd": "road", "blvd": "boulevard", "pkwy": "parkway", "ave": "avenue",
    "st": "street", "dr": "drive", "hwy": "highway", "ln": "lane", "ct": "court",
}


def normalize_road(text: str) -> str:
    out = []
    for tok in re.split(r"\s+", text.strip().lower()):
        tok = tok.strip(".,")
        out.append(_ROAD_ABBR.get(tok, tok))
    return " ".join(t for t in out if t)


# Area suffixes that name the corridor's place, not its road — stripped so the
# road token stays tight (e.g. "north naples", "fort myers", county seats).
_AREA_SUFFIXES = [
    "north naples", "east naples", "golden gate", "fort myers beach",
    "north fort myers", "cape coral", "fort myers", "bonita springs",
    "bonita beach", "lehigh acres", "marco island", "naples", "estero",
    "sanibel", "immokalee",
]


def road_tokens_from_corridor(corridor_name: str) -> list[str]:
    norm = normalize_road(corridor_name)
    for suffix in _AREA_SUFFIXES:
        s = normalize_road(suffix)
        if norm.endswith(" " + s):
            norm = norm[: -(len(s) + 1)].strip()
            break
    return [norm] if norm else []


def article_matches_city(city: str, headline: str, body_text: str) -> bool:
    hay = f"{headline} {body_text}".lower()
    return city.lower() in hay


def article_matches_corridor(corridor_name: str, headline: str, body_text: str) -> bool:
    hay = normalize_road(f"{headline} {body_text}")
    return any(tok and tok in hay for tok in road_tokens_from_corridor(corridor_name))
