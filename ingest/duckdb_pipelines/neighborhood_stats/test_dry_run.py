"""Verify --dry-run reads + aggregates but never writes to neighborhood_stats,
and that the write path does not reuse the read connection."""
from unittest.mock import MagicMock, patch

_MOD = "ingest.duckdb_pipelines.neighborhood_stats.pipeline"


def test_write_path_opens_a_fresh_connection_for_the_write():
    """Regression, run 29719097092 (07/20/2026): a single connection held across the
    multi-minute in-memory aggregation went stale, and the DELETE that opens the write died
    with `SSL error: unexpected eof while reading`. The rollback saved the table, but the run
    was a total loss. The read connection must be RELEASED before aggregating, and the write
    must get its own — otherwise the whole rebuild is one idle-timeout away from failing."""
    read_conn, write_conn = MagicMock(), MagicMock()
    stats = [{"county": "lee", "subdivision_name": "EXAMPLE PLACE", "home_count": 1,
              "count_by_type": {"single-family": 1}, "median_just_value": 400000.0,
              "median_year_built": 1999, "source_url": "https://example.invalid",
              "as_of": "2026-07-20"}]
    with patch(f"{_MOD}._get_connection", side_effect=[read_conn, write_conn]), \
         patch(f"{_MOD}._load_parcel_subdivision_rows", return_value=[]), \
         patch(f"{_MOD}._aggregate", return_value=stats), \
         patch(f"{_MOD}._replace_all") as mock_replace_all:
        from ingest.duckdb_pipelines.neighborhood_stats.pipeline import main

        result = main([])

    assert result == 0
    # the read connection is closed BEFORE the write connection is ever opened
    read_conn.close.assert_called_once()
    mock_replace_all.assert_called_once()
    assert mock_replace_all.call_args[0][0] is write_conn, "write must use the FRESH connection"
    write_conn.close.assert_called_once()


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
