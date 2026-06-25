from unittest.mock import patch

import pytest

_P = "ingest.pipelines.market_heat_swfl.pipeline"


def _rows(n: int) -> list[dict]:
    return [{"postal_code": "33901"} for _ in range(n)]


def test_dry_run_skips_upload():
    with (
        patch(f"{_P}.fetch_core_swfl", return_value=_rows(250)),
        patch(f"{_P}.fetch_hotness_swfl", return_value=_rows(250)),
        patch(f"{_P}.upload_parquet") as mock_upload,
        patch(f"{_P}.upsert_inventory_row") as mock_inv,
    ):
        import ingest.pipelines.market_heat_swfl.pipeline as mod

        result = mod.main(["--dry-run"])

    assert result == 0
    mock_upload.assert_not_called()
    mock_inv.assert_not_called()


def test_short_core_fetch_aborts_before_any_write():
    """Gate-4: a truncated core pull (below MIN_ROWS) raises before any REPLACE."""
    with (
        patch(f"{_P}.fetch_core_swfl", return_value=_rows(10)),  # < MIN_ROWS (200)
        patch(f"{_P}.fetch_hotness_swfl", return_value=_rows(250)),
        patch(f"{_P}.upload_parquet") as mock_upload,
        patch(f"{_P}.upsert_inventory_row") as mock_inv,
    ):
        import ingest.pipelines.market_heat_swfl.pipeline as mod

        with pytest.raises(Exception) as ei:
            mod.main([])  # non-dry-run

    assert "volume-guard" in str(ei.value)
    mock_upload.assert_not_called()
    mock_inv.assert_not_called()


def test_full_run_uploads_two_parquets():
    with (
        patch(f"{_P}.fetch_core_swfl", return_value=_rows(250)),
        patch(f"{_P}.fetch_hotness_swfl", return_value=_rows(250)),
        patch(f"{_P}.upload_parquet", return_value=1234) as mock_upload,
        patch(f"{_P}.upsert_inventory_row") as mock_inv,
    ):
        import ingest.pipelines.market_heat_swfl.pipeline as mod

        result = mod.main([])

    assert result == 0
    assert mock_upload.call_count == 2  # core + hotness
    assert mock_inv.call_count == 2
