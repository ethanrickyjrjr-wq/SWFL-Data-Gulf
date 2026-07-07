"""Tests for the property_type fix in extract_api.py.

SteadyAPI /search returns NO property-type field on any row (verified live 07/07/2026 against
every real-estate endpoint) — property_type is a request-side filter only. parse_steadyapi used
to hardcode every non-land row to "single_family"; these tests guard the type_hint path that
replaced it (scan_county_api threads a per-property_id type from build_type_lookup's sweep).
"""
from ingest.pipelines.listing_lifecycle.extract_api import map_property_type, parse_steadyapi

RAW = {
    "property_id": "123",
    "permalink": "https://www.realtor.com/x/1403-NE-19th-Ter_Cape-Coral_FL_33909_M1",
    "price": {"amount": 400000},
    "status": "for_sale",
    "location": {"lat": 26.6, "lon": -81.9, "county_fips": "12071"},
    "description": {"beds": 2, "sqft": 1200},
    "flags": {},
}


def test_no_hint_and_not_land_falls_to_other_not_single_family():
    """The old bug: no hint used to default to 'single_family'. It must not anymore — 'other'
    is honest about not knowing, versus asserting a specific type we don't hold."""
    r = parse_steadyapi(RAW, "Cape Coral", "FL")
    assert r["property_type"] == "other"


def test_condos_hint_maps_to_condo():
    r = parse_steadyapi(RAW, "Cape Coral", "FL", type_hint="condos")
    assert r["property_type"] == "condo"


def test_townhomes_hint_maps_to_townhouse():
    r = parse_steadyapi(RAW, "Cape Coral", "FL", type_hint="townhomes")
    assert r["property_type"] == "townhouse"


def test_multi_family_hint_maps_to_multi_family():
    r = parse_steadyapi(RAW, "Cape Coral", "FL", type_hint="multi_family")
    assert r["property_type"] == "multi_family"


def test_single_family_hint_maps_to_single_family():
    r = parse_steadyapi(RAW, "Cape Coral", "FL", type_hint="single_family")
    assert r["property_type"] == "single_family"


def test_land_heuristic_still_applies_with_no_hint():
    """Land isn't a filterable /search value at all, so it can never carry a hint — the
    beds-is-None-and-lot_sqft heuristic is the only signal and must survive the refactor."""
    raw_land = {**RAW, "description": {"lot_sqft": 21780}}
    r = parse_steadyapi(raw_land, "Cape Coral", "FL")
    assert r["property_type"] == "land"


def test_land_heuristic_does_not_fire_over_a_type_hint():
    """A hint always wins even if the row also happens to have no beds — the vendor's own
    filter classification is more trustworthy than our lot_sqft heuristic."""
    raw_no_beds = {**RAW, "description": {"lot_sqft": 21780}}
    r = parse_steadyapi(raw_no_beds, "Cape Coral", "FL", type_hint="condos")
    assert r["property_type"] == "condo"


def test_map_property_type_covers_the_compound_filter_values():
    """PROPERTY_TYPE_MAP was missing keys for the raw filter-value strings themselves
    (single_family/multi_family/duplex_triplex) — those used to fall through to 'other'."""
    assert map_property_type("single_family") == "single_family"
    assert map_property_type("condos") == "condo"
    assert map_property_type("townhomes") == "townhouse"
    assert map_property_type("multi_family") == "multi_family"
    assert map_property_type("duplex_triplex") == "multi_family"
    assert map_property_type(None) == "other"
    assert map_property_type("condo_townhome_rowhome_coop") == "other"  # excluded filter, unmapped
