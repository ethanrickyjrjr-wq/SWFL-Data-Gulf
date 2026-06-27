"""Deterministic tests for the Source-B card parser (no network).

Parses the sanitized fixture (real card structure, host scrubbed). Covers the three shapes that
matter: a single-family home, a vacant-land parcel (Acres-only ⇒ property_type land), and a condo
(alphanumeric MLS in region 240, unit number in the title but NOT the URL slug)."""
from __future__ import annotations

from pathlib import Path

from ingest.pipelines.listing_lifecycle.extract import _BAND_EDGES, _band_pairs, parse_cards

_FIXTURE = Path(__file__).parent / "fixtures" / "si_listing_cards.html"


def test_price_bands_cover_full_range_no_gaps():
    # Partitioning by price band is how we beat the source's ~3,000 deep-pagination cap; the bands
    # must tile the whole price range with no gap or overlap so no listing is missed.
    pairs = _band_pairs(_BAND_EDGES)
    assert pairs[0][0] == 0
    assert pairs[-1][1] >= 90_000_000
    for (lo, hi), (nxt_lo, nxt_hi) in zip(pairs, pairs[1:]):
        assert hi == nxt_lo  # consecutive — no gap, no overlap


def _cards():
    return parse_cards(_FIXTURE.read_text(encoding="utf-8"))


def test_parses_all_cards():
    assert len(_cards()) == 4


def test_single_family_card_fields():
    c = _cards()[0]
    assert c["mls"] == "2026027968"
    assert c["mls_region"] == "116"
    assert c["list_price"] == 379999  # clean int from data-price, not the "$379,999 33" text
    assert c["street_address"] == "458 S Windsor Ave"
    assert c["city"] == "Lehigh Acres"
    assert c["zip_code"] == "33974"  # from the data-url -fl-#####/ (ZIP gate G1)
    assert c["state"] == "FL"
    assert c["beds"] == 4
    assert c["baths"] == 2
    assert c["sqft"] == 1771
    assert c["property_type"] == "residential"
    assert c["sale_or_rent"] == "sale"  # Source B is for-sale only — no rent class exists
    assert "Example Realty" in (c["brokerage"] or "")
    assert c["subdivision"] == "Lehigh Acres"
    assert c["unit"] is None


def test_land_card_is_land_with_acres_and_no_beds():
    c = _cards()[1]
    assert c["mls"] == "226024187"
    assert c["list_price"] == 20900
    assert c["beds"] is None
    assert c["lot_acres"] == 0.23
    assert c["property_type"] == "land"


def test_condo_card_alnum_mls_region_240_and_unit_from_title():
    c = _cards()[2]
    assert c["mls"] == "C7527801"          # alphanumeric MLS preserved (region 240 = Charlotte/Sarasota)
    assert c["mls_region"] == "240"
    assert c["zip_code"] == "33919"
    assert c["unit"] == "B"                  # unit is in the title (#B), never in the URL slug
    assert c["property_type"] == "residential"
    assert c["beds"] == 2


def test_full_and_half_baths_parsed_not_concatenated():
    # "4 F 2 1/2" = 4 full + 2 half = 5.0 total. The naive digit-strip wrote 4212 into the live seed.
    c = _cards()[3]
    assert c["beds"] == 5
    assert c["baths"] == 5.0
    assert c["sqft"] == 4097
