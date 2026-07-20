from unittest.mock import patch


def test_dry_run_skips_dlt() -> None:
    """--dry-run reads + normalizes the raw files but never touches dlt.pipeline."""
    with (
        patch(
            "ingest.pipelines.lee_deed_official_records.pipeline._read_raw_files",
            return_value=[{"internal_doc_id": "stub"}],
        ),
        patch("dlt.pipeline") as mock_pipeline,
    ):
        from ingest.pipelines.lee_deed_official_records.pipeline import main

        result = main(["--dry-run"])

    assert result == 0
    mock_pipeline.assert_not_called()
