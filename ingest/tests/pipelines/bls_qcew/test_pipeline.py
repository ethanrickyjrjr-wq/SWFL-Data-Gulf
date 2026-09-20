from unittest.mock import patch, MagicMock

import pytest


_CSV_HEADER = "area_fips,own_code,industry_code,qtrly_estabs,month1_emplvl\n"


def _mock_resp(ok=True, data=None, status_code=None):
    """A BLS QCEW area response.

    _find_latest_quarter probes the `.csv` endpoint and parses resp.text with
    csv.DictReader — it does NOT call .json(). These mocks stubbed .json() and
    left .text a bare MagicMock, so io.StringIO() raised TypeError, the
    `except Exception: pass` in the probe loop swallowed it, and all 6 back-steps
    "failed" -> RuntimeError. Stale mocks against a JSON->CSV migration, not a
    real regression. `data=[]` means header-only: a quarter BLS has no data for.
    """
    m = MagicMock()
    m.ok = ok
    m.status_code = status_code if status_code is not None else (200 if ok else 403)
    rows = data if data is not None else []
    m.text = _CSV_HEADER + "".join(
        f"12071,{r.get('own_code', '0')},10,1234,56789\n" for r in rows
    )
    m.json.return_value = rows
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
        except RuntimeError as e:
            # "published but no rows" must not read the same as "blocked/absent":
            # 200-empty vs 403 vs 404 is the whole diagnostic value of the message.
            assert "2026Q1=200-empty" in str(e)


def test_find_latest_quarter_error_names_every_probe_and_its_status():
    """Replay of run 31316526508 (08/09/2026), which died with exactly one line —
    "could not find latest available quarter within 6 back-steps" — and no URL, no
    status, no attempt list, so the cause stayed invisible for six weeks. Every
    probe and its HTTP status must be in the message."""
    from ingest.pipelines.bls_qcew.pipeline import _find_latest_quarter
    with patch("ingest.pipelines.bls_qcew.pipeline.requests.get") as mock_get:
        mock_get.return_value = _mock_resp(ok=False, status_code=403)
        with pytest.raises(RuntimeError) as exc:
            # month=8 -> current Q3 -> first probe Q2 2026: the real 08/09 sequence.
            _find_latest_quarter(probe_fips="12071", _now_year=2026, _now_month=8)

    msg = str(exc.value)
    for probe in ("2026Q2=403", "2026Q1=403", "2025Q4=403",
                  "2025Q3=403", "2025Q2=403", "2025Q1=403"):
        assert probe in msg, f"{probe} missing from: {msg}"


def test_find_latest_quarter_error_names_transport_failures_too():
    """A connection reset must not vanish into `except Exception: pass` either."""
    from ingest.pipelines.bls_qcew.pipeline import _find_latest_quarter
    import requests as _requests
    with patch("ingest.pipelines.bls_qcew.pipeline.requests.get",
               side_effect=_requests.ConnectionError("reset by peer")):
        with pytest.raises(RuntimeError) as exc:
            _find_latest_quarter(probe_fips="12071", _now_year=2026, _now_month=8)
    assert "2026Q2=EXC:ConnectionError" in str(exc.value)


def test_probe_and_fetch_both_send_the_contact_user_agent():
    """bls.gov/bls/pss.htm: BLS "reserves the right to block robots that do not
    contain information that can be used to contact the owner." Both call sites
    hit data.bls.gov — a UA on the probe alone means the probe passes and the
    resource fetch gets blocked."""
    from ingest.pipelines.bls_qcew.constants import BLS_HEADERS
    from ingest.pipelines.bls_qcew import pipeline as pipeline_mod

    assert "@" in BLS_HEADERS["User-Agent"], "UA must carry a contact address"

    with patch("ingest.pipelines.bls_qcew.pipeline.requests.get") as mock_get:
        mock_get.return_value = _mock_resp(data=[{"own_code": "0"}])
        pipeline_mod._find_latest_quarter(probe_fips="12071", _now_year=2026, _now_month=5)
    assert mock_get.call_args.kwargs["headers"] == BLS_HEADERS

    from ingest.pipelines.bls_qcew.resources import bls_qcew_resource
    with patch("ingest.pipelines.bls_qcew.resources.requests.get") as mock_get:
        mock_get.return_value = _mock_resp(data=[{"own_code": "0"}])
        list(bls_qcew_resource([(2026, "1")]))
    assert mock_get.call_args.kwargs["headers"] == BLS_HEADERS


def test_a_200_that_is_not_the_qcew_csv_is_not_accepted_as_a_hit():
    """csv.DictReader yields a "row" for an HTML interstitial too. Without a header
    check the probe would accept it, the real fetch would filter every row out on
    industry_code != "10", and dlt would load ZERO rows and exit 0 — a silent empty
    load, worse than the crash. Must record 200-empty and raise instead."""
    from ingest.pipelines.bls_qcew.pipeline import _find_latest_quarter
    html = MagicMock()
    html.ok = True
    html.status_code = 200
    html.text = "<html><head>\n<title>Access Denied</title>\n</head></html>\n"

    with patch("ingest.pipelines.bls_qcew.pipeline.requests.get", return_value=html):
        with pytest.raises(RuntimeError) as exc:
            _find_latest_quarter(probe_fips="12071", _now_year=2026, _now_month=8)
    assert "2026Q2=200-empty" in str(exc.value)
