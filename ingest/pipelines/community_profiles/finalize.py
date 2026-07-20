"""Merge stage: combine `golf_communities_master.json` (158 entries) + the
naplesgolfguy/55places full-discovery partial dicts + realtyofnaplesfl's
HOA-comparison table into final `community_profiles` rows, via the already-
built (and already fully-tested) `merge_community_row`.

READ-ONLY / REPORT-ONLY. This module never writes to `data_lake.community_profiles`
(no dlt import here) and never writes `fixtures/community-aliases.json` (that
fixture is a real shared index other code reads — the write is a separate,
operator-approved step per the handoff's own scope boundary). The only
filesystem write `main()` performs is `.raw_cache/final_rows.json`, which is
gitignored scratch, not a committed data file.

Deliberately does NOT route through `pipeline.py`'s `build_rows` — that
function recomputes `slugify(name)` and re-fetches/re-distills markdown per
seed entry. Here the per-source slugs actually fetched
(`naplesgolfguy_slug`/`fiftyfive_places_slug`) already live on each master-list
entry (discover.py resolved them), and the partial dicts are already distilled
— re-deriving or re-parsing either would risk silently drifting from what was
really fetched.
"""
from __future__ import annotations

import json
from pathlib import Path

from .constants import HOA_COMPARISON_URL
from .merge import merge_community_row
from .normalize import normalize_community_name
from .pipeline import maybe_register_alias

_MASTER_LIST_PATH = Path(__file__).parent / "golf_communities_master.json"
_RAW_CACHE = Path(__file__).parent / ".raw_cache"
_NGG_PARTIALS_PATH = _RAW_CACHE / "naplesgolfguy_partials.json"
_FP_PARTIALS_PATH = _RAW_CACHE / "55places_full_run_partials.json"
_OUT_PATH = _RAW_CACHE / "final_rows.json"

# realtyofnaplesfl's curated table lists ~20 communities (13 Collier + 7 Lee)
# per the design spec — a parse that comes back well under that is a fetch
# problem (blocked/empty page), not a real result. Below this floor, main()
# prints a loud warning so the golf_structure-fallback/hoa_fee_range/
# fees_included counts aren't mistaken for a trustworthy zero.
_HOA_TABLE_MIN_EXPECTED_ROWS = 15

_GOLF_FEE_FIELDS = (
    "golf_initiation_fee", "golf_annual_dues", "social_initiation_fee", "social_annual_dues",
)
_AMENITY_FIELDS = (
    "pool", "tennis", "pickleball", "fitness", "clubhouse", "on_site_dining", "boating_marina",
)
# Every field a merge group can populate — used only to detect "every group
# came back null" (identity fields community_slug/label/county and the
# provenance url/as_of fields are deliberately excluded: a row can have a
# non-null county with zero scraped data and must still count as all-null).
_ALL_MERGE_FIELDS = (
    "golf_structure", "golf_holes", "golf_courses", "club_type",
    *_GOLF_FEE_FIELDS, "fnb_minimum_disclosed",
    "home_count", "gated", "price_range", "home_types", "new_or_resale",
    "builder", "years_built", "age_restrictions", "activity_director",
    *_AMENITY_FIELDS,
    "hoa_fee_range", "fees_included", "cdd_flag",
)


def build_final_rows(
    master_list: list[dict],
    *,
    ngg_partials: dict[str, dict],
    fp_partials: dict[str, dict],
    hoa_table: list[dict],
) -> list[dict]:
    """One `merge_community_row` call per master_list entry. Partials are
    keyed by community_slug (`entry["slug"]`) — matching
    `run_full_discovery`'s own write convention (`partials[community_slug] =
    ...`), never the per-source slug actually fetched. A missing partial key
    (a community neither full-discovery run reached) degrades the same way an
    all-None partial dict already does inside `merge_community_row`'s own
    truthiness checks — `.get()` returning `None` here needs no special-casing."""
    hoa_by_normalized = {normalize_community_name(r["name"]): r for r in hoa_table}

    rows: list[dict] = []
    for entry in master_list:
        slug = entry["slug"]
        label = entry["label"]
        county = entry.get("county")
        hoa = hoa_by_normalized.get(normalize_community_name(label))
        rows.append(
            merge_community_row(
                slug,
                label,
                county,
                naplesgolfguy=ngg_partials.get(slug),
                fiftyfive_places=fp_partials.get(slug),
                hoa_comparison=hoa,
                naplesgolfguy_slug=entry.get("naplesgolfguy_slug"),
                fiftyfive_places_slug=entry.get("fiftyfive_places_slug"),
            )
        )
    return rows


