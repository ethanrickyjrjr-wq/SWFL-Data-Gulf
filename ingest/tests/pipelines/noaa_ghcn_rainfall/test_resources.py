import logging
from unittest.mock import patch, MagicMock

from ingest.pipelines.noaa_ghcn_rainfall.resources import (
    _fetch_year_coverage,
    _fetch_year_prcp,
    noaa_ghcn_rainfall_resource,
    STATUS_KEPT,
    STATUS_DROPPED_BELOW_MIN,
    STATUS_ABSENT,
)
from ingest.pipelines.noaa_ghcn_rainfall.constants import (
    ANCHOR_STATIONS,
    ANCHOR_STATION_NAMES,
    MIN_DAY_COUNT,
    GHCN_COLUMNS,
)

# One inch of rain per day in the GHCN unit (tenths of mm): 254 tenths-mm = 1 in.
ONE_INCH_TENTHS_MM = 254

# The COOP station that surfaced this whole gap: it reported only ~275 PRCP days
# in 2024 (a complete calendar year) — below MIN_DAY_COUNT — and was silently
# dropped, masquerading as a missing-station ingest bug.
NAPLES_COOP = "USC00086078"


# ── Fake by_year CSV builder ──────────────────────────────────────────────────

def _row(station_id: str, day: int, year: int, value: int, q_flag: str = "") -> str:
    # GHCN_COLUMNS order: station_id, date, element, value, m_flag, q_flag, s_flag, obs_time
    # date is never parsed by the pipeline, so a monotonic counter is fine.
    date = f"{year}{day:04d}"
    return f"{station_id},{date},PRCP,{value},,{q_flag},S,"


def _make_csv(station_config: dict[str, dict], year: int = 2024) -> str:
    """
    station_config maps station_id → {"pass": n, "qc_fail": n, "missing": n}.
    A station absent from the mapping produces no rows at all (tests ABSENT).
    Mirrors the live file's real header row (harmlessly skipped by the anchor
    filter because station_id == "ID").
    """
    lines = [",".join(["ID", "DATE", "ELEMENT", "DATA_VALUE", "M_FLAG", "Q_FLAG", "S_FLAG", "OBS_TIME"])]
    # A non-anchor station's noise, to prove the filter ignores it.
    lines.append(_row("USW00099999", 1, year, 100))
    d = 0
    for sid, cfg in station_config.items():
        for _ in range(cfg.get("pass", 0)):
            d += 1
            lines.append(_row(sid, d, year, ONE_INCH_TENTHS_MM))          # 1.00 in, passes QC
        for _ in range(cfg.get("qc_fail", 0)):
            d += 1
            lines.append(_row(sid, d, year, ONE_INCH_TENTHS_MM, q_flag="X"))  # failed QC
        for _ in range(cfg.get("missing", 0)):
            d += 1
            lines.append(_row(sid, d, year, -9999))                        # missing sentinel
    return "\n".join(lines) + "\n"


def _fake_get(csv_text: str) -> MagicMock:
    mock = MagicMock()
    mock.raise_for_status.return_value = None
    mock.text = csv_text
    return mock


def _patch_get(csv_text: str):
    return patch(
        "ingest.pipelines.noaa_ghcn_rainfall.resources.requests.get",
        return_value=_fake_get(csv_text),
    )


def _cov_by_station(coverage: list[dict]) -> dict[str, dict]:
    return {rec["station_id"]: rec for rec in coverage}


# ── The regression that would have caught the silent drop ─────────────────────

class TestUnderReportingStationIsVisible:
    """
    A station present in the raw data but filtered out for insufficient coverage
    must be COUNTABLE and LOGGED — never just missing. This is the exact failure
    mode that made USC00086078 look like a bug: 275 QC-passing days in 2024, one
    day-count short of the bar, silently vanishing.
    """

    def _coverage(self):
        cfg = {NAPLES_COOP: {"pass": 275}}  # complete-year total, below MIN_DAY_COUNT
        with _patch_get(_make_csv(cfg)):
            return _fetch_year_coverage(2024)

    def test_station_does_not_land_as_a_row(self):
        cfg = {NAPLES_COOP: {"pass": 275}}
        with _patch_get(_make_csv(cfg)):
            rows = list(noaa_ghcn_rainfall_resource([2024]))
        assert all(r["station_id"] != NAPLES_COOP for r in rows)

    def test_station_still_appears_in_coverage_with_reason(self):
        rec = _cov_by_station(self._coverage())[NAPLES_COOP]
        assert rec["status"] == STATUS_DROPPED_BELOW_MIN
        assert rec["day_count"] == 275
        assert rec["day_count"] < MIN_DAY_COUNT
        assert rec["rows_seen"] == 275

    def test_drop_is_logged_at_warning(self, caplog):
        cfg = {NAPLES_COOP: {"pass": 275}}
        with _patch_get(_make_csv(cfg)):
            with caplog.at_level(logging.WARNING, logger="ingest.pipelines.noaa_ghcn_rainfall.resources"):
                list(noaa_ghcn_rainfall_resource([2024]))
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
        assert any(NAPLES_COOP in r.getMessage() and "DROPPED" in r.getMessage() for r in warnings), (
            "a station dropped below MIN_DAY_COUNT must emit a WARNING, not vanish"
        )


# ── Coverage semantics for every anchor ───────────────────────────────────────

