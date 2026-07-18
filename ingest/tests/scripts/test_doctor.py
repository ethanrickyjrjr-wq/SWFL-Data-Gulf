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


def test_freshness_misconfigured_is_red_not_dropped():
    """07/18/2026 incident: a registry entry the probe couldn't even evaluate (bare
    int(None) on cadence_days) crashed run_probe entirely and hid 6 days of real
    reds. MISCONFIGURED is the graceful result for that case now — must stay red,
    never silently fall through to the "unknown status" yellow default."""
    assert doctor.freshness_severity({"name": "x", "status": "MISCONFIGURED"}, set()) == "red"


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


# ── prescribe(): the (signal shape) -> enum member assignment ─────────────────

from ingest.lib import prescriptions as rx  # noqa: E402


def _line(**over):
    base = {
        "dataset": "listing_lifecycle",
        "table": "data_lake.listing_state",
        "kind": "table",
        "workflow": "steady-listings.yml",
        "pipeline": "listing_lifecycle",
        "health": "red",
        "freshness": {"status": "FRESH", "severity": "green"},
        "volume": {"status": "OK", "severity": "green", "landed": 34637, "min_rows": 9000},
        "content": {"status": "NO_CONTRACT", "severity": "green", "failing": []},
        "run": {"status": "GREEN", "severity": "green", "consecutive_failures": 0, "url": None},
    }
    base.update(over)
    return base


def test_prescribe_returns_none_for_a_green_line():
    assert doctor.prescribe(_line(health="green")) is None


def test_coverage_only_line_gets_ZERO_COVERAGE_naming_the_table():
    line = _line(dataset="data_lake.parcel_subdivision", table="data_lake.parcel_subdivision",
                 kind="coverage_only", workflow=None, pipeline=None)
    p = doctor.prescribe(line)
    assert p["code"] == rx.ZERO_COVERAGE
    assert "data_lake.parcel_subdivision" in p["fix"]
    assert "ingest/cadence_registry.yaml" in p["fix"]


def test_timeout_gets_TIMEOUT_KILL_and_should_retry_false_the_money_guard():
    line = _line(workflow="corridor-pulse-weekly.yml",
                 run={"status": "TIMEOUT", "severity": "red", "consecutive_failures": 0, "url": "u"})
    p = doctor.prescribe(line)
    assert p["code"] == rx.TIMEOUT_KILL
    assert p["should_retry"] is False
    assert "corridor-pulse-weekly.yml" in p["fix"]


def test_green_run_with_zero_rows_gets_GAP_SENTINEL_dead_key():
    line = _line(volume={"status": "LOW_VOLUME", "severity": "red", "landed": 0, "min_rows": 9000})
    p = doctor.prescribe(line)
    assert p["code"] == rx.GAP_SENTINEL
    assert "steady-listings.yml" in p["fix"]


def test_ghost_table_gets_NEVER_LANDED_naming_both_table_and_workflow():
    line = _line(dataset="redfin_city", table="data_lake.redfin_city_swfl", kind="missing",
                 workflow="redfin.yml",
                 freshness={"status": "MISSING", "severity": "red"},
                 volume={"status": "UNRESOLVED", "severity": "red", "landed": None, "min_rows": 100},
                 run={"status": "NO_RUNS_IN_WINDOW", "severity": "yellow", "consecutive_failures": 0, "url": None})
    p = doctor.prescribe(line)
    assert p["code"] == rx.NEVER_LANDED
    assert "data_lake.redfin_city_swfl" in p["fix"]
    assert "redfin.yml" in p["fix"]


def test_one_failed_run_gets_TRANSIENT_and_is_retryable():
    line = _line(run={"status": "RED", "severity": "red", "consecutive_failures": 1, "url": "u"})
    p = doctor.prescribe(line)
    assert p["code"] == rx.TRANSIENT
    assert p["should_retry"] is True


