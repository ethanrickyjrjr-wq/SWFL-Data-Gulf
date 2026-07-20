"""Build the real golf-community master list from discover.py's live `ngg_map`
(158 unique naplesgolfguy communities, verified live 07/20/2026 — see
docs/superpowers/handoffs/2026-07-20-community-profiles-full-golf-discovery-handoff.md)
and attempt an honest county resolution against `data_lake.neighborhood_stats`
(a FDOR-parcel-derived (county, subdivision_name) rollup — the ONE root for
this per docs/standards/data-roots.md).

Why NOT `fixtures/community-aliases.json`: that fixture (shared with
`ingest.lib.community_aliases`) has exactly ONE entry today
({"heritage-bay": {...}}) and no `county` field at all — joining against it
would resolve county for essentially nothing. `data_lake.neighborhood_stats`
is the real parcel-derived source with real county values.

The matching problem is genuinely fuzzy: FDOR's `subdivision_name` is a plat
filing name derived from `legal_description`, not a marketing name — e.g. the
marketed "Grey Oaks" resolves against parcel rows like "GREY OAKS",
"CAPISTRANO AT GREY OAKS", "ESTUARY AT GREY OAKS" (a master community fans out
into many named sub-plats). A match is accepted only when it is UNAMBIGUOUS at
the COUNTY level: every matching subdivision row agrees on one county. If
matches span both Lee and Collier with no way to disambiguate, or there are
zero matches, `county` stays `None` — a null county is honest, a wrong one is
an invented fact (per the handoff's own standard).
"""
from __future__ import annotations

import re

from .normalize import normalize_community_name, slugify


def derive_label(slug: str) -> str:
    """"grey-oaks-country-club" -> "Grey Oaks Country Club". Per-word
    capitalize() (not str.title()) so "grey-oaks-country-club".split("-") each
    word capitalizes cleanly regardless of internal casing quirks."""
    return " ".join(word.capitalize() for word in slug.split("-") if word)


def _contains_word_bounded(haystack: str, needle: str) -> bool:
    """True if `needle` appears in `haystack` bounded by whitespace or the
    string edges — a whole-word-sequence containment check, not a raw
    substring check (so "OAKS" doesn't spuriously match inside "OAKLAND").

    Cheap `in` pre-filter (C-level substring scan) before the regex compile —
    load-bearing for performance, not just style: with ~20k distinct
    `neighborhood_stats` subdivision names checked against each of 158
    community labels (~3M pair checks), a regex recompiled per distinct
    `needle` thrashes Python's small internal regex cache badly enough to
    turn a sub-minute job into a multi-minute one (measured live
    07/20/2026). The `in` check rules out the overwhelming majority of pairs
    before a single regex is ever compiled."""
    if not needle or needle not in haystack:
        return False
    pattern = r"(?:^|\s)" + re.escape(needle) + r"(?:\s|$)"
    return re.search(pattern, haystack) is not None


def build_subdivision_index(neighborhood_rows: list[dict]) -> dict[str, set[str]]:
    """{normalized_subdivision_name: {county, ...}} from
    data_lake.neighborhood_stats rows (each {"county", "subdivision_name",
    "home_count"}). Counties are title-cased ("collier" -> "Collier") to match
    this pipeline's existing county-string convention (seed_communities.json).
    Blank/unparseable subdivision names are skipped — they never carry a real
    community name to match against."""
    index: dict[str, set[str]] = {}
    for row in neighborhood_rows:
        raw_name = (row.get("subdivision_name") or "").strip()
        if not raw_name:
            continue
        normalized = normalize_community_name(raw_name)
        if not normalized:
            continue
        county_raw = (row.get("county") or "").strip()
        if not county_raw:
            continue
        index.setdefault(normalized, set()).add(county_raw.capitalize())
    return index


