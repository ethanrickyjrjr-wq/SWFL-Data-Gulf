"""Tests for ingest.lib.guards."""
import logging
from datetime import date, datetime

import pytest

from ingest.lib.guards import (
    ContentStaleError,
    VolumeGuardError,
    assert_content_fresh,
    assert_county_coverage,
    assert_min_rows,
    assert_vs_baseline,
    assert_vs_canonical,
)


class TestVolumeGuardError:
    def test_is_runtime_error(self):
        with pytest.raises(RuntimeError):
            raise VolumeGuardError("test")

    def test_message_preserved(self):
        with pytest.raises(VolumeGuardError, match="test message"):
            raise VolumeGuardError("test message")


class TestAssertVsCanonical:
    def test_passes_above_floor(self):
        assert_vs_canonical(900, 1000, floor=0.9)  # 90% exactly — no raise

    def test_passes_well_above_floor(self):
        assert_vs_canonical(1000, 1000)

    def test_raises_one_below_floor(self):
        with pytest.raises(VolumeGuardError, match="aborting"):
            assert_vs_canonical(899, 1000, floor=0.9)

    def test_raises_zero_landed(self):
        with pytest.raises(VolumeGuardError):
            assert_vs_canonical(0, 1000)

    def test_skips_when_canonical_zero(self):
        assert_vs_canonical(0, 0)  # no raise — canonical unknown

    def test_label_in_error_message(self):
        with pytest.raises(VolumeGuardError, match="leepa just_value"):
            assert_vs_canonical(1, 1000, label="leepa just_value")

    def test_message_contains_row_counts(self):
        with pytest.raises(VolumeGuardError, match="500"):
            assert_vs_canonical(500, 1000)

    def test_custom_floor(self):
        assert_vs_canonical(80, 100, floor=0.75)  # 80 >= 75 — passes
        with pytest.raises(VolumeGuardError):
            assert_vs_canonical(74, 100, floor=0.75)


class TestAssertMinRows:
    def test_passes_at_minimum(self):
        assert_min_rows(10, 10)

    def test_passes_above_minimum(self):
        assert_min_rows(11, 10)

    def test_raises_one_below_minimum(self):
        with pytest.raises(VolumeGuardError, match="aborting"):
            assert_min_rows(9, 10)

    def test_raises_zero_when_minimum_positive(self):
        with pytest.raises(VolumeGuardError):
            assert_min_rows(0, 1)

    def test_label_in_error_message(self):
        with pytest.raises(VolumeGuardError, match="city_pulse"):
            assert_min_rows(0, 3, label="city_pulse")


class TestAssertVsBaseline:
    def test_passes_within_bands(self):
        assert_vs_baseline(100, 100)

    def test_passes_at_drop_band_boundary(self):
        assert_vs_baseline(50, 100, drop_band=0.5)  # 50 == 50 — passes

    def test_raises_collapse(self):
        with pytest.raises(VolumeGuardError, match="collapse"):
            assert_vs_baseline(49, 100, drop_band=0.5)

    def test_passes_at_spike_band_boundary(self):
        assert_vs_baseline(500, 100, spike_band=5.0)  # 500 == 500 — passes

    def test_raises_spike(self):
        with pytest.raises(VolumeGuardError, match="spike"):
            assert_vs_baseline(501, 100, spike_band=5.0)

    def test_bootstrap_safe_prior_none(self, caplog):
        with caplog.at_level(logging.WARNING):
            assert_vs_baseline(100, None)  # no raise
        assert "BASELINE_UNAVAILABLE" in caplog.text

    def test_bootstrap_safe_prior_zero(self, caplog):
        with caplog.at_level(logging.WARNING):
            assert_vs_baseline(100, 0)  # no raise
        assert "BASELINE_UNAVAILABLE" in caplog.text

    def test_label_in_bootstrap_warning(self, caplog):
        with caplog.at_level(logging.WARNING):
            assert_vs_baseline(100, None, label="my_pipeline")
        assert "my_pipeline" in caplog.text


class TestAssertCountyCoverage:
    def test_passes_when_all_expected_full(self):
        assert_county_coverage({"Collier": 1800, "Lee": 2400}, ["Collier", "Lee"], min_per_county=200)

    def test_raises_partial_block(self):
        # Lee full, Collier collapsed — total still healthy, but the shape is broken.
        with pytest.raises(VolumeGuardError, match="Collier"):
            assert_county_coverage({"Collier": 6, "Lee": 2400}, ["Collier", "Lee"], min_per_county=200)

    def test_defers_on_total_block(self):
        # Nothing landed anywhere → total-empty/baseline guards own it; no double-raise.
        assert_county_coverage({"Collier": 0, "Lee": 0}, ["Collier", "Lee"], min_per_county=200)

    def test_missing_county_counts_as_zero(self):
        with pytest.raises(VolumeGuardError, match="Collier"):
            assert_county_coverage({"Lee": 2400}, ["Collier", "Lee"], min_per_county=200)

    def test_empty_expected_is_noop(self):
        assert_county_coverage({"Glades": 0}, [], min_per_county=200)

    def test_label_in_error_message(self):
        with pytest.raises(VolumeGuardError, match="active_listings"):
            assert_county_coverage({"Collier": 1, "Lee": 2400}, ["Collier"], min_per_county=200,
                                   label="active_listings")


class TestAssertContentFresh:
    """Content-age guard — trips when the newest content date stalls, even if the row
    count is healthy and dlt wrote a fresh _dlt_loads row (the lee_permits 18d-stale class)."""

    TODAY = date(2026, 7, 5)

    def test_passes_fresh_date(self):
        assert_content_fresh(date(2026, 7, 1), 14, today=self.TODAY)  # 4d old — fine

    def test_passes_at_boundary(self):
        assert_content_fresh(date(2026, 6, 21), 14, today=self.TODAY)  # exactly 14d — no raise

    def test_raises_one_past_boundary(self):
        with pytest.raises(ContentStaleError, match="stalled"):
            assert_content_fresh(date(2026, 6, 20), 14, today=self.TODAY)  # 15d — trips

    def test_raises_the_lee_permits_18d_stall(self):
        # The flagship bug: probe tolerance would be 21d, but a 14d gate trips the 18d stall.
        with pytest.raises(ContentStaleError):
            assert_content_fresh(date(2026, 6, 17), 14, today=self.TODAY)  # 18d

    def test_raises_on_none(self):
        with pytest.raises(ContentStaleError, match="no dated rows"):
            assert_content_fresh(None, 14, today=self.TODAY)

    def test_accepts_iso_string(self):
        # redfin period_end is stored as text — the guard must accept ISO strings.
        assert_content_fresh("2026-07-01", 50, today=self.TODAY)
        with pytest.raises(ContentStaleError):
            assert_content_fresh("2026-01-01", 50, today=self.TODAY)  # ~185d old

    def test_accepts_iso_string_with_time_component(self):
        assert_content_fresh("2026-07-01T00:00:00", 14, today=self.TODAY)

    def test_accepts_datetime(self):
        assert_content_fresh(datetime(2026, 7, 1, 12, 0), 14, today=self.TODAY)

    def test_label_in_error_message(self):
        with pytest.raises(ContentStaleError, match="lee_permits"):
            assert_content_fresh(None, 14, label="lee_permits", today=self.TODAY)

    def test_distinct_from_volume_guard_error(self):
        # Own class so the cron-failure classifier routes it to CONTENT_STALE (do not retry),
        # never conflated with a VolumeGuardError.
        assert not issubclass(ContentStaleError, VolumeGuardError)
        assert not issubclass(VolumeGuardError, ContentStaleError)