def test_three_failed_runs_is_no_longer_transient_and_becomes_UNKNOWN_with_evidence():
    line = _line(run={"status": "RED", "severity": "red", "consecutive_failures": 3,
                      "url": "https://github.com/x/y/actions/runs/9"})
    p = doctor.prescribe(line)
    assert p["code"] == rx.UNKNOWN
    assert p["should_retry"] is False
    assert "3 consecutive" in p["evidence"]
    assert "https://github.com/x/y/actions/runs/9" in p["evidence"]


def test_disabled_with_a_cron_in_source_is_UNKNOWN_with_evidence_never_an_invented_class():
    """No enum member covers this class yet (check doctor_rx_workflow_disabled_member).
    UNTIL the operator approves one, doctor says UNKNOWN and attaches the evidence.
    It does NOT invent a diagnosis, and it does NOT silently extend an enum the Phase-3b
    incident handler also depends on."""
    line = _line(workflow="narrative-bake.yml",
                 run={"status": "DISABLED", "severity": "red", "consecutive_failures": 0,
                      "url": None, "cron_in_source": True})
    p = doctor.prescribe(line)
    assert p["code"] == rx.UNKNOWN
    assert "narrative-bake.yml" in p["evidence"]
    assert "disabled_manually" in p["evidence"]


def test_a_content_only_red_carries_NO_prescription_because_the_failing_test_IS_the_diagnosis():
    line = _line(content={"status": "FAIL", "severity": "red", "failing": [
        {"table": "data_lake.listing_state", "col": "list_price", "test": "range",
         "severity": "error", "failing_rows": 91, "status": "FAIL"}]})
    assert doctor.prescribe(line) is None


def test_prescribe_never_returns_a_member_outside_DOCTOR_ASSIGNABLE():
    """ACTION_VERSION / SECRET_NOT_WIRED / SCHEMA_NAME_DRIFT are Phase-2 (PR-time, no
    ledger row) and WAF_BLOCK needs a log read — doctor cannot observe any of them."""
    shapes = [
        _line(health="green"),
        _line(kind="coverage_only", workflow=None),
        _line(run={"status": "TIMEOUT", "severity": "red", "consecutive_failures": 0, "url": "u"}),
        _line(volume={"status": "LOW_VOLUME", "severity": "red", "landed": 0, "min_rows": 1}),
        _line(freshness={"status": "MISSING", "severity": "red"},
              run={"status": "RED", "severity": "red", "consecutive_failures": 5, "url": "u"}),
        _line(run={"status": "RED", "severity": "red", "consecutive_failures": 1, "url": "u"}),
        _line(run={"status": "NEVER_RAN", "severity": "red", "consecutive_failures": 0, "url": None}),
        _line(run={"status": "CANCELLED", "severity": "yellow", "consecutive_failures": 0, "url": "u"}),
    ]
    for line in shapes:
        p = doctor.prescribe(line)
        if p is not None:
            assert p["code"] in rx.DOCTOR_ASSIGNABLE, f"{p['code']} is not doctor-observable"


# ── build_health_lines: the join ──────────────────────────────────────────────

REGISTRY = {
    "pipelines": [
        {"name": "listing_lifecycle", "lane": "tier-2", "workflow": "steady-listings.yml",
         "freshness_table": "data_lake.listing_state", "expected_rows_min": 9000,
         "cadence_days": 1, "tolerance_multiplier": 3.0, "nightly": True},
        {"name": "redfin_city", "lane": "tier-2", "workflow": "redfin.yml",
         "count_table": "data_lake.redfin_city_swfl", "expected_rows_min": 100,
         "cadence_days": 7, "tolerance_multiplier": 2.0},
        {"name": "city_pulse", "lane": "tier-1", "workflow": "city-pulse-daily.yml",
         "inventory_id": "city_pulse", "cadence_days": 7, "tolerance_multiplier": 2.0,
         "nightly": True},
    ]
}

