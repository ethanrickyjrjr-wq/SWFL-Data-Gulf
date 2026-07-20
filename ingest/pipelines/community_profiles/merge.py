"""Combine per-source partial dicts (Tasks 2-4) into one community_profiles row.

Precedence per field GROUP (never per individual field within a group - a
group's facts come from one page, so they carry one source_url + as_of pair,
matching migrations/20260706_community_profiles.sql's comment):
  - golf group: naplesgolfguy's detail fields (holes/courses/club_type/the
    four Membership Fees fields/fnb_minimum_disclosed) whenever naplesgolfguy
    returned ANY of them -- golf_structure itself keeps its own precedence
    within that same branch: naplesgolfguy's own value when present, else the
    hoa_comparison row's golf_structure (curated). This split exists because
    naplesgolfguy's own membership-type text doesn't always map to a known
    enum (e.g. "One Time Initiation Fee" -- distill_naplesgolfguy.py's
    _STRUCTURE_MAP miss, a known gap, not fixed here) even though the SAME
    page carries real holes/club_type/fee data worth keeping. When
    naplesgolfguy has nothing at all, falls back fully to hoa_comparison
    (structure + its own source_url), same as before this file's July 2026
    fee/club_type extension.
  - amenities group (pool/tennis/pickleball/fitness/clubhouse/on_site_dining/
    boating_marina): 55places first (broader, non-golf-restricted coverage),
    else naplesgolfguy.
  - 55places listing-profile group (home_count/gated/price_range/home_types/
    new_or_resale/builder/years_built/age_restrictions/activity_director):
    55places only (naplesgolfguy doesn't carry these).
  - fees group (hoa_fee_range/fees_included/cdd_flag): realtyofnaplesfl's
    curated table only for v1 (the realtyofnaples.com per-listing aggregate
    lane is a follow-up, per the design spec's "Out of scope" section).
"""
from __future__ import annotations

from datetime import date

from .constants import HOA_COMPARISON_URL, fiftyfive_places_url, naplesgolfguy_url

_AMENITY_KEYS = (
    "pool", "tennis", "pickleball", "fitness", "clubhouse", "on_site_dining", "boating_marina",
)

# naplesgolfguy-only golf-detail fields (excludes golf_structure/golf_holes/
# golf_courses, which get their own explicit handling below).
_GOLF_DETAIL_KEYS = (
    "club_type",
    "golf_initiation_fee",
    "golf_annual_dues",
    "social_initiation_fee",
    "social_annual_dues",
    "fnb_minimum_disclosed",
)

# 55places-only listing-profile fields, beyond home_count/gated (which keep
# their own names for backward compat with existing callers/tests).
_FIFTYFIVE_TEXT_KEYS = (
    "price_range", "home_types", "new_or_resale", "builder", "years_built", "age_restrictions",
)


