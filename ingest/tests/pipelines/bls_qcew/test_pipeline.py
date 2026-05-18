from unittest.mock import patch, MagicMock


def _mock_resp(ok=True, data=None):
    m = MagicMock()
    m.ok = ok
    m.json.return_value = data if data is not None else []
    return m


def test_find_latest_quarter_first_try():
    """May 2026 → current = Q2 → first probe = Q1 2026, which has data."""
    from ingest.pipelines.bls_qcew.pipeline import _find_latest_quarter
    with patch("ingest.pipelines.bls_qcew.pipeline.requests.get") as mock_get:
        mock_get.return_value = _mock_resp(data=[{"own_code": "0"}])
        year, qtr = _find_latest_quarter(probe_fips="12071", _now_year=2026, _now_month=5)
    assert year == 2026
    assert qtr == "1"


def test_find_latest_quarter_backoff():
    """Falls back to a prior quarter when the first probe returns empty."""
    from ingest.pipelines.bls_qcew.pipeline import _find_latest_quarter
    responses = [
        _mock_resp(data=[]),                       # Q1 2026 empty
        _mock_resp(data=[{"own_code": "0"}]),      # Q4 2025 has data
    ]
    with patch("ingest.pipelines.bls_qcew.pipeline.requests.get", side_effect=responses):
        year, qtr = _find_latest_quarter(probe_fips="12071", _now_year=2026, _now_month=5)
    assert year == 2025
    assert qtr == "4"


def test_find_latest_quarter_raises_after_6():
    """Raises RuntimeError if all 6 probes return empty."""
    from ingest.pipelines.bls_qcew.pipeline import _find_latest_quarter
    with patch("ingest.pipelines.bls_qcew.pipeline.requests.get") as mock_get:
        mock_get.return_value = _mock_resp(data=[])
        try:
            _find_latest_quarter(probe_fips="12071", _now_year=2026, _now_month=5)
            raise AssertionError("expected RuntimeError")
        except RuntimeError:
            pass
