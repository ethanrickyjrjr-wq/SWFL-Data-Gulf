"""Deterministic tests for the scan-completeness gate (no network, no DB).

A pull is trustworthy only when COMPLETE — else a WAF-truncated pull reads as mass movement (a
partial Lee pull once made 1,683 homes look like they "came off"). This gate yields the
`scan_complete` flag that diff_states uses to license pulled-by-elimination."""
from __future__ import annotations

from ingest.pipelines.listing_lifecycle.coverage_guard import scan_is_complete


def _scan(exhausted, count, last_status=200):
    return {"exhausted": exhausted, "count": count, "last_status": last_status}


def test_early_403_is_incomplete():
    ok, why = scan_is_complete(_scan(False, 12, last_status=403), last_trusted_count=1500, baseline_total=1600)
    assert ok is False
    assert "403" in why or "status" in why.lower()


def test_not_exhausted_is_incomplete():
    ok, _ = scan_is_complete(_scan(False, 1490), last_trusted_count=1500, baseline_total=1600)
    assert ok is False


def test_mass_drop_vs_last_trusted_is_incomplete():
    # 200 vs 1500 last-trusted = a truncated pull, not real movement.
    ok, _ = scan_is_complete(_scan(True, 200), last_trusted_count=1500, baseline_total=1600)
    assert ok is False


def test_stable_count_natural_exhaustion_passes():
    ok, _ = scan_is_complete(_scan(True, 1490), last_trusted_count=1500, baseline_total=1600)
    assert ok is True


def test_growth_vs_last_trusted_passes():
    ok, _ = scan_is_complete(_scan(True, 1700), last_trusted_count=1500, baseline_total=1600)
    assert ok is True


def test_first_ever_scan_seeds():
    ok, why = scan_is_complete(_scan(True, 1500), last_trusted_count=None, baseline_total=1600)
    assert ok is True
    assert "seed" in why.lower()