def merge_community_row(
    slug: str,
    label: str,
    county: str,
    *,
    naplesgolfguy: dict | None,
    fiftyfive_places: dict | None,
    hoa_comparison: dict | None,
    as_of: str | None = None,
    naplesgolfguy_slug: str | None = None,
    fiftyfive_places_slug: str | None = None,
) -> dict:
    """naplesgolfguy_slug / fiftyfive_places_slug: the slug ACTUALLY fetched on
    that source when discover.py resolved a real URL different from `slug`
    (our own community identity/output key) — defaults to `slug` so a caller
    that never discovered anything keeps the old identity-slug-as-URL
    behavior. Never reconstruct a source_url from `slug` directly: that would
    silently record a URL that was never fetched."""
    as_of = as_of or date.today().isoformat()
    naplesgolfguy_slug = naplesgolfguy_slug or slug
    fiftyfive_places_slug = fiftyfive_places_slug or slug

    row: dict = {
        "community_slug": slug,
        "label": label,
        "county": county,
        "home_count": None,
        "home_count_source_url": None,
        "home_count_as_of": None,
        "gated": None,
        "golf_structure": None,
        "golf_holes": None,
        "golf_courses": None,
        "golf_source_url": None,
        "golf_as_of": None,
        "hoa_fee_range": None,
        "fees_included": None,
        "cdd_flag": None,
        "fees_source_url": None,
        "fees_as_of": None,
        "amenities_source_url": None,
        "amenities_as_of": None,
    }
    for key in _AMENITY_KEYS:
        row[key] = None
    for key in _GOLF_DETAIL_KEYS:
        row[key] = None
    for key in _FIFTYFIVE_TEXT_KEYS:
        row[key] = None
    row["activity_director"] = None

    # --- golf group ---
    # Fires whenever naplesgolfguy returned golf_structure OR holes/courses OR
    # any of the club_type/fee/fnb detail fields -- not gated strictly behind
    # golf_structure any more, so a page whose membership-type text didn't
    # resolve to a known enum (see module docstring) still contributes its
    # real holes/club_type/fee data instead of the whole group being dropped.
    naplesgolfguy_has_golf_data = naplesgolfguy and (
        naplesgolfguy.get("golf_structure") is not None
        or naplesgolfguy.get("golf_holes") is not None
        or naplesgolfguy.get("golf_courses") is not None
        or any(naplesgolfguy.get(k) is not None for k in _GOLF_DETAIL_KEYS)
    )
    if naplesgolfguy_has_golf_data:
        row["golf_holes"] = naplesgolfguy.get("golf_holes")
        row["golf_courses"] = naplesgolfguy.get("golf_courses")
        for key in _GOLF_DETAIL_KEYS:
            row[key] = naplesgolfguy.get(key)
        if naplesgolfguy.get("golf_structure") is not None:
            row["golf_structure"] = naplesgolfguy["golf_structure"]
        elif hoa_comparison and hoa_comparison.get("golf_structure") is not None:
            # naplesgolfguy fetched real detail (holes/club_type/fees) but its
            # own membership-type text didn't map to a known enum -- the
            # curated HOA-comparison table's golf_structure is a real,
            # independently-sourced value for the SAME community, so it still
            # fills the enum. golf_source_url below points at naplesgolfguy
            # regardless (it supplied the bulk of this group) -- v1 has one
            # url per group, not per field; a future schema could split this.
            row["golf_structure"] = hoa_comparison["golf_structure"]
        row["golf_source_url"] = naplesgolfguy_url(naplesgolfguy_slug)
        row["golf_as_of"] = as_of
    elif hoa_comparison and hoa_comparison.get("golf_structure") is not None:
        row["golf_structure"] = hoa_comparison["golf_structure"]
        row["golf_source_url"] = HOA_COMPARISON_URL
        row["golf_as_of"] = as_of

    # --- 55places listing-profile group (home_count/gated + the rest) ---
    _fiftyfive_all_keys = ("home_count", "gated", "activity_director") + _FIFTYFIVE_TEXT_KEYS
    if fiftyfive_places and any(fiftyfive_places.get(k) is not None for k in _fiftyfive_all_keys):
        row["home_count_source_url"] = fiftyfive_places_url(fiftyfive_places_slug)
        row["home_count_as_of"] = as_of
        for key in _fiftyfive_all_keys:
            if fiftyfive_places.get(key) is not None:
                row[key] = fiftyfive_places[key]

    # --- amenities group: 55places preferred, naplesgolfguy fallback ---
    amenities_source = None
    if fiftyfive_places and any(fiftyfive_places.get(k) is not None for k in _AMENITY_KEYS):
        amenities_source = fiftyfive_places
        row["amenities_source_url"] = fiftyfive_places_url(fiftyfive_places_slug)
    elif naplesgolfguy and any(naplesgolfguy.get(k) is not None for k in _AMENITY_KEYS):
        amenities_source = naplesgolfguy
        row["amenities_source_url"] = naplesgolfguy_url(naplesgolfguy_slug)
    if amenities_source is not None:
        for key in _AMENITY_KEYS:
            row[key] = amenities_source.get(key)
        row["amenities_as_of"] = as_of

    # --- fees group (curated comparison table only, v1) ---
    if hoa_comparison and hoa_comparison.get("hoa_fee_range") is not None:
        hoa_fee_range = hoa_comparison["hoa_fee_range"]
        if hoa_comparison.get("is_estimate"):
            # Re-embed the "(est.)" marker distill_realtyofnaplesfl.py stripped for its
            # own field-separation purposes -- the honesty signal must survive into the
            # stored value since there's no separate is_estimate column (schema v1).
            hoa_fee_range = f"{hoa_fee_range} (est.)"
        row["hoa_fee_range"] = hoa_fee_range
        row["fees_included"] = hoa_comparison.get("fees_included")
        row["cdd_flag"] = hoa_comparison.get("cdd_flag")
        row["fees_source_url"] = HOA_COMPARISON_URL
        row["fees_as_of"] = as_of

    return row
