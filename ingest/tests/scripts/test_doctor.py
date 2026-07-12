"""Pure-layer tests for doctor.py. Zero DB, zero gh, zero network."""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.scripts import doctor


# ── view detection: pg_catalog, never information_schema ──────────────────────


def test_relkind_sql_reads_pg_catalog_not_information_schema():
    """LANDMINE: the lake MCP proxy's information_schema.tables reports
    data_lake.listing_active_stats as BASE TABLE. Only pg_catalog.pg_class.relkind
    tells the truth. Any view-vs-table branch MUST read pg_catalog."""
    sql = doctor.RELKIND_SQL.lower()
    assert "pg_catalog.pg_class" in sql
    assert "relkind" in sql
    assert "information_schema" not in sql


@pytest.mark.parametrize(
    "relkind,expected",
    [("r", "table"), ("p", "table"), ("v", "view"), ("m", "view"), ("f", "table"), (None, "missing")],
)
def test_kind_from_relkind(relkind, expected):
    assert doctor.kind_from_relkind(relkind) == expected


# ── join key ──────────────────────────────────────────────────────────────────


def test_resolve_table_mirrors_check_volume_entry_order():
    assert doctor.resolve_table({"count_table": "data_lake.a", "freshness_table": "data_lake.b"}) == "data_lake.a"
    assert doctor.resolve_table({"freshness_table": "data_lake.b"}) == "data_lake.b"
    assert doctor.resolve_table({"dlt_schema_name": "zhvi_swfl"}) == "data_lake.zhvi_swfl"
    assert doctor.resolve_table({"lane": "tier-1", "inventory_id": "x"}) is None


# ── worst-of ──────────────────────────────────────────────────────────────────


def test_worst_of():
    assert doctor.worst_of("green", "green") == "green"
    assert doctor.worst_of("green", "yellow", "green") == "yellow"
    assert doctor.worst_of("green", "yellow", "red") == "red"
    assert doctor.worst_of() == "green"


# ── freshness ─────────────────────────────────────────────────────────────────


def test_freshness_missing_is_red():
    assert doctor.freshness_severity({"name": "x", "status": "MISSING"}, set()) == "red"


def test_freshness_stale_is_yellow_unless_it_breached_its_own_SLA():
    assert doctor.freshness_severity({"name": "x", "status": "STALE"}, set()) == "yellow"
    assert doctor.freshness_severity({"name": "x", "status": "STALE"}, {"x"}) == "red"


def test_freshness_fresh_and_waiting_are_green():
    assert doctor.freshness_severity({"name": "x", "status": "FRESH"}, set()) == "green"
    assert doctor.freshness_severity({"name": "x", "status": "WAITING"}, set()) == "green"


# ── volume: the false-green rule ──────────────────────────────────────────────


def test_volume_ok_is_green_and_low_volume_is_red():
    assert doctor.volume_severity({"lane": "tier-2"}, {"volume_status": "OK"}) == ("OK", "green")
    assert doctor.volume_severity({"lane": "tier-2"}, {"volume_status": "LOW_VOLUME"}) == ("LOW_VOLUME", "red")


def test_tier2_with_a_declared_floor_and_a_None_volume_is_UNRESOLVED_RED_not_green():
    """check_volume_entry returns None on ANY DB error incl. a missing table
    (check_freshness.py:399-404, rollback-swallowed). For an entry that DECLARED a floor,
    None means the count could not be taken — that is the redfin_city_swfl ghost-table
    class. Silently greening it rebuilds root cause 1 INSIDE the fix."""
    entry = {"lane": "tier-2", "expected_rows_min": 9000, "count_table": "data_lake.ghost"}
    assert doctor.volume_severity(entry, {"volume_status": None}) == ("UNRESOLVED", "red")


def test_tier1_nightly_WITH_the_Spine_count_table_is_green_NOT_a_permanent_false_red():
    """city_pulse. The Spine attaches count_table + expected_rows_min, so assert_landed
    counts it DIRECTLY. check_volume_entry still returns None for it -- but that is the
    helper's tier-1 early return (:369-371), NOT a missing count. Reding a healthy source
    here would fail the daily probe EVERY MORNING once --fail-on red lands: a manufactured
    false-RED, the exact desensitization this build exists to reverse."""
    entry = {"lane": "tier-1", "nightly": True, "inventory_id": "city_pulse",
             "count_table": "data_lake.city_pulse", "expected_rows_min": 50}
    assert doctor.volume_severity(entry, {"volume_status": None})[1] == "green"


