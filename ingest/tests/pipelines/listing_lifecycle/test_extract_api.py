"""Tests for the API-fed listing extractor (RentCast spine + SteadyAPI photos).

Pure parser + merge tests are network-free; fixtures mirror the live-probed record shapes
(RULE 0.4, 2026-06-30): RentCast countyFips 3-digit "071"; SteadyAPI location.county_fips
5-digit "12071". The fetch/scan tests (mocked HTTP) live alongside in the second block."""
from __future__ import annotations

from ingest.pipelines.listing_lifecycle.extract_api import (
    map_property_type,
    merge_by_proximity,
    parse_rentcast,
    parse_steadyapi,
)

# Real-shaped RentCast /v1/listings/sale record (fields verified against the live API 2026-06-30).
_RENTCAST_ROW = {
    "id": "311-Ne-15th-St,-Cape-Coral,-FL-33909",
    "formattedAddress": "311 Ne 15th St, Cape Coral, FL 33909",
    "addressLine1": "311 Ne 15th St", "city": "Cape Coral", "state": "FL",
    "zipCode": "33909", "county": "Lee", "countyFips": "071", "stateFips": "12",
    "latitude": 26.680362, "longitude": -81.967327,
    "propertyType": "Single Family", "bedrooms": 3, "bathrooms": 2,
    "squareFootage": 1672, "lotSize": 8712, "status": "Active", "price": 359999,
    "listingType": "New Construction", "listedDate": "2026-06-26T00:00:00.000Z",
    "daysOnMarket": 5, "mlsName": "FLGulfCoastMLS", "mlsNumber": "2026027839",
}

# Real-shaped SteadyAPI search record.
_STEADYAPI_ROW = {
    "property_id": "5493101642",
    "permalink": "https://www.realtor.com/realestateandhomes-detail/1403-NE-19th-Ter_Cape-Coral_FL_33909_M54931-01642",
    "price": {"amount": 374900}, "status": "for_sale", "source_type": "mls",
    "photo_url": "https://ap.rdcpix.com/abc/x.webp",
    "location": {"lat": 26.6712, "lon": -81.961, "county_fips": "12071"},
    "description": {"beds": 4, "sqft": 1800, "lot_sqft": 10000},
    "flags": {"is_pending": False, "is_price_reduced": True},
}


def test_parse_rentcast_core_fields():
    r = parse_rentcast(_RENTCAST_ROW, county_seed="Lee")
    assert r is not None
    assert r["street_address"] == "311 Ne 15th St"
    assert r["zip_code"] == "33909"
    assert r["county"] == "Lee"
    assert r["county_fips"] == "12071"           # "12" + "071"
    assert r["list_price"] == 359999
    assert r["beds"] == 3 and r["baths"] == 2
    assert r["property_type"] == "single_family"
    assert r["days_on_market"] == 5              # REAL DOM — unlocks the suppressed brain metric
    assert r["listed_date"] == "2026-06-26"
    assert r["mls_number"] == "2026027839"
    assert r["sale_or_rent"] == "sale"
    assert r["listing_id"] == _RENTCAST_ROW["id"]
    assert r["photo_url"] is None                # RentCast carries no photo — SteadyAPI fills via merge


def test_parse_rentcast_out_of_scope_county_returns_none():
    row = {**_RENTCAST_ROW, "countyFips": "086", "county": "Miami-Dade"}  # 12086 not in scope
    assert parse_rentcast(row, county_seed="Lee") is None


def test_parse_rentcast_missing_identity_returns_none():
    assert parse_rentcast({**_RENTCAST_ROW, "addressLine1": ""}, county_seed="Lee") is None
    assert parse_rentcast({**_RENTCAST_ROW, "zipCode": ""}, county_seed="Lee") is None