PIPELINE_RESULTS = [
    {"name": "listing_lifecycle", "lane": "tier-2", "status": "FRESH", "age_days": 0,
     "last_run": "2026-07-11", "volume_status": "OK", "volume_landed": 34637, "volume_min": 9000},
    {"name": "redfin_city", "lane": "tier-2", "status": "MISSING", "age_days": None,
     "last_run": None, "volume_status": None, "volume_landed": None, "volume_min": None},
    {"name": "city_pulse", "lane": "tier-1", "status": "FRESH", "age_days": 0,
     "last_run": "2026-07-11", "volume_status": None, "volume_landed": None, "volume_min": None},
]

GH = {
    "steady-listings.yml": {"run_status": "GREEN", "last_conclusion": "success",
                            "last_success_at": "2026-07-11T04:05:00Z", "consecutive_failures": 0,
                            "url": "u1", "cron_in_source": True, "state": "active"},
    "redfin.yml": {"run_status": "NO_RUNS_IN_WINDOW", "last_conclusion": None,
                   "last_success_at": None, "consecutive_failures": 0, "url": None,
                   "cron_in_source": True, "state": "active"},
    "city-pulse-daily.yml": {"run_status": "GREEN", "last_conclusion": "success",
                             "last_success_at": "2026-07-11T05:00:00Z", "consecutive_failures": 0,
                             "url": "u3", "cron_in_source": True, "state": "active"},
}

RELKINDS = {
    "data_lake.listing_state": "r",
    "data_lake.listing_active_stats": "v",   # the proxy lies about this one; pg_catalog does not
    "data_lake.parcel_subdivision": "r",
    # data_lake.redfin_city_swfl deliberately ABSENT -> ghost table
}


def _lines(**over):
    kw = dict(
        registry=REGISTRY,
        pipeline_results=PIPELINE_RESULTS,
        view_results=[],
        sla_errors=set(),
        value_results=[],
        ledger_rows=[],
        gh_summaries=GH,
        gh_error=None,
        manifest_by_file={},
        relkinds=RELKINDS,
        quality_tables=[],
    )
    kw.update(over)
    return {l["dataset"]: l for l in doctor.build_health_lines(**kw)}


def test_one_line_per_registry_entry():
    lines = _lines()
    assert set(lines) >= {"listing_lifecycle", "redfin_city", "city_pulse"}


def test_healthy_dataset_is_green_with_no_prescription():
    line = _lines()["listing_lifecycle"]
    assert line["health"] == "green"
    assert line["prescription"] is None
    assert line["kind"] == "table"


def test_ghost_table_is_red_NEVER_LANDED():
    line = _lines()["redfin_city"]
    assert line["health"] == "red"
    assert line["kind"] == "missing"          # absent from pg_catalog.pg_class
    assert line["volume"]["status"] == "UNRESOLVED"
    assert line["prescription"]["code"] == rx.NEVER_LANDED


def test_city_pulse_nightly_tier1_is_red_UNRESOLVED_not_a_smiling_green():
    line = _lines()["city_pulse"]
    assert line["volume"]["status"] == "UNRESOLVED"
    assert line["health"] == "red"


def test_quality_table_with_no_registry_entry_becomes_a_coverage_only_ZERO_COVERAGE_line():
    lines = _lines(quality_tables=["data_lake.parcel_subdivision", "data_lake.listing_state"])
    assert "data_lake.parcel_subdivision" in lines
    cov = lines["data_lake.parcel_subdivision"]
    assert cov["kind"] == "coverage_only"
    assert cov["prescription"]["code"] == rx.ZERO_COVERAGE
    # listing_state IS registry-covered -> must NOT also appear as a coverage_only line
    assert "data_lake.listing_state" not in lines


def test_the_view_is_reported_as_a_view_and_never_as_a_table():
    """LANDMINE: information_schema (via the lake MCP proxy) says listing_active_stats is a
    BASE TABLE. pg_catalog.pg_class.relkind='v' says otherwise, and pg_catalog wins."""
    lines = _lines(quality_tables=["data_lake.listing_active_stats"])
    assert lines["data_lake.listing_active_stats"]["kind"] == "view"


