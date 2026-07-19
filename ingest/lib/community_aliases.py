"""Read the subdivision -> marketed-community alias map from the single
source of truth (`fixtures/community-aliases.json`) shared with
`refinery/lib/subdivision-aliases.mts` — avoids the TS and Python sides
drifting apart on which platted names roll up to which community.
"""
from __future__ import annotations

import json
from pathlib import Path

_FIXTURE_PATH = Path(__file__).parent.parent.parent / "fixtures" / "community-aliases.json"


def load_community_aliases(path: Path = _FIXTURE_PATH) -> dict:
    """Return {slug: {"label": str, "patterns": [str, ...]}}."""
    return json.loads(path.read_text(encoding="utf-8"))


def build_pattern_index(aliases: dict) -> dict[str, str]:
    """Reverse index: normalized pattern -> community slug (mirrors the TS
    `_PATTERN_INDEX` in subdivision-aliases.mts)."""
    index: dict[str, str] = {}
    for slug, entry in aliases.items():
        for pattern in entry["patterns"]:
            index[pattern] = slug
    return index


def community_for_subdivision(stemmed_name: str, pattern_index: dict[str, str] | None = None) -> str | None:
    """Roll a STEMMED subdivision name up to its marketed community, or None if
    unknown. Caller stems the raw name first (see `_stem` in
    the parcel_subdivision_v view's legal-description stem) — this function does not
    re-stem, matching the TS `communityForSubdivision` contract."""
    idx = pattern_index if pattern_index is not None else build_pattern_index(load_community_aliases())
    return idx.get(stemmed_name)


def label_by_pattern(aliases: dict | None = None) -> dict[str, str]:
    """Build a direct STEMMED-NAME -> canonical LABEL map (not slug) -- what
    ingest/duckdb_pipelines/neighborhood_stats/agg.py needs to fold an aliased
    raw subdivision_name to its marketed-community label before grouping.
    Mirrors the TS side's `communityForSubdivision` + `COMMUNITY_ALIASES[slug].label`
    lookup (refinery/lib/subdivision-aliases.mts, via lib/listings/community-lookup.ts's
    `canonicalCommunityKey`) so both readers resolve a given raw name to the identical
    label string -- the join-key lockstep the address resolver depends on.
    """
    aliases = aliases if aliases is not None else load_community_aliases()
    index = build_pattern_index(aliases)
    return {pattern: aliases[slug]["label"] for pattern, slug in index.items()}