def test_parse_rentcast_no_mls_on_new_construction():
    # New-construction/builder rows legitimately carry no MLS#; that is a real NULL, not a parse miss.
    row = {k: v for k, v in _RENTCAST_ROW.items() if k not in ("mlsNumber", "mlsName")}
    r = parse_rentcast(row, county_seed="Lee")
    assert r is not None and r["mls_number"] is None and r["mls_name"] is None


def test_parse_steadyapi_parses_permalink_and_photo():
    r = parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")
    assert r is not None
    assert r["street_address"] == "1403 NE 19th Ter"
    assert r["zip_code"] == "33909"
    assert r["county_fips"] == "12071"
    assert r["county"] == "Lee"
    assert r["photo_url"].endswith(".webp")
    assert r["list_price"] == 374900
    assert r["beds"] == 4
    assert r["property_type"] == "single_family"  # has beds -> a home, not land
    assert r["days_on_market"] is None            # SteadyAPI gives no list date / DOM


def test_parse_steadyapi_land_when_no_beds_but_lot():
    row = {**_STEADYAPI_ROW, "description": {"beds": None, "lot_sqft": 10890}}
    r = parse_steadyapi(row, city="Cape Coral", state="FL")
    assert r is not None and r["property_type"] == "land" and r["beds"] is None


def test_parse_steadyapi_out_of_scope_returns_none():
    row = {**_STEADYAPI_ROW, "location": {"lat": 1, "lon": 1, "county_fips": "12086"}}
    assert parse_steadyapi(row, city="Miami", state="FL") is None


def test_map_property_type_fallback():
    assert map_property_type("Single Family") == "single_family"
    assert map_property_type("Quadruplex") == "other"
    assert map_property_type(None) == "other"


def test_merge_by_proximity_attaches_photo_within_threshold():
    rc = [{**parse_rentcast(_RENTCAST_ROW, county_seed="Lee")}]
    sa = [parse_steadyapi({**_STEADYAPI_ROW,
                           "location": {"lat": 26.680360, "lon": -81.967330, "county_fips": "12071"}},
                          city="Cape Coral", state="FL")]
    merged = merge_by_proximity(rc, sa)
    assert merged[0]["photo_url"] is not None    # same coords -> photo grafted onto the RentCast spine


def test_merge_by_proximity_no_match_keeps_none_and_appends_extra():
    rc = [{**parse_rentcast(_RENTCAST_ROW, county_seed="Lee")}]
    sa = [parse_steadyapi(_STEADYAPI_ROW, city="Cape Coral", state="FL")]  # ~1km away, diff address
    merged = merge_by_proximity(rc, sa)
    assert merged[0]["photo_url"] is None        # no proximity match -> RentCast row keeps no photo
    assert len(merged) == 2                       # SteadyAPI-only listing appended (active set not narrowed)


def test_merge_dedups_same_address_rentcast_wins_even_when_coords_diverge():
    # SAME physical address in both feeds, but coords diverge >200m (geocode variance) so proximity
    # won't graft. The address_key collision must resolve to the RentCast spine (real DOM/MLS#), and
    # the sparse SteadyAPI duplicate must NOT survive (no double-count, no clobber). Advisor Gap #3.
    rc = [parse_rentcast(_RENTCAST_ROW, county_seed="Lee")]
    sa_dupe = parse_steadyapi(
        {**_STEADYAPI_ROW,
         "permalink": "https://www.realtor.com/realestateandhomes-detail/311-Ne-15th-St_Cape-Coral_FL_33909_M99999-00000",
         "location": {"lat": 27.5, "lon": -82.5, "county_fips": "12071"}},  # far away
        city="Cape Coral", state="FL",
    )
    merged = merge_by_proximity(rc, [sa_dupe])
    assert len(merged) == 1                        # the duplicate address is deduped, not double-counted
    assert merged[0]["mls_number"] == "2026027839" # RentCast spine survived (SteadyAPI has no MLS#)
    assert merged[0]["days_on_market"] == 5


