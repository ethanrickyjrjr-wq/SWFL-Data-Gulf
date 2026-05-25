from unittest.mock import patch, MagicMock
import json

import pytest

from ingest.pipelines.bls_laus.resources import _make_id, _coerce_value, bls_laus_resource
from ingest.pipelines.bls_laus.constants import SERIES_IDS, SERIES_META, AREA_FIPS


# ── Minimal BLS API response fixture ──────────────────────────────────────────

def _fake_response(series_id: str, data: list) -> MagicMock:
    body = {
        "status": "REQUEST_SUCCEEDED",
        "responseTime": 100,
        "message": [],
        "Results": {
            "series": [{"seriesID": series_id, "data": data}]
        },
    }
    mock = MagicMock()
    mock.raise_for_status.return_value = None
    mock.json.return_value = body
    return mock


LEE_UNEMP_SERIES = "LAUCN120710000000003"

_SAMPLE_DATA = [
    {
        "year": "2025", "period": "M04", "periodName": "April",
        "value": "3.2",
        "footnotes": [{"code": "P", "text": "Preliminary"}],
    },
    {
        "year": "2024", "period": "M04", "periodName": "April",
        "value": "3.0",
        "footnotes": [{}],
    },
    # Annual average — must be filtered out
    {
        "year": "2024", "period": "M13", "periodName": "Annual",
        "value": "3.1",
        "footnotes": [{}],
    },
]


# ── TestMakeId ─────────────────────────────────────────────────────────────────

class TestMakeId:
    def test_stable_key(self):
        assert _make_id("LAUCN120710000000003", "2025", "M04") == "LAUCN120710000000003|2025|M04"

    def test_different_series_differ(self):
        a = _make_id("LAUCN120710000000003", "2025", "M04")
        b = _make_id("LAUCN120210000000003", "2025", "M04")
        assert a != b

    def test_different_periods_differ(self):
        a = _make_id("LAUCN120710000000003", "2025", "M04")
        b = _make_id("LAUCN120710000000003", "2025", "M05")
        assert a != b

    def test_different_years_differ(self):
        a = _make_id("LAUCN120710000000003", "2025", "M04")
        b = _make_id("LAUCN120710000000003", "2024", "M04")
        assert a != b


# ── TestCoerceValue ────────────────────────────────────────────────────────────

class TestCoerceValue:
    def test_none_returns_none(self):
        assert _coerce_value(None) is None

    def test_empty_string_returns_none(self):
        assert _coerce_value("") is None

    def test_dash_returns_none(self):
        assert _coerce_value("-") is None

    def test_numeric_string(self):
        assert _coerce_value("3.2") == pytest.approx(3.2)

    def test_comma_separated(self):
        assert _coerce_value("1,234.5") == pytest.approx(1234.5)

    def test_integer_string(self):
        assert _coerce_value("42") == pytest.approx(42.0)


# ── TestBlsLausResourceYields ──────────────────────────────────────────────────

class TestBlsLausResourceYields:
    def test_monthly_rows_yielded(self):
        with patch("ingest.pipelines.bls_laus.resources.requests.post") as mock_post:
            mock_post.return_value = _fake_response(LEE_UNEMP_SERIES, _SAMPLE_DATA)
            rows = list(bls_laus_resource("2024", "2025"))

        # 3 areas × 2 monthly rows (M13 filtered) = 6 rows
        assert len(rows) == 6

    def test_m13_annual_filtered_out(self):
        with patch("ingest.pipelines.bls_laus.resources.requests.post") as mock_post:
            mock_post.return_value = _fake_response(LEE_UNEMP_SERIES, _SAMPLE_DATA)
            rows = list(bls_laus_resource("2024", "2025"))

        periods = [r["period"] for r in rows]
        assert "M13" not in periods

    def test_id_matches_make_id(self):
        with patch("ingest.pipelines.bls_laus.resources.requests.post") as mock_post:
            mock_post.return_value = _fake_response(LEE_UNEMP_SERIES, _SAMPLE_DATA)
            rows = list(bls_laus_resource("2024", "2025"))

        for row in rows:
            expected_id = _make_id(row["series_id"], str(row["year"]), row["period"])
            assert row["id"] == expected_id

    def test_value_is_float(self):
        with patch("ingest.pipelines.bls_laus.resources.requests.post") as mock_post:
            mock_post.return_value = _fake_response(LEE_UNEMP_SERIES, _SAMPLE_DATA)
            rows = list(bls_laus_resource("2024", "2025"))

        for row in rows:
            if row["value"] is not None:
                assert isinstance(row["value"], float)

    def test_area_fips_matches_constant(self):
        """Catches FIPS mismatch between constants and resource."""
        with patch("ingest.pipelines.bls_laus.resources.requests.post") as mock_post:
            mock_post.return_value = _fake_response(LEE_UNEMP_SERIES, _SAMPLE_DATA)
            rows = list(bls_laus_resource("2024", "2025"))

        fips_in_rows = {r["area_fips"] for r in rows}
        # All rows share one FIPS (the mock returns same series for all areas)
        for fips in fips_in_rows:
            assert fips in AREA_FIPS.values(), (
                f"area_fips {fips!r} not in AREA_FIPS constants"
            )


# ── TestBlsLausResourceApiError ────────────────────────────────────────────────

class TestBlsLausResourceApiError:
    def test_api_failure_raises(self):
        error_body = {
            "status": "REQUEST_FAILED",
            "message": ["Series not available"],
            "Results": {},
        }
        mock = MagicMock()
        mock.raise_for_status.return_value = None
        mock.json.return_value = error_body

        with patch("ingest.pipelines.bls_laus.resources.requests.post", return_value=mock):
            # dlt wraps RuntimeError in ResourceExtractionError; match on the message substring.
            with pytest.raises(Exception, match="BLS LAUS API error"):
                list(bls_laus_resource("2024", "2025"))


# ── TestSeriesIdInvariants ─────────────────────────────────────────────────────

class TestSeriesIdInvariants:
    def test_all_series_ids_same_length(self):
        all_ids = [sid for mc_map in SERIES_IDS.values() for sid in mc_map.values()]
        lengths = {len(sid) for sid in all_ids}
        assert len(lengths) == 1, f"Series IDs have mixed lengths: {lengths}"
        assert lengths == {20}

    def test_all_series_ids_start_with_lau(self):
        for geo, mc_map in SERIES_IDS.items():
            for mc, sid in mc_map.items():
                assert sid.startswith("LAU"), (
                    f"Series ID for {geo}/{mc} does not start with LAU: {sid!r}"
                )

    def test_series_meta_round_trips(self):
        for geo, mc_map in SERIES_IDS.items():
            for mc, sid in mc_map.items():
                resolved_geo, resolved_mc = SERIES_META[sid]
                assert resolved_geo == geo
                assert resolved_mc == mc

    def test_each_geo_has_four_measures(self):
        for geo in SERIES_IDS:
            assert len(SERIES_IDS[geo]) == 4, (
                f"{geo} has {len(SERIES_IDS[geo])} measures, expected 4"
            )

    def test_expected_series_ids(self):
        """Regression guard for the 12 verified series IDs."""
        assert SERIES_IDS["florida"]["03"] == "LAUST120000000000003"
        assert SERIES_IDS["lee"]["03"]     == "LAUCN120710000000003"
        assert SERIES_IDS["collier"]["03"] == "LAUCN120210000000003"
