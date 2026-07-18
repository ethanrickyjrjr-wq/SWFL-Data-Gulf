"""Unit tests for check_freshness.py — mocked psycopg connections."""
import os
import sys
from datetime import date, datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.scripts.check_freshness import (
    _safe_cadence_days,
    check_odd_window_entry,
    check_tier1_entry,
    check_tier2_entry,
    load_registry,
    run_probe,
)

_REGISTRY_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "ingest", "cadence_registry.yaml"
)


# ── mock helpers ──────────────────────────────────────────────────────────────


def _tier1_conn(updated_at_val):
    """Mock connection whose cursor fetchone returns (updated_at_val,) or None."""
    row = (updated_at_val,) if updated_at_val is not None else None
    cur = MagicMock()
    cur.fetchone.return_value = row
    conn = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn


def _tier2_conn(inserted_at_val):
    """Mock connection whose cursor fetchone returns (inserted_at_val,) or None."""
    row = (inserted_at_val,) if inserted_at_val is not None else None
    cur = MagicMock()
    cur.fetchone.return_value = row
    conn = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn


# ── test 1: fresh tier-1 ──────────────────────────────────────────────────────


def test_tier1_fresh_not_stale():
    """A tier-1 entry whose updated_at is today must have status FRESH."""
    conn = _tier1_conn(date.today())
    entry = {
        "name": "zori_swfl",
        "lane": "tier-1-duckdb",
        "cadence_days": 30,
        "tolerance_multiplier": 2.0,
        "inventory_id": "lake-tier1/market/zori_swfl.parquet",
        "inventory_key_type": "exact",
    }
    result = check_tier1_entry(conn, entry)
    assert result["status"] == "FRESH"
    assert result["age_days"] == 0


# ── test 2: stale tier-1 ──────────────────────────────────────────────────────


def test_tier1_stale_when_age_exceeds_threshold():
    """updated_at 90 days ago with cadence=30, tolerance=2.0 (threshold=60) → STALE."""
    stale = date.today() - timedelta(days=90)
    conn = _tier1_conn(stale)
    entry = {
        "name": "storm_history_swfl",
        "lane": "tier-1-duckdb",
        "cadence_days": 30,
        "tolerance_multiplier": 2.0,
        "inventory_id": "lake-tier1/environmental/storm_events_swfl.parquet",
        "inventory_key_type": "exact",
    }
    result = check_tier1_entry(conn, entry)
    assert result["status"] == "STALE"
    assert result["age_days"] == 90
    assert result["threshold_days"] == 60


# ── test 3: fresh tier-2 ──────────────────────────────────────────────────────


def test_tier2_fresh_not_stale():
    """A tier-2 entry loaded today must have status FRESH."""
    conn = _tier2_conn(datetime.now(tz=timezone.utc))
    entry = {
        "name": "bls_laus",
        "lane": "tier-2",
        "cadence_days": 30,
        "tolerance_multiplier": 2.0,
        "dlt_schema_name": "bls_laus",
    }
    result = check_tier2_entry(conn, entry)
    assert result["status"] == "FRESH"
    assert result["age_days"] == 0


# ── test 3b: source-aware tier-2 freshness (two sources share one table) ───────


def test_tier2_source_name_scopes_freshness_query():
    """When source_name is set, the freshness query must filter WHERE source_name=%s
    so a co-tenant source's recent write can't mask this source's staleness
    (marketbeat_swfl holds cw_marketbeat quarterly + mhs_databook annual)."""
    conn = _tier2_conn(datetime.now(tz=timezone.utc))
    entry = {
        "name": "mhs_databook",
        "lane": "tier-2",
        "cadence_days": 365,
        "tolerance_multiplier": 1.5,
        "freshness_table": "data_lake.marketbeat_swfl",
        "freshness_column": "_ingested_at",
        "source_name": "mhs_databook",
    }
    result = check_tier2_entry(conn, entry)
    assert result["status"] == "FRESH"
    cur = conn.cursor.return_value.__enter__.return_value
    # The freshness query must carry source_name as a bound param.
    assert cur.execute.call_args.args[1] == ("mhs_databook",)


