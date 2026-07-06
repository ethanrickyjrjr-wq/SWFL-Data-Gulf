"""No-network unit tests for the parcel_subdivision normalizer (communities-swfl
Phase 1 T2). Mirrors the ArcGIS `features[].attributes` shape verbatim."""
from ingest.pipelines.parcel_subdivision.resources import _normalize, _stem


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


def test_dor_code_is_zero_padded_before_lookup():
    # ArcGIS sometimes serves DOR_UC unpadded ("1" not "001") — must still match.
    feats = [{"attributes": {"PARCEL_ID": "P4", "S_LEGAL": "X", "DOR_UC": "1"}}]
    r = _normalize(feats, "collier")
    assert r[0]["property_type"] == "single-family"
