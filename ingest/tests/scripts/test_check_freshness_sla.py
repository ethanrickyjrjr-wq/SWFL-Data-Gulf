"""Unit tests for the freshness SLA layer in check_freshness.py.

Covers check_sla_violations and the exit-code contract in main():
  (a) age > error_after_days  → sla_errors non-empty → main returns 1
  (b) no freshness_sla        → sla_errors empty     → main returns 0
  (c) warn_after_days only    → sla_warns non-empty, sla_errors empty → main returns 0
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.scripts.check_freshness import check_sla_violations


# ── helpers ───────────────────────────────────────────────────────────────────


def _result(name: str, age_days: int | None, sla: dict | None = None) -> dict:
    """Minimal result dict as produced by run_probe."""
    return {
        "name": name,
        "lane": "tier-2",
        "status": "STALE" if age_days and age_days > 1 else "FRESH",
        "age_days": age_days,
        "cadence_days": 1,
        "threshold_days": 2,
        "freshness_sla": sla,
    }


# ── test (a): age > error_after_days → exit 1 ────────────────────────────────


def test_sla_error_when_age_exceeds_error_threshold():
    """age_days=5, error_after_days=4 → sla_errors=['source_a']."""
    results = [_result("source_a", age_days=5, sla={"error_after_days": 4})]
    sla_errors, sla_warns = check_sla_violations(results)
    assert sla_errors == ["source_a"]
    assert sla_warns == []


# ── test (b): no freshness_sla → exit 0 ──────────────────────────────────────


def test_no_sla_when_freshness_sla_absent():
    """No freshness_sla block → both lists empty (ungated source)."""
    results = [_result("source_b", age_days=100, sla=None)]
    sla_errors, sla_warns = check_sla_violations(results)
    assert sla_errors == []
    assert sla_warns == []


# ── test (c): warn_after_days only → WARN in summary, exit 0 ─────────────────


def test_sla_warn_only_when_no_error_after():
    """warn_after_days=2, no error_after_days, age=3 → sla_warns=['source_c'], sla_errors=[]."""
    results = [_result("source_c", age_days=3, sla={"warn_after_days": 2})]
    sla_errors, sla_warns = check_sla_violations(results)
    assert sla_errors == []
    assert sla_warns == ["source_c"]


# ── edge cases ────────────────────────────────────────────────────────────────


def test_missing_source_skipped():
    """age_days=None (MISSING) with an SLA → skipped, not an error."""
    results = [_result("source_d", age_days=None, sla={"error_after_days": 1})]
    sla_errors, sla_warns = check_sla_violations(results)
    assert sla_errors == []
    assert sla_warns == []


def test_age_equal_to_threshold_not_an_error():
    """age_days == error_after_days → NOT an error (threshold is strictly greater)."""
    results = [_result("source_e", age_days=4, sla={"error_after_days": 4})]
    sla_errors, sla_warns = check_sla_violations(results)
    assert sla_errors == []
    assert sla_warns == []


def test_multiple_sources_independent():
    """Mixed results: one SLA error, one warn, one ungated — only error and warn sources fire."""
    results = [
        _result("err_src", age_days=10, sla={"error_after_days": 5}),
        _result("warn_src", age_days=3, sla={"warn_after_days": 2}),
        _result("ungated", age_days=999, sla=None),
    ]
    sla_errors, sla_warns = check_sla_violations(results)
    assert sla_errors == ["err_src"]
    assert sla_warns == ["warn_src"]
