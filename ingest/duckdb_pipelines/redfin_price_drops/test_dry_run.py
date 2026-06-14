"""Verify --dry-run skips the download/write/inventory path."""
from unittest.mock import patch


def test_dry_run_skips_run():
    import ingest.duckdb_pipelines.redfin_price_drops.pipeline as mod

    with patch.object(mod, "run") as mock_run:
        result = mod.main(["--dry-run"])

    assert result == 0
    mock_run.assert_not_called()
