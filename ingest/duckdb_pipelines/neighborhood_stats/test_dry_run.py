"""Verify --dry-run reads + aggregates but never writes to neighborhood_stats."""
from unittest.mock import MagicMock, patch


def test_dry_run_skips_replace_all():
    fake_conn = MagicMock()
    with patch("ingest.duckdb_pipelines.neighborhood_stats.pipeline._get_connection", return_value=fake_conn), \
         patch("ingest.duckdb_pipelines.neighborhood_stats.pipeline._load_parcel_subdivision_rows", return_value=[]), \
         patch("ingest.duckdb_pipelines.neighborhood_stats.pipeline._replace_all") as mock_replace_all:
        from ingest.duckdb_pipelines.neighborhood_stats.pipeline import main

        result = main(["--dry-run"])

    assert result == 0
    mock_replace_all.assert_not_called()
    fake_conn.close.assert_called_once()  # connection still cleaned up on the dry-run path