def test_content_fail_reds_the_line_and_attaches_the_failing_test():
    vr = [{"table": "data_lake.listing_state", "col": "list_price", "test": "range",
           "severity": "error", "status": "FAIL", "failing_rows": 91}]
    line = _lines(value_results=vr)["listing_lifecycle"]
    assert line["health"] == "red"
    assert line["content"]["status"] == "FAIL"
    assert line["content"]["failing"][0]["failing_rows"] == 91
    assert line["prescription"] is None  # the failing contract IS the diagnosis


def test_open_ledger_checks_attach_to_their_table():
    ledger = [
        {"check_key": "quality_fail_data-lake-listing-state_list_price_range",
         "project": "data-quality", "label": "Quality fail"},
        {"check_key": "quality_fail_data-lake-zhvi-swfl_zip_code_not_null",
         "project": "data-quality", "label": "other table"},
    ]
    line = _lines(ledger_rows=ledger)["listing_lifecycle"]
    assert line["open_checks"] == ["quality_fail_data-lake-listing-state_list_price_range"]


def test_gh_unavailable_yellows_run_status_and_never_greens_it():
    line = _lines(gh_summaries={}, gh_error="gh 403 — add `permissions: actions: read`")["listing_lifecycle"]
    assert line["run"]["status"] == "GH_UNAVAILABLE"
    assert line["run"]["severity"] == "yellow"
    assert line["health"] == "yellow"


def test_THE_INVARIANT_every_red_line_carries_a_prescription_or_a_failing_content_test():
    """Spec §9: 'every red line carries a prescription or an explicit unknown class —
    evidence attached (never an invented diagnosis).' This is that sentence, executable."""
    vr = [{"table": "data_lake.listing_state", "col": "list_price", "test": "range",
           "severity": "error", "status": "FAIL", "failing_rows": 91}]
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=vr, ledger_rows=[], gh_summaries=GH, gh_error=None, manifest_by_file={},
        relkinds=RELKINDS, quality_tables=["data_lake.parcel_subdivision"],
    )
    reds = [l for l in lines if l["health"] == "red"]
    assert reds, "fixture must produce at least one red line"
    for l in reds:
        has_rx = l["prescription"] is not None
        has_content_evidence = bool(l["content"]["failing"])
        assert has_rx or has_content_evidence, f"red line {l['dataset']} carries neither"
        if has_rx:
            assert l["prescription"]["fix"], "a prescription with empty fix-text is a placeholder"
            assert l["prescription"]["code"] in rx.DOCTOR_ASSIGNABLE


# ── collect_gh: the brevitas_listings truncation regression (I/O monkeypatched) ──


def _gh_run(wf_id, conclusion, created, url):
    return {
        "workflowDatabaseId": wf_id, "workflowName": "Brevitas listings",
        "conclusion": conclusion, "status": "completed", "event": "schedule",
        "createdAt": created, "startedAt": created,
        "updatedAt": created.replace("00:00Z", "05:00Z"), "url": url,
    }


