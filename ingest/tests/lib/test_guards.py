"""Tests for ingest.lib.guards."""
import logging

import pytest

from ingest.lib.guards import (
    VolumeGuardError,
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
