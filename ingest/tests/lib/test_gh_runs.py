"""Pure-side tests for the gh (run-status) domain. Zero subprocess, zero network."""
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.lib import gh_runs

NOW = datetime(2026, 7, 11, 12, 0, 0, tzinfo=timezone.utc)

WORKFLOWS = [
    {"id": 1, "name": "Daily rebuild", "path": ".github/workflows/daily-rebuild.yml", "state": "active"},
    {"id": 2, "name": "Corridor pulse weekly", "path": ".github/workflows/corridor-pulse-weekly.yml", "state": "active"},
    {"id": 3, "name": "Graphify republish", "path": ".github/workflows/graphify-republish.yml", "state": "active"},
    {"id": 4, "name": "Narrative bake", "path": ".github/workflows/narrative-bake.yml", "state": "disabled_manually"},
    {"id": 5, "name": "Annual FAF5", "path": ".github/workflows/faf5-annual.yml", "state": "active"},
]

MANIFEST = {
    "corridor-pulse-weekly.yml": {"file": "corridor-pulse-weekly.yml", "scheduled": True, "timeout_minutes": 30},
    "daily-rebuild.yml": {"file": "daily-rebuild.yml", "scheduled": True, "timeout_minutes": 60},
    "narrative-bake.yml": {"file": "narrative-bake.yml", "scheduled": True, "timeout_minutes": 20},
    "graphify-republish.yml": {"file": "graphify-republish.yml", "scheduled": True, "timeout_minutes": 15},
    "faf5-annual.yml": {"file": "faf5-annual.yml", "scheduled": True, "timeout_minutes": 30},
}


def _run(wf_id, name, conclusion, created, updated, status="completed"):
    return {
        "workflowDatabaseId": wf_id,
        "workflowName": name,
        "conclusion": conclusion,
        "status": status,
        "event": "schedule",
        "createdAt": created,
        "startedAt": created,
        "updatedAt": updated,
        "url": f"https://github.com/x/y/actions/runs/{wf_id}",
    }


def test_index_workflows_keys_by_filename():
    idx = gh_runs.index_workflows(WORKFLOWS)
    assert set(idx) == {
        "daily-rebuild.yml",
        "corridor-pulse-weekly.yml",
        "graphify-republish.yml",
        "narrative-bake.yml",
        "faf5-annual.yml",
    }
    assert idx["daily-rebuild.yml"]["id"] == 1