def test_collect_gh_backfills_a_red_low_streak_workflow_and_surfaces_the_true_streak(monkeypatch):
    """brevitas_listings (weekly): the bulk 500-run window saw only the MOST RECENT of 3 real
    consecutive failures — the two prior ones fell outside the window — so the in-window streak
    was 1 and doctor classified it TRANSIENT. collect_gh must now fire a targeted per-workflow
    backfill for ANY red-with-low-streak workflow, recompute the FULL streak (3), and let
    doctor's `<= 2` TRANSIENT gate no longer catch it. This is the exact live bug, executable."""
    wfs = [{"id": 7, "name": "Brevitas listings",
            "path": ".github/workflows/ingest-brevitas-listings.yml", "state": "active"}]
    # bulk window: ONLY the most-recent failure is visible.
    bulk = [_gh_run(7, "failure", "2026-07-12T00:00Z", "u12")]
    # targeted per-workflow backfill: all 3 real, consecutive, GH-confirmed failures.
    targeted = [
        _gh_run(7, "failure", "2026-07-12T00:00Z", "u12"),
        _gh_run(7, "failure", "2026-07-05T00:00Z", "u05"),
        _gh_run(7, "failure", "2026-06-28T00:00Z", "u28"),
    ]
    calls = {"targeted_paths": []}

    def _fake_targeted(path, limit=5):
        calls["targeted_paths"].append(path)
        return targeted if "brevitas" in path else []

    monkeypatch.setattr(doctor.gh_runs, "fetch_workflows", lambda limit=200: wfs)
    monkeypatch.setattr(doctor.gh_runs, "fetch_runs", lambda limit=500: bulk)
    monkeypatch.setattr(doctor.gh_runs, "fetch_runs_for_workflow", _fake_targeted)

    summaries, gh_error = doctor.collect_gh({})
    assert gh_error is None
    # the targeted recheck actually fired for this workflow
    assert ".github/workflows/ingest-brevitas-listings.yml" in calls["targeted_paths"]
    s = summaries["ingest-brevitas-listings.yml"]
    assert s["run_status"] == "RED"
    assert s["consecutive_failures"] == 3          # the TRUE streak, NOT the truncated 1

    # ...and the corrected streak drives prescribe PAST TRANSIENT (the run signal escalates).
    line = _line(dataset="brevitas_listings", table="data_lake.active_listings_cre",
                 workflow="ingest-brevitas-listings.yml",
                 run={"status": "RED", "severity": "red",
                      "consecutive_failures": s["consecutive_failures"], "url": "u12"})
    p = doctor.prescribe(line)
    assert p["code"] != rx.TRANSIENT
    assert p["code"] == rx.UNKNOWN
    assert "3 consecutive" in p["evidence"]


def test_collect_gh_prioritizes_red_rechecks_over_empty_backfills_under_the_cap(monkeypatch):
    """The RED-recheck-FIRST ordering in collect_gh is load-bearing. With ~83 workflows a long
    tail of zero-in-window infrequent workflows can fill workflows_needing_backfill past
    max_backfill; if the RED rechecks were appended SECOND they would fall off the `[:cap]`
    slice and silently revive the brevitas truncation bug in production. This pins that a
    RED-low-streak workflow wins the scarce backfill slot over a NO_RUNS_IN_WINDOW one — it
    fails against both the pre-fix code (no recheck at all) and a backfill-first ordering."""
    wfs = [
        {"id": 7, "name": "Red weekly", "path": ".github/workflows/red.yml", "state": "active"},
        {"id": 8, "name": "Empty annual", "path": ".github/workflows/empty.yml", "state": "active"},
    ]
    bulk = [_gh_run(7, "failure", "2026-07-12T00:00Z", "u7")]  # id 8 has ZERO in-window runs
    red_targeted = [
        _gh_run(7, "failure", "2026-07-12T00:00Z", "u7"),
        _gh_run(7, "failure", "2026-07-05T00:00Z", "u7b"),
        _gh_run(7, "failure", "2026-06-28T00:00Z", "u7c"),
    ]
    calls = {"targeted_paths": []}

    def _fake_targeted(path, limit=5):
        calls["targeted_paths"].append(path)
        return red_targeted if path.endswith("red.yml") else []

    monkeypatch.setattr(doctor.gh_runs, "fetch_workflows", lambda limit=200: wfs)
    monkeypatch.setattr(doctor.gh_runs, "fetch_runs", lambda limit=500: bulk)
    monkeypatch.setattr(doctor.gh_runs, "fetch_runs_for_workflow", _fake_targeted)

    summaries, gh_error = doctor.collect_gh({}, max_backfill=1)  # exactly ONE slot
    assert gh_error is None
    assert ".github/workflows/red.yml" in calls["targeted_paths"]        # RED won the slot
    assert ".github/workflows/empty.yml" not in calls["targeted_paths"]  # empty crowded out
    assert summaries["red.yml"]["consecutive_failures"] == 3             # true streak folded in
    # the crowded-out empty workflow keeps its unbackfilled status — never a false RED
    assert summaries["empty.yml"]["run_status"] == "NO_RUNS_IN_WINDOW"