# ── test 4: missing tier-1 ────────────────────────────────────────────────────


def test_tier1_missing_when_no_db_row():
    """A tier-1 entry with no row in _tier1_inventory must be flagged MISSING."""
    conn = _tier1_conn(None)
    entry = {
        "name": "fred_g17",
        "lane": "tier-1",
        "cadence_days": 30,
        "tolerance_multiplier": 2.0,
        "inventory_id": "lake-tier1/macro/fred_g17/",
        "inventory_key_type": "prefix",
    }
    result = check_tier1_entry(conn, entry)
    assert result["status"] == "MISSING"
    assert result["last_run"] is None
    assert result["age_days"] is None


# ── cadence_days guard (07/18/2026 incident) ───────────────────────────────────
# A mid-scaffold registry entry (lee_parcels) shipped with cadence_days: null.
# int(None) crashed check_tier2_entry, which crashed run_probe's plain for-loop,
# which crashed the ENTIRE daily probe — every other dataset's freshness went
# unreported for 6 straight days, not just the one bad entry. Two layers now:
# _safe_cadence_days makes the specific case graceful; run_probe's try/except is
# the backstop for whatever the next unguarded field turns out to be.


def test_safe_cadence_days_returns_int_for_a_valid_entry():
    assert _safe_cadence_days({"cadence_days": 30}) == 30


def test_safe_cadence_days_returns_None_for_missing_key():
    assert _safe_cadence_days({}) is None


def test_safe_cadence_days_returns_None_for_null_value():
    """The literal shape of the incident: cadence_days present but None (YAML `null`)."""
    assert _safe_cadence_days({"cadence_days": None}) is None


def test_safe_cadence_days_returns_None_for_unparseable_value():
    assert _safe_cadence_days({"cadence_days": "not-a-number"}) is None


def test_tier1_entry_with_null_cadence_is_MISCONFIGURED_not_a_crash():
    conn = _tier1_conn(date.today())
    entry = {
        "name": "wip_pipeline",
        "lane": "tier-1",
        "cadence_days": None,
        "tolerance_multiplier": 2.0,
        "inventory_id": "lake-tier1/wip/",
        "inventory_key_type": "prefix",
    }
    result = check_tier1_entry(conn, entry)
    assert result["status"] == "MISCONFIGURED"
    assert result["name"] == "wip_pipeline"


def test_tier2_entry_with_null_cadence_is_MISCONFIGURED_not_a_crash():
    """The exact live crash: lee_parcels, lane=tier-2, cadence_days=None."""
    conn = _tier2_conn(datetime.now(tz=timezone.utc))
    entry = {
        "name": "lee_parcels",
        "lane": "tier-2",
        "cadence_days": None,
        "tolerance_multiplier": 1.5,
        "dlt_schema_name": "lee_parcels",
    }
    result = check_tier2_entry(conn, entry)
    assert result["status"] == "MISCONFIGURED"
    assert result["name"] == "lee_parcels"


def test_odd_window_entry_with_null_cadence_is_MISCONFIGURED_not_a_crash():
    conn = _odd_conn(None)
    entry = {**_ODD_BASE, "cadence_days": None}
    result = check_odd_window_entry(conn, entry)
    assert result["status"] == "MISCONFIGURED"


def test_run_probe_survives_one_entry_crashing_and_still_reports_the_rest():
    """The loop-level backstop: even a crash _safe_cadence_days doesn't catch (here,
    a missing tolerance_multiplier — a KeyError, not a cadence problem at all) must
    not cost every OTHER dataset its freshness result."""
    conn = _tier1_conn(date.today())
    registry = {
        "pipelines": [
            {
                "name": "fine_pipeline",
                "lane": "tier-1",
                "cadence_days": 30,
                "tolerance_multiplier": 2.0,
                "inventory_id": "lake-tier1/fine/",
                "inventory_key_type": "prefix",
            },
            {
                "name": "broken_pipeline",
                "lane": "tier-1",
                "cadence_days": 30,
                # tolerance_multiplier deliberately missing -> KeyError inside
                # check_tier1_entry, AFTER the cadence guard succeeds — proves the
                # backstop, not just the specific cadence_days fix.
                "inventory_id": "lake-tier1/broken/",
                "inventory_key_type": "prefix",
            },
        ]
    }
    pipeline_results, _view_results = run_probe(conn, registry)
    by_name = {r["name"]: r for r in pipeline_results}
    assert len(pipeline_results) == 2, "one crashing entry must not drop the other"
    assert by_name["fine_pipeline"]["status"] == "FRESH"
    assert by_name["broken_pipeline"]["status"] == "MISCONFIGURED"