def test_green_run_and_last_success():
    runs = [_run(1, "Daily rebuild", "success", "2026-07-11T04:05:00Z", "2026-07-11T04:42:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    d = s["daily-rebuild.yml"]
    assert d["run_status"] == "GREEN"
    assert d["last_conclusion"] == "success"
    assert d["last_success_at"] == "2026-07-11T04:05:00Z"
    assert d["consecutive_failures"] == 0


def test_cancelled_at_95pct_of_timeout_is_TIMEOUT_not_CANCELLED():
    # corridor-pulse-weekly: timeout_minutes 30 -> 29 elapsed minutes is >= 95% (28.5).
    runs = [_run(2, "Corridor pulse weekly", "cancelled", "2026-07-11T02:00:00Z", "2026-07-11T02:29:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    assert s["corridor-pulse-weekly.yml"]["run_status"] == "TIMEOUT"


def test_cancelled_well_under_timeout_is_CANCELLED():
    runs = [_run(2, "Corridor pulse weekly", "cancelled", "2026-07-11T02:00:00Z", "2026-07-11T02:04:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    assert s["corridor-pulse-weekly.yml"]["run_status"] == "CANCELLED"


def test_cancelled_with_no_manifest_timeout_degrades_to_CANCELLED_never_guesses_TIMEOUT():
    runs = [_run(2, "Corridor pulse weekly", "cancelled", "2026-07-11T02:00:00Z", "2026-07-11T02:29:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=None)
    assert s["corridor-pulse-weekly.yml"]["run_status"] == "CANCELLED"
    assert s["corridor-pulse-weekly.yml"]["timeout_minutes"] is None


def test_consecutive_failures_counts_the_leading_streak_only():
    runs = [
        _run(3, "Graphify republish", "failure", "2026-07-11T05:00:00Z", "2026-07-11T05:01:00Z"),
        _run(3, "Graphify republish", "failure", "2026-07-10T05:00:00Z", "2026-07-10T05:01:00Z"),
        _run(3, "Graphify republish", "success", "2026-07-09T05:00:00Z", "2026-07-09T05:01:00Z"),
        _run(3, "Graphify republish", "failure", "2026-07-08T05:00:00Z", "2026-07-08T05:01:00Z"),
    ]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    d = s["graphify-republish.yml"]
    assert d["run_status"] == "RED"
    assert d["consecutive_failures"] == 2
    assert d["last_success_at"] == "2026-07-09T05:00:00Z"


def test_disabled_at_the_api_beats_a_green_run():
    # Correction #5: 4 workflows carry a live cron in SOURCE but are disabled_manually at
    # the GitHub API. Only `gh workflow list` state sees this — the file does not.
    runs = [_run(4, "Narrative bake", "success", "2026-07-01T10:23:00Z", "2026-07-01T10:30:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    d = s["narrative-bake.yml"]
    assert d["run_status"] == "DISABLED"
    assert d["state"] == "disabled_manually"
    assert d["cron_in_source"] is True  # manifest says scheduled -> a cron nobody is running


def test_no_runs_in_window_is_NO_RUNS_IN_WINDOW_not_NEVER_RAN():
    # An annual/monthly workflow legitimately has no run inside a 500-run window.
    # Calling that NEVER_RAN would be a FALSE RED. It must stay unproven until the
    # targeted per-workflow backfill (fetch_runs_for_workflow) says otherwise.
    s = gh_runs.summarize_runs([], gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    assert s["faf5-annual.yml"]["run_status"] == "NO_RUNS_IN_WINDOW"
    assert s["faf5-annual.yml"]["last_success_at"] is None


def test_backfilled_empty_result_promotes_to_NEVER_RAN():
    idx = gh_runs.index_workflows(WORKFLOWS)
    s = gh_runs.summarize_runs([], idx, now=NOW, manifest_by_file=MANIFEST)
    s = gh_runs.apply_backfill(s, {"faf5-annual.yml": []}, now=NOW, manifest_by_file=MANIFEST)
    assert s["faf5-annual.yml"]["run_status"] == "NEVER_RAN"


def test_backfilled_old_success_is_GREEN_not_a_false_red():
    idx = gh_runs.index_workflows(WORKFLOWS)
    s = gh_runs.summarize_runs([], idx, now=NOW, manifest_by_file=MANIFEST)
    old = [_run(5, "Annual FAF5", "success", "2026-01-04T03:00:00Z", "2026-01-04T03:20:00Z")]
    s = gh_runs.apply_backfill(s, {"faf5-annual.yml": old}, now=NOW, manifest_by_file=MANIFEST)
    assert s["faf5-annual.yml"]["run_status"] == "GREEN"
    assert s["faf5-annual.yml"]["last_success_at"] == "2026-01-04T03:00:00Z"


def test_workflows_needing_backfill_lists_only_the_empty_ones():
    s = gh_runs.summarize_runs(
        [_run(1, "Daily rebuild", "success", "2026-07-11T04:05:00Z", "2026-07-11T04:42:00Z")],
        gh_runs.index_workflows(WORKFLOWS),
        now=NOW,
        manifest_by_file=MANIFEST,
    )
    need = gh_runs.workflows_needing_backfill(s)
    assert "daily-rebuild.yml" not in need
    assert "faf5-annual.yml" in need


# ── streak recheck: the brevitas_listings truncation gap ──────────────────────
# An infrequent (weekly/monthly) workflow can have ONLY its most-recent failure inside the
# 500-run bulk window while its earlier consecutive failures fell outside it. The bulk view
# then reads streak=1 (RED) and — without a targeted recheck — doctor calls it TRANSIENT even
# though the workflow has 3 real, consecutive, GH-confirmed failures. These tests pin that a
# RED-with-low-streak workflow is flagged for backfill and that apply_backfill recomputes the
# TRUE streak. workflows_needing_backfill (zero in-window runs) never covered this class — a
# single in-window failure disqualified it there — which is exactly how the bug slipped in.


def test_streak_recheck_flags_a_red_workflow_with_a_truncated_low_in_window_streak():
    # Only the MOST RECENT of several real failures is inside the bulk window -> streak=1.
    runs = [_run(3, "Graphify republish", "failure", "2026-07-11T05:00:00Z", "2026-07-11T05:01:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    assert s["graphify-republish.yml"]["run_status"] == "RED"
    assert s["graphify-republish.yml"]["consecutive_failures"] == 1
    recheck = gh_runs.workflows_needing_streak_recheck(s)
    assert "graphify-republish.yml" in recheck
    # workflows_needing_backfill must NOT claim it — it has an in-window run, so it is not empty.
    assert "graphify-republish.yml" not in gh_runs.workflows_needing_backfill(s)


def test_streak_recheck_ignores_green_and_never_ran_workflows():
    runs = [_run(1, "Daily rebuild", "success", "2026-07-11T04:05:00Z", "2026-07-11T04:42:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    recheck = gh_runs.workflows_needing_streak_recheck(s)
    assert "daily-rebuild.yml" not in recheck   # GREEN
    assert "faf5-annual.yml" not in recheck     # NO_RUNS_IN_WINDOW is the OTHER trigger's job


def test_streak_recheck_skips_a_red_workflow_whose_full_streak_is_already_in_window():
    # Three failures already visible in the bulk window -> streak=3 already escalates past
    # TRANSIENT with no recheck needed, so it must NOT be flagged (no wasted gh call).
    runs = [
        _run(3, "Graphify republish", "failure", "2026-07-11T05:00:00Z", "2026-07-11T05:01:00Z"),
        _run(3, "Graphify republish", "failure", "2026-07-10T05:00:00Z", "2026-07-10T05:01:00Z"),
        _run(3, "Graphify republish", "failure", "2026-07-09T05:00:00Z", "2026-07-09T05:01:00Z"),
    ]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    assert s["graphify-republish.yml"]["consecutive_failures"] == 3
    assert "graphify-republish.yml" not in gh_runs.workflows_needing_streak_recheck(s)


def test_recheck_backfill_recomputes_the_full_streak_past_the_transient_threshold():
    # 1 failure visible in-window; the targeted per-workflow backfill returns all 3 real
    # consecutive failures. apply_backfill must fold in the FULL streak (3), not the
    # truncated 1 — so doctor's `<= 2` TRANSIENT gate no longer catches it.
    runs = [_run(3, "Graphify republish", "failure", "2026-07-11T05:00:00Z", "2026-07-11T05:01:00Z")]
    s = gh_runs.summarize_runs(runs, gh_runs.index_workflows(WORKFLOWS), now=NOW, manifest_by_file=MANIFEST)
    targeted = [
        _run(3, "Graphify republish", "failure", "2026-07-11T05:00:00Z", "2026-07-11T05:01:00Z"),
        _run(3, "Graphify republish", "failure", "2026-07-04T05:00:00Z", "2026-07-04T05:01:00Z"),
        _run(3, "Graphify republish", "failure", "2026-06-27T05:00:00Z", "2026-06-27T05:01:00Z"),
    ]
    s = gh_runs.apply_backfill(s, {"graphify-republish.yml": targeted}, now=NOW, manifest_by_file=MANIFEST)
    d = s["graphify-republish.yml"]
    assert d["run_status"] == "RED"
    assert d["consecutive_failures"] == 3        # NOT the truncated 1
    assert d["last_success_at"] is None          # no success in the recomputed history
