"""Coverage-guard tests for the active-listings partial-block failure.

The recurring failure: Lee scrapes full, Collier gets WAF-403'd after a few ZIPs, and the
TOTAL row count stays healthy (padded by Lee) so the run went green while Naples silently
emptied. ``assert_county_coverage`` closes that gap. These tests import ONLY
``ingest.lib.guards`` (no crawl4ai / psycopg) so they run on any interpreter.
"""
from __future__ import annotations

import pytest

from ingest.lib.guards import VolumeGuardError, assert_county_coverage

# The two markets the pipeline enforces (extract.DENSE_COUNTIES) and its live floor default.
_ENFORCED = ["Collier", "Lee"]
_FLOOR = 200


def test_passes_when_both_dense_counties_full():
    healthy = {"Collier": 1800, "Lee": 2400, "Charlotte": 300, "Sarasota": 500, "Glades": 0, "Hendry": 0}
    assert_county_coverage(healthy, _ENFORCED, min_per_county=_FLOOR) is None


def test_fires_on_lee_full_collier_empty():
    # THE bug: Lee full, Collier collapsed to a handful of WAF-truncated rows, total still ~2.4k.
    partial = {"Collier": 6, "Lee": 2400, "Charlotte": 300, "Sarasota": 500, "Glades": 0, "Hendry": 0}
    with pytest.raises(VolumeGuardError, match="Collier"):
        assert_county_coverage(partial, _ENFORCED, min_per_county=_FLOOR, label="active_listings")


def test_error_names_collapse_and_the_shape():
    partial = {"Collier": 6, "Lee": 2400}
    with pytest.raises(VolumeGuardError, match="county-coverage collapse"):
        assert_county_coverage(partial, _ENFORCED, min_per_county=_FLOOR)


def test_fires_when_lee_is_the_blocked_one():
    partial = {"Collier": 1800, "Lee": 11, "Charlotte": 300, "Sarasota": 500}
    with pytest.raises(VolumeGuardError, match="Lee"):
        assert_county_coverage(partial, _ENFORCED, min_per_county=_FLOOR)


def test_total_block_defers_to_other_guards():
    # Nothing landed anywhere = a total block (IP fully WAF'd / markup changed). The total-empty
    # and baseline guards own that case; this guard must NOT double-raise or false-alarm.
    dead = {"Collier": 0, "Lee": 0, "Charlotte": 0, "Sarasota": 0, "Glades": 0, "Hendry": 0}
    assert_county_coverage(dead, _ENFORCED, min_per_county=_FLOOR) is None


def test_rural_pair_never_enforced():
    # Glades/Hendry legitimately return 0 and are NOT in the enforced set — a healthy run with the
    # dense pair full and the rural pair empty must pass.
    healthy = {"Collier": 1800, "Lee": 2400, "Glades": 0, "Hendry": 0}
    assert_county_coverage(healthy, _ENFORCED, min_per_county=_FLOOR) is None


def test_single_county_reseed_fires_when_collier_returns_thin():
    # `--county Collier` re-seed from a home IP: enforced set is just ["Collier"]. If the block
    # persists and Collier comes back thin, the guard SHOULD go red so the operator knows.
    assert_county_coverage({"Collier": 900}, ["Collier"], min_per_county=_FLOOR) is None
    with pytest.raises(VolumeGuardError, match="Collier"):
        assert_county_coverage({"Collier": 12}, ["Collier"], min_per_county=_FLOOR)


def test_empty_enforced_set_is_a_noop():
    # A single-county run for a non-dense county (e.g. --county Glades) enforces nothing.
    assert_county_coverage({"Glades": 0}, [], min_per_county=_FLOOR) is None


def test_boundary_at_floor_exactly_passes():
    # Floor is a >= check: exactly at the floor is healthy, one below fires.
    assert_county_coverage({"Collier": _FLOOR, "Lee": _FLOOR}, _ENFORCED, min_per_county=_FLOOR) is None
    with pytest.raises(VolumeGuardError):
        assert_county_coverage({"Collier": _FLOOR - 1, "Lee": _FLOOR}, _ENFORCED, min_per_county=_FLOOR)