# ── test 5: registry smoke test ───────────────────────────────────────────────


def test_registry_loads_and_iterates():
    """cadence_registry.yaml parses and has at least one active pipeline with required keys."""
    registry = load_registry(_REGISTRY_PATH)
    assert "pipelines" in registry, "registry must have a 'pipelines' key"
    assert len(registry["pipelines"]) > 0, "registry must have at least one active pipeline"
    first = registry["pipelines"][0]
    for key in ("name", "lane", "cadence_days", "tolerance_multiplier"):
        assert key in first, f"pipeline entry missing required key: {key}"


# ── ODD-window probe tests ────────────────────────────────────────────────────


def _odd_conn(freshness_val):
    """Mock connection returning (freshness_val,) or None from a freshness query."""
    row = (freshness_val,) if freshness_val is not None else None
    cur = MagicMock()
    cur.fetchone.return_value = row
    conn = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    return conn


_ODD_BASE = {
    "name": "test_odd",
    "lane": "tier-2",
    "probe_mode": "odd_window",
    "cadence_days": 90,
    "tolerance_multiplier": 2.0,
    "freshness_table": "data_lake.marketbeat_swfl",
    "freshness_column": "_ingested_at",
    "source_name": "test_source",
}


def test_odd_window_waiting_when_no_data_and_no_expected():
    """No DB data + no first_expected_by → WAITING (clock starts from today, window opens in one cadence)."""
    today = date(2026, 6, 9)
    conn = _odd_conn(None)
    result = check_odd_window_entry(conn, _ODD_BASE, _today=today)
    assert result["status"] == "WAITING"
    assert result["last_run"] is None
    assert result["expected_date"] == today + timedelta(days=_ODD_BASE["cadence_days"])


def test_odd_window_waiting_when_expected_is_far_future():
    """No DB data, first_expected_by 60 days away → WAITING (silent — too early to watch)."""
    today = date(2026, 6, 9)
    entry = {**_ODD_BASE, "first_expected_by": str(today + timedelta(days=60))}
    conn = _odd_conn(None)
    result = check_odd_window_entry(conn, entry, _today=today)
    assert result["status"] == "WAITING"


def test_odd_window_open_when_today_inside_window():
    """No DB data, first_expected_by 5 days away → today inside ±10-day window → WINDOW_OPEN."""
    today = date(2026, 6, 9)
    entry = {**_ODD_BASE, "first_expected_by": str(today + timedelta(days=5))}
    conn = _odd_conn(None)
    result = check_odd_window_entry(conn, entry, _today=today)
    assert result["status"] == "WINDOW_OPEN"


def test_odd_window_overdue_when_window_passed_without_data():
    """No DB data, first_expected_by 20 days ago → past window_end by 10 days → OVERDUE."""
    today = date(2026, 6, 9)
    entry = {**_ODD_BASE, "first_expected_by": str(today - timedelta(days=20))}
    conn = _odd_conn(None)
    result = check_odd_window_entry(conn, entry, _today=today)
    assert result["status"] == "OVERDUE"


def test_odd_window_fresh_when_data_arrived_recently():
    """7-day cadence (window_half=2), last_run 1 day ago → within window_half days → FRESH."""
    today = date(2026, 6, 9)
    last_run = today - timedelta(days=1)
    entry = {
        **_ODD_BASE,
        "cadence_days": 7,
        "freshness_table": "data_lake.active_listings_cre",
        "source_name": "crexi",
    }
    conn = _odd_conn(last_run)
    result = check_odd_window_entry(conn, entry, _today=today)
    assert result["status"] == "FRESH"
    assert result["last_run"] == last_run