def alias_match_report(master_list: list[dict], aliases: dict) -> dict:
    """Classify each master_list entry's slug against the ORIGINAL alias
    fixture snapshot — frozen once up front, never an accumulating working
    copy, so a duplicate slug within master_list can't count its second
    occurrence as "known" just because the first got folded in first.
    Exercises the real `maybe_register_alias` helper (never reimplements its
    add-if-absent logic) but returns a fresh dict — `aliases` itself and the
    real fixture file are never mutated; the write is a separate,
    operator-approved step."""
    original_slugs = set(aliases)
    working = dict(aliases)
    known: list[str] = []
    newly_minted: dict[str, dict] = {}
    duplicate_slugs: list[str] = []
    seen_slugs: set[str] = set()

    for entry in master_list:
        slug, label = entry["slug"], entry["label"]
        if slug in seen_slugs:
            duplicate_slugs.append(slug)
        seen_slugs.add(slug)

        if slug in original_slugs:
            known.append(slug)
        elif slug not in newly_minted:
            newly_minted[slug] = {"slug": slug, "label": label}
        working = maybe_register_alias(slug, label, working)

    return {
        "known_count": len(known),
        "known": known,
        "newly_minted_count": len(newly_minted),
        "newly_minted": sorted(newly_minted.values(), key=lambda e: e["slug"]),
        "duplicate_slugs": duplicate_slugs,
    }


def completeness_report(rows: list[dict]) -> dict:
    """Real per-field-group counts out of `len(rows)` — never a vibe.
    `amenities_any_true` is deliberately "at least one of the 7 booleans is
    True", not merely non-None: a row whose Amenities section parsed cleanly
    but listed nothing (all False) is real signal, distinct from "amenities
    present". Every other `_present` metric is a non-None check, since those
    fields are strings/counts/enums where None is the only "absent" state."""
    total = len(rows)

    def _count(pred) -> int:
        return sum(1 for r in rows if pred(r))

    all_null_names = [
        r["label"] for r in rows if all(r.get(field) is None for field in _ALL_MERGE_FIELDS)
    ]

    return {
        "total": total,
        "golf_structure_present": _count(lambda r: r["golf_structure"] is not None),
        "golf_holes_present": _count(lambda r: r["golf_holes"] is not None),
        "club_type_present": _count(lambda r: r["club_type"] is not None),
        "membership_fees_any_present": _count(
            lambda r: any(r[k] is not None for k in _GOLF_FEE_FIELDS)
        ),
        "fnb_minimum_disclosed_true": _count(lambda r: r["fnb_minimum_disclosed"] is True),
        "home_count_present": _count(lambda r: r["home_count"] is not None),
        "gated_present": _count(lambda r: r["gated"] is not None),
        "price_range_present": _count(lambda r: r["price_range"] is not None),
        "amenities_any_true": _count(lambda r: any(r[k] is True for k in _AMENITY_FIELDS)),
        "hoa_fee_range_present": _count(lambda r: r["hoa_fee_range"] is not None),
        "fees_included_present": _count(lambda r: r["fees_included"] is not None),
        "all_null_count": len(all_null_names),
        "all_null_names": all_null_names,
    }


def _load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    """Live run: load the already-fetched master list + both full-discovery
    partial files off disk (no re-fetch — those live fetches already
    happened), fetch+cache (idempotent) realtyofnaplesfl's one HOA-comparison
    page, merge all 158, and print the real completeness + identity-match
    numbers. Writes only `.raw_cache/final_rows.json` (gitignored) — no dlt
    write, no fixture write."""
    from ingest.lib.community_aliases import load_community_aliases

    from .distill_realtyofnaplesfl import parse_hoa_comparison_page
    from .raw_cache import fetch_all_paced

    master_list = _load_json(_MASTER_LIST_PATH)
    ngg_partials = _load_json(_NGG_PARTIALS_PATH)
    fp_partials = _load_json(_FP_PARTIALS_PATH)

    markdown_by_url = fetch_all_paced([HOA_COMPARISON_URL], source="realtyofnaplesfl")
    hoa_md = markdown_by_url.get(HOA_COMPARISON_URL, "")
    hoa_table = parse_hoa_comparison_page(hoa_md) if hoa_md else []
    if len(hoa_table) < _HOA_TABLE_MIN_EXPECTED_ROWS:
        print(
            f"WARNING: realtyofnaplesfl HOA table parsed only {len(hoa_table)} rows "
            f"(design spec expects ~20 — 13 Collier + 7 Lee). Treat golf_structure "
            "fallback / hoa_fee_range / fees_included counts below as a possible "
            "fetch failure, not a trustworthy result."
        )

    rows = build_final_rows(
        master_list, ngg_partials=ngg_partials, fp_partials=fp_partials, hoa_table=hoa_table
    )

    aliases = load_community_aliases()
    alias_report = alias_match_report(master_list, aliases)
    completeness = completeness_report(rows)

    _RAW_CACHE.mkdir(parents=True, exist_ok=True)
    _OUT_PATH.write_text(json.dumps(rows, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"hoa_table rows parsed: {len(hoa_table)}")
    print(f"final rows merged: {len(rows)} -> {_OUT_PATH}")
    print("--- completeness ---")
    print(json.dumps(completeness, indent=2))
    print("--- alias identity-match ---")
    print(json.dumps(alias_report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