class TestCoverageSemantics:
    def test_complete_station_is_kept(self):
        sid = "USW00012835"
        with _patch_get(_make_csv({sid: {"pass": MIN_DAY_COUNT}})):
            rec = _cov_by_station(_fetch_year_coverage(2024))[sid]
        assert rec["status"] == STATUS_KEPT
        assert rec["day_count"] == MIN_DAY_COUNT
        assert rec["annual_in"] == float(MIN_DAY_COUNT)  # 1.00 in/day × day_count

    def test_boundary_exactly_min_is_kept(self):
        sid = "USW00012835"
        with _patch_get(_make_csv({sid: {"pass": MIN_DAY_COUNT}})):
            rec = _cov_by_station(_fetch_year_coverage(2024))[sid]
        assert rec["status"] == STATUS_KEPT

    def test_boundary_one_below_min_is_dropped(self):
        sid = "USW00012835"
        with _patch_get(_make_csv({sid: {"pass": MIN_DAY_COUNT - 1}})):
            rec = _cov_by_station(_fetch_year_coverage(2024))[sid]
        assert rec["status"] == STATUS_DROPPED_BELOW_MIN

    def test_absent_station_is_reported_not_omitted(self):
        # Only one anchor has rows; the other three are absent from the CSV.
        sid = "USW00012835"
        with _patch_get(_make_csv({sid: {"pass": MIN_DAY_COUNT}})):
            coverage = _fetch_year_coverage(2024)
        by_sid = _cov_by_station(coverage)
        # Every anchor is represented exactly once, absent ones included.
        assert set(by_sid) == set(ANCHOR_STATIONS)
        absent = by_sid[NAPLES_COOP]
        assert absent["status"] == STATUS_ABSENT
        assert absent["rows_seen"] == 0
        assert absent["day_count"] == 0

    def test_qc_failed_rows_excluded_from_day_count(self):
        sid = "USW00012894"
        with _patch_get(_make_csv({sid: {"pass": MIN_DAY_COUNT + 5, "qc_fail": 20}})):
            rec = _cov_by_station(_fetch_year_coverage(2024))[sid]
        assert rec["day_count"] == MIN_DAY_COUNT + 5  # qc_fail not counted
        assert rec["qc_failed"] == 20
        assert rec["rows_seen"] == MIN_DAY_COUNT + 5 + 20
        assert rec["status"] == STATUS_KEPT

    def test_missing_sentinel_excluded_from_day_count(self):
        sid = "USW00012897"
        with _patch_get(_make_csv({sid: {"pass": MIN_DAY_COUNT, "missing": 15}})):
            rec = _cov_by_station(_fetch_year_coverage(2024))[sid]
        assert rec["day_count"] == MIN_DAY_COUNT  # -9999 not counted
        assert rec["missing_value"] == 15
        assert rec["status"] == STATUS_KEPT


# ── Resource-level behaviour ──────────────────────────────────────────────────

class TestResourceYields:
    def test_yields_only_kept_stations(self):
        cfg = {
            "USW00012835": {"pass": MIN_DAY_COUNT + 10},   # kept
            "USW00012894": {"pass": MIN_DAY_COUNT},        # kept
            NAPLES_COOP:   {"pass": 275},                  # dropped
            # USW00012897 absent entirely
        }
        with _patch_get(_make_csv(cfg)):
            rows = list(noaa_ghcn_rainfall_resource([2024]))
        landed = {r["station_id"] for r in rows}
        assert landed == {"USW00012835", "USW00012894"}

    def test_row_shape_and_id(self):
        with _patch_get(_make_csv({"USW00012835": {"pass": MIN_DAY_COUNT}})):
            rows = list(noaa_ghcn_rainfall_resource([2024]))
        assert len(rows) == 1
        row = rows[0]
        assert row["id"] == "USW00012835|2024"
        assert row["county"] == ANCHOR_STATIONS["USW00012835"]
        assert row["station_name"] == ANCHOR_STATION_NAMES["USW00012835"]
        assert row["day_count"] == MIN_DAY_COUNT
        assert row["year"] == 2024

    def test_backward_compat_prcp_view_kept_only(self):
        cfg = {
            "USW00012835": {"pass": MIN_DAY_COUNT},  # kept
            NAPLES_COOP:   {"pass": 275},            # dropped
        }
        with _patch_get(_make_csv(cfg)):
            prcp = _fetch_year_prcp(2024)
        assert "USW00012835" in prcp
        assert NAPLES_COOP not in prcp
        annual_in, day_count = prcp["USW00012835"]
        assert day_count == MIN_DAY_COUNT


# ── Anchor-config invariants ──────────────────────────────────────────────────

class TestAnchorInvariants:
    def test_naples_coop_is_a_documented_anchor(self):
        # Guards against anyone "fixing" the red by deleting the under-reporting
        # station instead of surfacing it. Naples COOP is a real, live anchor.
        assert NAPLES_COOP in ANCHOR_STATIONS
        assert NAPLES_COOP in ANCHOR_STATION_NAMES

    def test_four_anchor_stations(self):
        assert len(ANCHOR_STATIONS) == 4
        assert set(ANCHOR_STATION_NAMES) == set(ANCHOR_STATIONS)

    def test_ghcn_columns_shape(self):
        assert GHCN_COLUMNS[0] == "station_id"
        assert "q_flag" in GHCN_COLUMNS
        assert "element" in GHCN_COLUMNS
