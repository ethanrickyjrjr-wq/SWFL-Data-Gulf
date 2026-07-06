"""No-network unit tests for the parcel_subdivision normalizer (communities-swfl
Phase 1 T2). Mirrors the ArcGIS `features[].attributes` shape verbatim."""
from unittest.mock import patch

from ingest.pipelines.parcel_subdivision.resources import (
    _fetch_page_with_shrink,
    _normalize,
    _stem,
)


def test_normalize_maps_type_and_stems_name():
    feats = [{"attributes": {
        "PARCEL_ID": "P1", "S_LEGAL": "HERITAGE BAY UNIT 12", "DOR_UC": "004",
        "JV": 250000, "PHY_ZIPCD": 34120, "PHY_ADDR1": "1 X ST",
    }}]
    r = _normalize(feats, "collier")
    assert len(r) == 1
    assert r[0]["property_type"] == "condominium"
    assert r[0]["subdivision_name"] == "HERITAGE BAY"  # UNIT + everything after stripped
    assert r[0]["zip"] == "34120"
    assert r[0]["just_value"] == 250000.0
    assert r[0]["phy_addr1"] == "1 X ST"
    assert r[0]["county"] == "collier"


def test_normalize_drops_non_residential():
    feats = [{"attributes": {"PARCEL_ID": "P2", "S_LEGAL": "X", "DOR_UC": "010"}}]  # 010 = commercial
    assert _normalize(feats, "collier") == []


def test_normalize_drops_missing_parcel_id():
    feats = [{"attributes": {"S_LEGAL": "X", "DOR_UC": "001"}}]
    assert _normalize(feats, "collier") == []


def test_normalize_handles_null_optional_fields():
    feats = [{"attributes": {"PARCEL_ID": "P3", "S_LEGAL": None, "DOR_UC": "001", "JV": None}}]
    r = _normalize(feats, "collier")
    assert r[0]["subdivision_name"] == ""
    assert r[0]["just_value"] is None
    assert r[0]["zip"] is None
    assert r[0]["phy_addr1"] is None


def test_stem_matches_ts_reconciler_semantics():
    # Same cases the TS `normalizeSubdivisionName` test suite covers (subdivision-aliases.test.mts).
    assert _stem("HERITAGE BAY UNIT 12") == "HERITAGE BAY"
    assert _stem("Heritage Bay, Phase 1") == "HERITAGE BAY"
    assert _stem("PELICAN BAY TR 1") == "PELICAN BAY TR 1"  # "TR" not a stripped qualifier (matches TS list)
    assert _stem("LELY RESORT ADDITION 3") == "LELY RESORT"


def test_shrink_retries_smaller_page_size_on_soft_400():
    """Reproduces the live 07/06/2026 finding: OBJECTID>2274627 soft-400'd at
    2000 but succeeded at 500 — _fetch_page_with_shrink must halve and retry
    rather than raise immediately."""
    calls = []

    def fake_fetch_page(last_oid, page_size):
        calls.append(page_size)
        if page_size > 500:
            return {"error": {"code": 400, "message": "Cannot perform query."}}
        return {"features": [{"attributes": {"OBJECTID": 1}}]}

    with patch("ingest.pipelines.parcel_subdivision.resources._fetch_page", side_effect=fake_fetch_page):
        body, used_size = _fetch_page_with_shrink(2274627, 2000)
    assert used_size == 500
    assert "features" in body
    assert calls == [2000, 1000, 500]  # halves each time until it succeeds


def test_shrink_raises_when_even_minimum_page_size_fails():
    def always_soft_400(last_oid, page_size):
        return {"error": {"code": 400, "message": "Cannot perform query."}}

    with patch("ingest.pipelines.parcel_subdivision.resources._fetch_page", side_effect=always_soft_400):
        try:
            _fetch_page_with_shrink(2274627, 2000)
            assert False, "expected RuntimeError"
        except RuntimeError as e:
            assert "minimum page size" in str(e)


def test_dor_code_is_zero_padded_before_lookup():
    # ArcGIS sometimes serves DOR_UC unpadded ("1" not "001") — must still match.
    feats = [{"attributes": {"PARCEL_ID": "P4", "S_LEGAL": "X", "DOR_UC": "1"}}]
    r = _normalize(feats, "collier")
    assert r[0]["property_type"] == "single-family"