# ---------------------------------------------------------- fetch + scan (mocked HTTP, no network)
from unittest.mock import MagicMock, patch  # noqa: E402

from ingest.pipelines.listing_lifecycle import extract_api  # noqa: E402


def _resp(status, body):
    m = MagicMock()
    m.status_code = status
    m.json.return_value = body
    return m


def test_fetch_rentcast_paginates_then_exhausts_on_short_page():
    page1 = [_RENTCAST_ROW] * 500   # full page -> keep walking
    page2 = [_RENTCAST_ROW] * 17    # short page -> natural exhaustion
    with patch.object(extract_api.requests, "get", side_effect=[_resp(200, page1), _resp(200, page2)]):
        rows, ok = extract_api.fetch_rentcast_city("Cape Coral", key="k")
    assert len(rows) == 517 and ok is True


def test_fetch_rentcast_clean_empty_first_page_is_complete():
    with patch.object(extract_api.requests, "get", return_value=_resp(200, [])):
        rows, ok = extract_api.fetch_rentcast_city("Sanibel", key="k")
    assert rows == [] and ok is True            # legitimately 0 listings is COMPLETE, not a gap


def test_fetch_rentcast_non_200_is_a_gap():
    with patch.object(extract_api.requests, "get", return_value=_resp(429, {})):
        rows, ok = extract_api.fetch_rentcast_city("Cape Coral", key="k")
    assert rows == [] and ok is False           # 429 truncation -> NOT complete


def test_fetch_rentcast_no_key_is_a_gap():
    rows, ok = extract_api.fetch_rentcast_city("Cape Coral", key=None)
    assert rows == [] and ok is False


def test_fetch_steadyapi_paginates_to_meta_total():
    body1 = {"meta": {"total": 250}, "body": [_STEADYAPI_ROW] * 200}
    body2 = {"meta": {"total": 250}, "body": [_STEADYAPI_ROW] * 50}
    with patch.object(extract_api.requests, "get", side_effect=[_resp(200, body1), _resp(200, body2)]):
        rows, ok = extract_api.fetch_steadyapi_city("Cape Coral", key="p")
    assert len(rows) == 250 and ok is True


def test_scan_county_api_labels_and_counts(monkeypatch):
    monkeypatch.setenv("RENTCAST_API_KEY", "k")
    monkeypatch.setenv("PHOTOS_API", "p")
    with patch.object(extract_api, "fetch_rentcast_city", return_value=([_RENTCAST_ROW], True)), \
         patch.object(extract_api, "fetch_steadyapi_city", return_value=([_STEADYAPI_ROW], True)):
        out = extract_api.scan_county_api("Lee")
    assert out["count"] >= 1
    assert out["exhausted"] is True
    assert out["last_status"] == 200
    assert all(r["county"] == "Lee" for r in out["rows"])


def test_scan_county_api_clean_empty_city_stays_complete(monkeypatch):
    # A cleanly-empty city must NOT poison the whole county's completeness (robustness fix).
    monkeypatch.setenv("RENTCAST_API_KEY", "k")
    monkeypatch.setenv("PHOTOS_API", "p")
    with patch.object(extract_api, "fetch_rentcast_city", return_value=([], True)), \
         patch.object(extract_api, "fetch_steadyapi_city", return_value=([], True)):
        out = extract_api.scan_county_api("Lee")
    assert out["exhausted"] is True and out["count"] == 0


def test_scan_county_api_truncated_city_marks_incomplete(monkeypatch):
    monkeypatch.setenv("RENTCAST_API_KEY", "k")
    monkeypatch.setenv("PHOTOS_API", "p")
    with patch.object(extract_api, "fetch_rentcast_city", return_value=([_RENTCAST_ROW], False)), \
         patch.object(extract_api, "fetch_steadyapi_city", return_value=([_STEADYAPI_ROW], True)):
        out = extract_api.scan_county_api("Lee")
    assert out["exhausted"] is False and out["last_status"] != 200
