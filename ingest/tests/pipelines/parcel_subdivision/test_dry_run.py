"""Pipeline-freshness rule (d): --dry-run must fetch + validate, then exit 0
without ever calling dlt.pipeline (data_lake write)."""
from unittest.mock import patch


def _fake_attrs(county: str):
    co_no = {"collier": 21, "lee": 46}[county]
    return {"attributes": {
        "OBJECTID": 1, "PARCEL_ID": f"{county.upper()}1", "S_LEGAL": "X UNIT 1",
        "DOR_UC": "001", "JV": 100000, "PHY_ZIPCD": 33901, "PHY_ADDR1": "1 X ST",
    }}


def _fake_request(params, **kwargs):
    if params.get("returnIdsOnly") == "true":
        return {"objectIds": [1]}
    return {"features": [_fake_attrs("lee")]}


def test_dry_run_skips_dlt():
    with patch("dlt.pipeline") as mock_pipeline, \
         patch("ingest.pipelines.parcel_subdivision.resources._request", side_effect=_fake_request), \
         patch("ingest.pipelines.parcel_subdivision.resources.arcgis_count", return_value=1):
        from ingest.pipelines.parcel_subdivision.pipeline import main

        result = main(["--dry-run", "--county", "both"])

    assert result == 0
    mock_pipeline.assert_not_called()
