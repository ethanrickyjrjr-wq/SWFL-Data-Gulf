"""No-network unit tests for the parcel_subdivision normalizer (communities-swfl
Phase 1 T2). Mirrors the ArcGIS `features[].attributes` shape verbatim."""
from unittest.mock import patch

from ingest.pipelines.parcel_subdivision import resources
from ingest.pipelines.parcel_subdivision.resources import (
    _fetch_all_object_ids,
    _fetch_object_id_batch,
    _iter_collier_attrs,
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


def test_fetch_all_object_ids_parses_and_sorts():
    """returnIdsOnly is the working retrieval path on this layer (verified live
    07/06/2026 returning all 364,827 Collier OIDs). Parse + sort the id array."""
    with patch(
        "ingest.pipelines.parcel_subdivision.resources._request",
        return_value={"objectIds": [3, 1, 2]},
    ):
        assert _fetch_all_object_ids() == [1, 2, 3]


def test_fetch_all_object_ids_raises_on_error_body():
    with patch(
        "ingest.pipelines.parcel_subdivision.resources._request",
        return_value={"error": {"code": 400, "message": "boom"}},
    ):
        try:
            _fetch_all_object_ids()
            assert False, "expected RuntimeError"
        except RuntimeError as e:
            assert "returnIdsOnly failed" in str(e)


def test_object_id_batch_splits_on_soft_400():
    """A batch that soft-400s (response-size limit) is split in half and recursed —
    each half fetched by objectIds, no data lost. Reproduces the real fix for the
    07/06/2026 soft-400: the rows are fine, the whole-batch response was just too big."""
    def fake_request(params, **kwargs):
        oids = params["objectIds"].split(",")
        if len(oids) > 2:  # only over-large batches soft-400
            return {"error": {"code": 400, "message": "Cannot perform query."}}
        return {"features": [{"attributes": {"OBJECTID": int(o)}} for o in oids]}

    with patch("ingest.pipelines.parcel_subdivision.resources._request", side_effect=fake_request):
        feats = _fetch_object_id_batch([1, 2, 3, 4])
    assert sorted(f["attributes"]["OBJECTID"] for f in feats) == [1, 2, 3, 4]


def test_object_id_batch_splits_on_transport_504():
    """The live 07/06/2026 failure: a 1000-id batch 504'd (gateway timeout on a
    too-heavy response). A batch that raises at the transport level must halve and
    recurse just like a soft-400 — smaller batches serialize under the timeout."""
    import requests as _rq

    def fake_request(params, **kwargs):
        oids = params["objectIds"].split(",")
        if len(oids) > 2:  # heavy batch -> gateway 504 after _request's own retries
            raise _rq.exceptions.HTTPError("504 Server Error: Gateway Timeout")
        return {"features": [{"attributes": {"OBJECTID": int(o)}} for o in oids]}

    with patch("ingest.pipelines.parcel_subdivision.resources._request", side_effect=fake_request):
        feats = _fetch_object_id_batch([1, 2, 3, 4, 5])
    assert sorted(f["attributes"]["OBJECTID"] for f in feats) == [1, 2, 3, 4, 5]


def test_object_id_batch_reraises_lone_transport_failure():
    """A single real row failing at the transport level is NOT silently skipped —
    that would be silent data loss on a transient blip. It re-raises."""
    import requests as _rq
    resources.SKIPPED_OBJECT_IDS.clear()

    def always_504(params, **kwargs):
        raise _rq.exceptions.HTTPError("504 Server Error: Gateway Timeout")

    with patch("ingest.pipelines.parcel_subdivision.resources._request", side_effect=always_504):
        try:
            _fetch_object_id_batch([42])
            assert False, "expected the transport error to propagate"
        except _rq.exceptions.HTTPError:
            pass
    assert resources.SKIPPED_OBJECT_IDS == []  # not skipped


def test_object_id_batch_skips_a_lone_unservable_id():
    """Safety net only (no such id exists per the probe): a single OBJECTID that
    STILL soft-400s alone is logged + skipped, never aborts the ingest."""
    resources.SKIPPED_OBJECT_IDS.clear()

    def fake_request(params, **kwargs):
        oids = [int(o) for o in params["objectIds"].split(",")]
        if 99 in oids:  # any batch containing the poison id soft-400s -> forces split to [99]
            return {"error": {"code": 400, "message": "Cannot perform query."}}
        return {"features": [{"attributes": {"OBJECTID": o}} for o in oids]}

    with patch("ingest.pipelines.parcel_subdivision.resources._request", side_effect=fake_request):
        feats = _fetch_object_id_batch([98, 99, 100])
    assert sorted(f["attributes"]["OBJECTID"] for f in feats) == [98, 100]
    assert resources.SKIPPED_OBJECT_IDS == [99]


def test_iter_collier_attrs_batches_the_full_id_list():
    """One returnIdsOnly call, then objectIds fetches in batches of batch_size —
    every id lands exactly once."""
    ids = list(range(1, 2501))  # 2500 ids -> 3 batches at batch_size=1000

    def fake_request(params, **kwargs):
        if params.get("returnIdsOnly") == "true":
            return {"objectIds": list(reversed(ids))}  # unsorted on purpose
        oids = [int(o) for o in params["objectIds"].split(",")]
        return {"features": [{"attributes": {"OBJECTID": o}} for o in oids]}

    with patch("ingest.pipelines.parcel_subdivision.resources._request", side_effect=fake_request):
        got = [f["attributes"]["OBJECTID"] for f in _iter_collier_attrs(batch_size=1000)]
    assert sorted(got) == ids
    assert len(got) == 2500  # no dupes, no drops


def test_dor_code_is_zero_padded_before_lookup():
    # ArcGIS sometimes serves DOR_UC unpadded ("1" not "001") — must still match.
    feats = [{"attributes": {"PARCEL_ID": "P4", "S_LEGAL": "X", "DOR_UC": "1"}}]
    r = _normalize(feats, "collier")
    assert r[0]["property_type"] == "single-family"