def match_counties(normalized_label: str, subdivision_index: dict[str, set[str]]) -> set[str]:
    """Every county whose (county, subdivision_name) rows match
    `normalized_label` — exactly, or via an unambiguous FORWARD whole-word
    match (the full community label found inside a longer subdivision plat
    name, e.g. "GREY OAKS" inside "CAPISTRANO AT GREY OAKS"). Returns a set so
    the caller can tell an unambiguous single-county match (len == 1) from a
    cross-county conflict (len > 1) from no match at all (len == 0).

    Deliberately ONE-DIRECTIONAL. A reverse direction (a short/generic
    subdivision fragment found inside a longer community label) was tried and
    REJECTED live 07/20/2026: it produced real false positives — "Lakewood
    Ranch" (a Sarasota/Manatee community, genuinely out of Lee/Collier scope,
    leaked into `ngg_map` via naplesgolfguy's non-geo-filtered membership-type
    pages) matched a wholly-unrelated Collier subdivision plat literally named
    "LAKEWOOD"; same failure for "Sarasota National"/"Babcock National" vs a
    generic Collier subdivision plat named "NATIONAL". A short, single-word
    plat name is not distinguishing evidence for a much longer, unrelated
    marketed community name — the forward direction (the full, usually
    multi-word community name required to appear whole inside the subdivision
    name) doesn't have this failure mode, because the STRING BEING MATCHED
    stays the full, specific community label either way."""
    counties: set[str] = set()
    for subdivision_norm, county_set in subdivision_index.items():
        if subdivision_norm == normalized_label:
            counties |= county_set
        elif _contains_word_bounded(subdivision_norm, normalized_label):
            counties |= county_set
    return counties


def resolve_county(counties: set[str]) -> str | None:
    """Exactly one county -> that county. Zero (no match) or 2+ (ambiguous,
    e.g. same normalized name resolves under both Lee and Collier) -> None.
    Never guesses."""
    if len(counties) == 1:
        return next(iter(counties))
    return None


def build_master_list(
    ngg_map: dict[str, str],
    fp_map: dict[str, str],
    neighborhood_rows: list[dict],
) -> list[dict]:
    """One entry per ngg_map (normalized_name -> naplesgolfguy slug) pair:
    {slug, label, naplesgolfguy_slug, fiftyfive_places_slug, county}.
    `slug` is OUR OWN identity key (slugify(label) — independent of whichever
    real per-source slug was discovered, matching pipeline.py's existing
    community_slug convention). `fiftyfive_places_slug` is filled only when
    the SAME normalized name exists in fp_map (55places is a strict subset —
    51 of 158 — no fallback guess here, a miss just stays null)."""
    subdivision_index = build_subdivision_index(neighborhood_rows)

    entries: list[dict] = []
    for normalized_name, ngg_slug in ngg_map.items():
        label = derive_label(ngg_slug)
        slug = slugify(label)
        fp_slug = fp_map.get(normalized_name)
        counties = match_counties(normalized_name, subdivision_index)
        county = resolve_county(counties)
        entries.append(
            {
                "slug": slug,
                "label": label,
                "naplesgolfguy_slug": ngg_slug,
                "fiftyfive_places_slug": fp_slug,
                "county": county,
            }
        )
    entries.sort(key=lambda e: e["slug"])
    return entries


def main() -> int:
    """Live run: fetch discover.py's maps + data_lake.neighborhood_stats,
    write golf_communities_master.json next to this file. Manual, one-off —
    matches the pipeline's own manual-run convention (no GHA cron).
    Pacing between discover.py's 8 directory fetches lives in
    build_discovery_maps itself (default delay_seconds=1.5) so every caller
    (this one and pipeline.py's amenity-scrape run) gets it, not just here."""
    import json
    from pathlib import Path

    from ingest.lib.crawl_client import fetch_page_markdown
    from ingest.lib.tier1_inventory import _get_connection

    from .discover import build_discovery_maps

    ngg_map, fp_map = build_discovery_maps(fetch_page_markdown)

    conn = _get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT county, subdivision_name, home_count FROM data_lake.neighborhood_stats"
            )
            cols = [d[0] for d in cur.description]
            neighborhood_rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()

    entries = build_master_list(ngg_map, fp_map, neighborhood_rows)

    out_path = Path(__file__).parent / "golf_communities_master.json"
    out_path.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")

    resolved = sum(1 for e in entries if e["county"])
    fp_matched = sum(1 for e in entries if e["fiftyfive_places_slug"])
    print(f"wrote {len(entries)} entries to {out_path}")
    print(f"county resolved: {resolved}/{len(entries)}")
    print(f"55places matched: {fp_matched}/{len(entries)}")
    for e in entries:
        if not e["county"]:
            print(f"  null county: {e['label']} ({e['naplesgolfguy_slug']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
