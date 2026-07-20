"""Combine per-source partial dicts (Tasks 2-4) into one community_profiles row.

Precedence per field GROUP (never per individual field within a group - a
group's facts come from one page, so they carry one source_url + as_of pair,
matching migrations/20260706_community_profiles.sql's comment):
  - golf group: naplesgolfguy first (dedicated golf detail), else the
    hoa_comparison row's golf_structure (curated, no holes/courses count).
  - amenities group (pool/tennis/pickleball/fitness/clubhouse/on_site_dining/
    boating_marina): 55places first (broader, non-golf-restricted coverage),
    else naplesgolfguy.
  - home_count/gated group: 55places only (naplesgolfguy doesn't carry these).
  - fees group (hoa_fee_range/cdd_flag): realtyofnaplesfl's curated table only
    for v1 (the realtyofnaples.com per-listing aggregate lane is a follow-up,
    per the design spec's "Out of scope" section).
"""
from __future__ import annotations

from datetime import date

from .constants import HOA_COMPARISON_URL, fiftyfive_places_url, naplesgolfguy_url

_AMENITY_KEYS = (
    "pool", "tennis", "pickleball", "fitness", "clubhouse", "on_site_dining", "boating_marina",
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
) -> dict:
    as_of = as_of or date.today().isoformat()

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
        "cdd_flag": None,
        "fees_source_url": None,
        "fees_as_of": None,
        "amenities_source_url": None,
        "amenities_as_of": None,
    }
    for key in _AMENITY_KEYS:
        row[key] = None

    # --- golf group ---
    if naplesgolfguy and naplesgolfguy.get("golf_structure") is not None:
        row["golf_structure"] = naplesgolfguy["golf_structure"]
        row["golf_holes"] = naplesgolfguy.get("golf_holes")
        row["golf_courses"] = naplesgolfguy.get("golf_courses")
        row["golf_source_url"] = naplesgolfguy_url(slug)
        row["golf_as_of"] = as_of
    elif hoa_comparison and hoa_comparison.get("golf_structure") is not None:
        row["golf_structure"] = hoa_comparison["golf_structure"]
        row["golf_source_url"] = HOA_COMPARISON_URL
        row["golf_as_of"] = as_of

    # --- home_count / gated group (55places only) ---
    if fiftyfive_places and (
        fiftyfive_places.get("home_count") is not None or fiftyfive_places.get("gated") is not None
    ):
        row["home_count_source_url"] = fiftyfive_places_url(slug)
        row["home_count_as_of"] = as_of
        if fiftyfive_places.get("home_count") is not None:
            row["home_count"] = fiftyfive_places["home_count"]
        if fiftyfive_places.get("gated") is not None:
            row["gated"] = fiftyfive_places["gated"]

    # --- amenities group: 55places preferred, naplesgolfguy fallback ---
    amenities_source = None
    if fiftyfive_places and any(fiftyfive_places.get(k) is not None for k in _AMENITY_KEYS):
        amenities_source = fiftyfive_places
        row["amenities_source_url"] = fiftyfive_places_url(slug)
    elif naplesgolfguy and any(naplesgolfguy.get(k) is not None for k in _AMENITY_KEYS):
        amenities_source = naplesgolfguy
        row["amenities_source_url"] = naplesgolfguy_url(slug)
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
        row["cdd_flag"] = hoa_comparison.get("cdd_flag")
        row["fees_source_url"] = HOA_COMPARISON_URL
        row["fees_as_of"] = as_of

    return row