# ── --json contract (frozen: /census consumes this) ───────────────────────────

def test_json_top_level_shape_is_frozen():
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=[], ledger_rows=[], gh_summaries=GH, gh_error=None, manifest_by_file={},
        relkinds=RELKINDS, quality_tables=[],
    )
    payload = doctor.to_json(lines, gh_error=None, manifest_ok=True)
    assert set(payload) == {"schema_version", "generated_at", "counts", "coverage", "datasets"}
    assert payload["schema_version"] == 1
    assert set(payload["counts"]) == {"green", "yellow", "red", "total"}
    assert set(payload["coverage"]) == {
        "datasets", "with_workflow", "with_content_contracts", "gh", "manifest",
    }
    assert payload["counts"]["total"] == len(payload["datasets"])
    assert payload["generated_at"].endswith("Z")


def test_json_dataset_element_shape_is_frozen():
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=[], ledger_rows=[], gh_summaries=GH, gh_error=None, manifest_by_file={},
        relkinds=RELKINDS, quality_tables=[],
    )
    payload = doctor.to_json(lines, gh_error=None, manifest_ok=True)
    d = payload["datasets"][0]
    assert set(d) == {
        "dataset", "table", "kind", "lane", "workflow", "pipeline",
        "freshness", "volume", "content", "run", "view",
        "health", "prescription", "open_checks",
    }
    assert set(d["freshness"]) == {"status", "severity", "age_days", "last_run"}
    assert set(d["volume"]) == {"status", "severity", "landed", "min_rows"}
    assert set(d["content"]) == {"status", "severity", "failing"}
    assert set(d["run"]) == {"status", "severity", "last_conclusion", "last_success_at",
                             "consecutive_failures", "url", "cron_in_source"}


def test_json_reports_gh_unavailable_rather_than_pretending():
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=[], ledger_rows=[], gh_summaries={}, gh_error="gh 403", manifest_by_file={},
        relkinds=RELKINDS, quality_tables=[],
    )
    payload = doctor.to_json(lines, gh_error="gh 403", manifest_ok=False)
    assert payload["coverage"]["gh"] == "unavailable: gh 403"
    assert payload["coverage"]["manifest"] == "missing"


# ── report ────────────────────────────────────────────────────────────────────

def test_report_prints_the_prescription_fix_text_on_every_red_line():
    lines = doctor.build_health_lines(
        registry=REGISTRY, pipeline_results=PIPELINE_RESULTS, view_results=[], sla_errors=set(),
        value_results=[], ledger_rows=[], gh_summaries=GH, gh_error=None, manifest_by_file={},
        relkinds=RELKINDS, quality_tables=[],
    )
    text = doctor.format_report(doctor.to_json(lines, gh_error=None, manifest_ok=True))
    assert "NEVER_LANDED" in text
    assert "data_lake.redfin_city_swfl" in text     # the fix names the table
    assert "redfin.yml" in text                     # ...and the workflow
    assert "🔴" in text


def test_manifest_loader_failsofts_on_a_missing_file():
    assert doctor.load_manifest("/nope/_watch-manifest.json") == {}


# ── relkind SQL is parameterised, not interpolated ────────────────────────────

def test_collect_relkinds_binds_schemas_as_a_param():
    from unittest.mock import MagicMock
    cur = MagicMock()
    cur.fetchall.return_value = [("data_lake", "listing_active_stats", "v")]
    conn = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    out = doctor.collect_relkinds(conn, ["data_lake"])
    assert out == {"data_lake.listing_active_stats": "v"}
    sql_arg, params = cur.execute.call_args[0]
    assert "pg_catalog.pg_class" in sql_arg
    assert params == (["data_lake"],)
