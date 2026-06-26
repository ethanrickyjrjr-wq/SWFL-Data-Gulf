"""Deterministic tests for the active listings normalizer + card parser (no network)."""
from __future__ import annotations

from ingest.pipelines.active_listings.distill import normalize
from ingest.pipelines.active_listings.extract import _parse_cards

_RAW_HOME = {
    "mls_id": "225073939",
    "zip_code": "34102",
    "county": "Collier",
    "list_price": "$17,950,000",
    "street_address": "285 Central Avenue",
    "city": "Naples ,",
    "state": "FL",
    "community": "OLDE NAPLES",
    "details": "5 Beds 8 Baths 0.34 Acres 6,822 SqFt 244 Days on Market",
    "listing_url": "https://listings.example.com/listing/225073939/285-central-avenue-naples-fl-34102/",
}
_RAW_LAND = {
    "mls_id": "226014932",
    "zip_code": "34102",
    "county": "Collier",
    "list_price": "$195,000,000",
    "street_address": "100 & 104 Bay Road",
    "city": "Naples ,",
    "state": "FL",
    "community": "PORT ROYAL",
    "details": "Land 5.39 Acres 77 Days on Market",
    "listing_url": "https://listings.example.com/listing/226014932/x-bay-road-naples-fl-34102/",
}


def test_normalize_home_row_types_and_fields():
    [r] = normalize([_RAW_HOME])
    assert r["source_name"] == "active_listings_seed"
    assert r["mls_id"] == "225073939"
    assert r["list_price"] == 17950000.0
    assert r["beds"] == 5
    assert r["baths"] == 8.0
    assert r["acres"] == 0.34
    assert r["sqft"] == 6822
    assert r["days_on_market"] == 244
    assert r["city"] == "Naples"  # trailing comma stripped
    assert r["status"] == "active"
    assert r["property_type"] == "residential"
    assert r["county"] == "Collier"  # derived from the ZIP fixture


def test_normalize_land_row_has_no_beds_and_is_land():
    [r] = normalize([_RAW_LAND])
    assert r["beds"] is None
    assert r["baths"] is None
    assert r["acres"] == 5.39
    assert r["property_type"] == "land"


def test_normalize_drops_rows_missing_key_fields():
    assert normalize([{"mls_id": "", "zip_code": "34102"}]) == []
    assert normalize([{"mls_id": "X1", "zip_code": ""}]) == []


_RAW_RENTAL = {
    "mls_id": "A4695703",
    "zip_code": "34239",
    "county": "Sarasota",
    "list_price": "$1,195",
    "price_suffix": "/ month",  # the lease signal the for-sale feed must NOT count as a sale price
    "street_address": "3533 Bahia Vista Street",
    "city": "Sarasota ,",
    "state": "FL",
    "details": "1 Beds 1 Baths 850 SqFt 12 Days on Market",
    "listing_url": "https://listings.example.com/listing/A4695703/3533-bahia-vista-street-sarasota-fl-34239/",
}


def test_normalize_classifies_rental_from_price_suffix():
    [r] = normalize([_RAW_RENTAL])
    assert r["listing_type"] == "rent"  # /month suffix ⇒ lease, not a $1,195 "home"
    assert r["list_price"] == 1195.0
    assert r["property_type"] == "residential"


def test_normalize_classifies_sale_when_no_suffix():
    [r] = normalize([_RAW_HOME])
    assert r["listing_type"] == "sale"  # for-sale card has no price-suffix span


def test_normalize_drops_broken_placeholder_card():
    junk = {"mls_id": "X9", "zip_code": "34102", "list_price": "$18", "details": ""}
    assert normalize([junk]) == []  # no details, no suffix, $18 ⇒ not a real listing


def test_normalize_price_floor_backstops_no_suffix_rental():
    # Naples-MLS rental card carries NO suffix span — a 4bd/3056sqft Naples 34102 "$35,000" is a
    # seasonal rental, not a $35k home. The sub-$50k residential floor catches it.
    naples_seasonal = {
        "mls_id": "226018217",
        "zip_code": "34102",
        "county": "Collier",
        "list_price": "$35,000",
        "details": "4 Beds 4 Baths 3,056 SqFt 10 Days on Market",
        "listing_url": "https://listings.example.com/listing/226018217/x-naples-fl-34102/",
    }
    [r] = normalize([naples_seasonal])
    assert r["listing_type"] == "rent"
    assert r["property_type"] == "residential"


def test_normalize_real_home_above_floor_is_sale():
    home = {
        "mls_id": "226018915",
        "zip_code": "33905",
        "county": "Lee",
        "list_price": "$401,420",
        "details": "4 Beds 3 Baths 2,045 SqFt 5 Days on Market",
        "listing_url": "https://listings.example.com/listing/226018915/x-fort-myers-fl-33905/",
    }
    assert normalize([home])[0]["listing_type"] == "sale"


def test_normalize_cheap_land_is_not_reclassified_as_rent():
    # A $30k vacant lot is a real for-sale parcel — the rent floor must NOT touch land.
    lot = {
        "mls_id": "L1",
        "zip_code": "34102",
        "county": "Collier",
        "list_price": "$30,000",
        "details": "Land 0.25 Acres 120 Days on Market",
        "listing_url": "https://listings.example.com/listing/L1/x-naples-fl-34102/",
    }
    [r] = normalize([lot])
    assert r["property_type"] == "land"
    assert r["listing_type"] == "sale"


def test_parse_cards_captures_rental_price_suffix():
    html = """
    <a class="listing__link" href="/listing/A4695703/3533-bahia-vista-street-sarasota-fl-34239/">
      <span class="listing__price-value">$1,195</span>
      <span class="listing__price-suffix">/<!-- -->month</span>
      <span class="listing__city">Sarasota ,</span>
      <span class="listing__property-details">1 Beds 1 Baths 850 SqFt 12 Days on Market</span>
    </a>
    """
    [c] = _parse_cards(html, "Sarasota")
    assert c["price_suffix"] and "month" in c["price_suffix"].lower()
    assert normalize([c])[0]["listing_type"] == "rent"


def test_parse_cards_extracts_from_real_markup():
    html = """
    <a class="listing__link" href="/listing/225073939/285-central-avenue-naples-fl-34102/">
      <span class="listing__price-value">$17,950,000</span>
      <span class="listing__city">Naples ,</span>
      <span class="listing__state">FL</span>
      <span class="listing__subdivision">OLDE NAPLES</span>
      <span class="listing__address-display">285 Central Avenue</span>
      <span class="listing__property-details">5 Beds 8 Baths 0.34 Acres 6,822 SqFt 244 Days on Market</span>
    </a>
    """
    cards = _parse_cards(html, "Collier")
    assert len(cards) == 1
    c = cards[0]
    assert c["mls_id"] == "225073939"
    assert c["zip_code"] == "34102"
    assert c["list_price"] == "$17,950,000"
    assert c["street_address"] == "285 Central Avenue"
    assert "5 Beds" in c["details"]
