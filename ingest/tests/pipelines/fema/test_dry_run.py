from unittest.mock import patch


_FAKE_CLAIM = {"id": "abc123", "state": "FL", "yearOfLoss": 2024}


def test_dry_run_skips_dlt():
    with patch("dlt.pipeline") as mock_pipeline, \
         patch("ingest.pipelines.fema.resources._fetch_all_nfip_claims", return_value=[_FAKE_CLAIM]):
        from ingest.pipelines.fema.pipeline import main

        result = main(["--dry-run"])

    assert result == 0
    mock_pipeline.assert_not_called()