def test_tier1_nightly_WITHOUT_a_count_table_is_still_UNRESOLVED_RED():
    """The inverse. A nightly tier-1 entry the Spine did NOT make countable is a REAL
    hole -- the gate cannot reach it. Doctor says so; it does not pretend."""
    entry = {"lane": "tier-1", "nightly": True, "inventory_id": "x"}
    assert doctor.volume_severity(entry, {"volume_status": None}) == ("UNRESOLVED", "red")


def test_tier1_not_nightly_volume_is_NOT_APPLICABLE_green():
    entry = {"lane": "tier-1", "inventory_id": "zori"}
    assert doctor.volume_severity(entry, {"volume_status": None}) == ("NOT_APPLICABLE", "green")


def test_tier2_without_a_floor_is_NO_FLOOR_yellow_never_green():
    entry = {"lane": "tier-2", "freshness_table": "data_lake.x"}
    assert doctor.volume_severity(entry, {"volume_status": None}) == ("NO_FLOOR", "yellow")


# ── content ───────────────────────────────────────────────────────────────────


def test_content_error_fail_is_red_warn_fail_is_yellow_skip_is_yellow():
    vr = [
        {"table": "data_lake.t", "col": "a", "test": "not_null", "severity": "error", "status": "FAIL", "failing_rows": 91},
        {"table": "data_lake.t", "col": "b", "test": "unique", "severity": "warn", "status": "PASS", "failing_rows": 0},
    ]
    status, sev, failing = doctor.content_severity("data_lake.t", vr)
    assert (status, sev) == ("FAIL", "red")
    assert len(failing) == 1 and failing[0]["failing_rows"] == 91

    vr2 = [{"table": "data_lake.t", "col": "a", "test": "not_null", "severity": "warn", "status": "FAIL", "failing_rows": 3}]
    assert doctor.content_severity("data_lake.t", vr2)[:2] == ("FAIL", "yellow")

    vr3 = [{"table": "data_lake.t", "col": "a", "test": "range", "severity": "error", "status": "SKIP", "failing_rows": None}]
    assert doctor.content_severity("data_lake.t", vr3)[:2] == ("SKIP", "yellow")


def test_content_with_no_contracts_is_NO_CONTRACT_and_contributes_green():
    """Only 4 of ~74 datasets carry contracts today. Yellowing the other 70 would flood
    the report and train the operator to ignore it. The COVERAGE number carries that fact
    (header line), not 70 yellow rows."""
    assert doctor.content_severity("data_lake.t", [])[:2] == ("NO_CONTRACT", "green")
    assert doctor.content_severity(None, [])[:2] == ("NO_CONTRACT", "green")


# ── run-status ────────────────────────────────────────────────────────────────


def test_run_severity_map():
    assert doctor.run_severity({"run_status": "GREEN"}, None) == ("GREEN", "green")
    assert doctor.run_severity({"run_status": "RED"}, None) == ("RED", "red")
    assert doctor.run_severity({"run_status": "TIMEOUT"}, None) == ("TIMEOUT", "red")
    assert doctor.run_severity({"run_status": "NEVER_RAN"}, None) == ("NEVER_RAN", "red")
    assert doctor.run_severity({"run_status": "CANCELLED"}, None) == ("CANCELLED", "yellow")
    assert doctor.run_severity({"run_status": "IN_PROGRESS"}, None) == ("IN_PROGRESS", "green")
    assert doctor.run_severity({"run_status": "NO_RUNS_IN_WINDOW"}, None) == ("NO_RUNS_IN_WINDOW", "yellow")


def test_disabled_with_a_cron_in_source_is_red_disabled_without_one_is_yellow():
    """Correction #5: 4 workflows carry a live cron in SOURCE but are disabled_manually at
    the API, orphaning 6 registry entries. Neither Phase-2 mode can see it; the manifest +
    gh state can."""
    assert doctor.run_severity({"run_status": "DISABLED", "cron_in_source": True}, None) == ("DISABLED", "red")
    assert doctor.run_severity({"run_status": "DISABLED", "cron_in_source": False}, None) == ("DISABLED", "yellow")


def test_gh_unavailable_is_yellow_never_green():
    """An unavailable domain is reported as unavailable, not as healthy."""
    assert doctor.run_severity(None, "gh 403 — no actions: read") == ("GH_UNAVAILABLE", "yellow")


def test_no_workflow_field_is_yellow_not_green():
    """Spine gap: an entry with no `workflow:` cannot be joined to a run. That is a gap."""
    assert doctor.run_severity(None, None) == ("NO_WORKFLOW", "yellow")
