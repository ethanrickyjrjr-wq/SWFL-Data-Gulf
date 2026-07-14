"""Cred domain B — GitHub Actions run-status, via the `gh` CLI over subprocess.

There is NO Python helper for this domain. It lives entirely in the TS watcher
(scripts/tripwire-scan.mjs:103 `gh workflow list --all`, :129 `gh run list --json ...`),
and ingest/requirements-probe.txt carries no HTTP client and no GitHub client. So doctor
shells to `gh` itself. Precedent for subprocess in ingest/: backfill_lee_permits.py:13,50
and faf5_to_parquet.py:14,70.

`gh` is preinstalled and authenticated on GHA runners WHEN `GH_TOKEN` is set — AND the
workflow declares `permissions: actions: read`. With an explicit `permissions:` block,
unspecified scopes default to NONE, so without `actions: read` both commands 403 and the
whole run-status domain silently degrades to UNKNOWN. See freshness-probe-daily.yml.

VERIFIED LIVE (gh 2.95.0, `--help`, 2026-07-11) — do not change these field lists from memory:
  gh run list      --json: attempt conclusion createdAt databaseId displayTitle event headBranch
                           headSha name number startedAt status updatedAt url workflowDatabaseId
                           workflowName          (default --limit 20 — ALWAYS pass it)
  gh workflow list --json: id name path state    (default --limit 50 — we have ~83 workflows,
                           so --limit is load-bearing or the list silently truncates)
  Runs carry NO workflow path. The join is run.workflowDatabaseId <-> workflow.id.

PURE / IMPURE SPLIT: only fetch_* touch subprocess. index_workflows / summarize_runs /
apply_backfill / workflows_needing_backfill / workflows_needing_streak_recheck are pure and
fixture-tested with zero gh.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime

_RUN_FIELDS = (
    "workflowName,workflowDatabaseId,conclusion,status,event,createdAt,startedAt,updatedAt,url"
)
_WF_FIELDS = "id,name,path,state"

# A cancelled run that burned >= this share of its ceiling was killed BY the ceiling.
_TIMEOUT_RATIO = 0.95


class GhUnavailable(RuntimeError):
    """`gh` is missing, unauthenticated, 403 (no `actions: read`), or timed out.

    Doctor DEGRADES on this — it prints the reason, marks run-status unknown on every
    line, and still emits the Postgres domains. It never crashes and never green-washes:
    an unavailable domain is reported as unavailable, not as healthy.
    """


def _gh_json(args: list[str], timeout: int = 90):
    try:
        proc = subprocess.run(
            ["gh", *args], capture_output=True, text=True, timeout=timeout, check=False
        )
    except FileNotFoundError as exc:
        raise GhUnavailable("`gh` is not on PATH") from exc
    except subprocess.TimeoutExpired as exc:
        raise GhUnavailable(f"`gh {' '.join(args)}` timed out after {timeout}s") from exc
    if proc.returncode != 0:
        err = (proc.stderr or "").strip()[:300]
        hint = ""
        if "403" in err or "not accessible" in err.lower():
            hint = " — add `permissions: actions: read` to the workflow, and GH_TOKEN to env:"
        raise GhUnavailable(f"`gh {' '.join(args)}` exited {proc.returncode}: {err}{hint}")
    try:
        return json.loads(proc.stdout or "[]")
    except json.JSONDecodeError as exc:
        raise GhUnavailable(f"`gh {' '.join(args)}` returned non-JSON output") from exc


def fetch_workflows(limit: int = 200) -> list[dict]:
    """--all includes disabled workflows (the `disabled_manually` class). IMPURE."""
    return _gh_json(["workflow", "list", "--all", "--limit", str(limit), "--json", _WF_FIELDS])


def fetch_runs(limit: int = 500) -> list[dict]:
    """ONE bulk call for the whole fleet — not one per workflow. IMPURE."""
    return _gh_json(["run", "list", "--limit", str(limit), "--json", _RUN_FIELDS])


def fetch_runs_for_workflow(path: str, limit: int = 5) -> list[dict]:
    """Targeted backfill for a workflow the bulk window missed (weekly/monthly/annual).
    `path` is the full workflow path from `gh workflow list` (.github/workflows/x.yml). IMPURE."""
    return _gh_json(
        ["run", "list", "--workflow", path, "--limit", str(limit), "--json", _RUN_FIELDS]
    )


# ── pure ──────────────────────────────────────────────────────────────────────


def _iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def index_workflows(workflows: list[dict]) -> dict[str, dict]:
    """{basename(path): workflow} — keyed by FILENAME, the same key the Spine's
    registry `workflow:` field and the Phase-3a manifest's `file` field use. PURE."""
    out: dict[str, dict] = {}
    for wf in workflows:
        fname = (wf.get("path") or "").rsplit("/", 1)[-1]
        if fname:
            out[fname] = wf
    return out


def _classify(wf: dict, wf_runs: list[dict], timeout_minutes, *, backfilled: bool) -> dict:
    state = wf.get("state", "active")
    completed = [r for r in wf_runs if r.get("status") == "completed"]
    last = wf_runs[0] if wf_runs else None
    last_success = next((r for r in completed if r.get("conclusion") == "success"), None)

    streak = 0
    for r in completed:
        if r.get("conclusion") == "success":
            break
        streak += 1

    if state != "active":
        status = "DISABLED"
    elif not wf_runs:
        # NEVER_RAN is only assertable AFTER the targeted backfill came back empty.
        # Before that, "no runs in a 500-run window" is a WINDOW artifact for any
        # weekly/monthly/annual workflow — asserting NEVER_RAN there is a false RED.
        status = "NEVER_RAN" if backfilled else "NO_RUNS_IN_WINDOW"
    elif last.get("status") != "completed":
        status = "IN_PROGRESS"
    elif last.get("conclusion") == "success":
        status = "GREEN"
    elif last.get("conclusion") in ("cancelled", "timed_out"):
        started = _iso(last.get("startedAt")) or _iso(last.get("createdAt"))
        ended = _iso(last.get("updatedAt"))
        elapsed_min = (ended - started).total_seconds() / 60 if (started and ended) else None
        if (
            timeout_minutes
            and elapsed_min is not None
            and elapsed_min >= _TIMEOUT_RATIO * float(timeout_minutes)
        ):
            status = "TIMEOUT"
        else:
            status = "CANCELLED"
    else:
        status = "RED"

    return {
        "file": (wf.get("path") or "").rsplit("/", 1)[-1],
        "name": wf.get("name"),
        "state": state,
        "run_status": status,
        "last_conclusion": last.get("conclusion") if last else None,
        "last_run_at": last.get("createdAt") if last else None,
        "last_success_at": last_success.get("createdAt") if last_success else None,
        "consecutive_failures": streak,
        "url": last.get("url") if last else None,
        "timeout_minutes": timeout_minutes,
        "cron_in_source": None,  # filled by the caller from the manifest
    }


def summarize_runs(
    runs: list[dict],
    workflows_by_file: dict[str, dict],
    *,
    now: datetime,
    manifest_by_file: dict[str, dict] | None = None,
) -> dict[str, dict]:
    """PURE. -> {workflow_file: summary}.

    run_status ∈ GREEN | RED | TIMEOUT | CANCELLED | IN_PROGRESS | DISABLED |
                 NO_RUNS_IN_WINDOW | NEVER_RAN
    """
    by_id: dict[int, list[dict]] = {}
    for r in runs:
        by_id.setdefault(r.get("workflowDatabaseId"), []).append(r)
    for lst in by_id.values():
        lst.sort(key=lambda r: r.get("createdAt") or "", reverse=True)

    out: dict[str, dict] = {}
    for fname, wf in workflows_by_file.items():
        man = (manifest_by_file or {}).get(fname) or {}
        summary = _classify(
            wf, by_id.get(wf.get("id"), []), man.get("timeout_minutes"), backfilled=False
        )
        summary["cron_in_source"] = bool(man.get("scheduled")) if man else None
        out[fname] = summary
    return out


def workflows_needing_backfill(summaries: dict[str, dict]) -> list[str]:
    """PURE. Files whose run history fell ENTIRELY outside the bulk window (zero in-window
    runs) — the ONLY ones this trigger justifies a targeted per-workflow gh call for. A RED
    workflow with a truncated-but-nonzero in-window streak is a DIFFERENT gap; it is handled
    by workflows_needing_streak_recheck, which runs alongside this one."""
    return sorted(f for f, s in summaries.items() if s["run_status"] == "NO_RUNS_IN_WINDOW")


# The in-window streak at/under which a RED workflow could be MIS-read as TRANSIENT. This MUST
# stay in lockstep with doctor.prescribe's TRANSIENT gate — ingest/scripts/doctor.py's
# `run["status"] == "RED" and run.get("consecutive_failures", 0) <= 2`. Change one, change both.
_TRANSIENT_STREAK_MAX = 2


def workflows_needing_streak_recheck(summaries: dict[str, dict]) -> list[str]:
    """PURE. RED workflows whose in-window streak is small enough (<= _TRANSIENT_STREAK_MAX)
    that the bulk 500-run window may have TRUNCATED it — the true streak could be longer.

    Closes the brevitas_listings gap: an infrequent (weekly/monthly) workflow's most-recent
    failure can land inside the 500-run window while its earlier consecutive failures fell
    outside it. The bulk view then reads streak=1 and doctor (wrongly) calls it TRANSIENT,
    even though the workflow has 3 real, consecutive, GH-confirmed failures. Any such
    workflow gets a targeted per-workflow gh call so the TRUE streak — not the window
    artifact — drives the TRANSIENT/escalate decision.

    Runs ALONGSIDE workflows_needing_backfill (which fires only on ZERO in-window runs): a
    workflow with exactly one in-window failure never qualified there, which is precisely why
    the bug slipped through. A daily workflow whose full streak is already in-window recomputes
    to the SAME streak on backfill, so flagging it here is harmless — the set stays bounded by
    the (small) count of currently-red workflows."""
    return sorted(
        f
        for f, s in summaries.items()
        if s["run_status"] == "RED"
        and s.get("consecutive_failures", 0) <= _TRANSIENT_STREAK_MAX
    )


def apply_backfill(
    summaries: dict[str, dict],
    backfilled: dict[str, list[dict]],
    *,
    now: datetime,
    manifest_by_file: dict[str, dict] | None = None,
) -> dict[str, dict]:
    """PURE. Fold targeted per-workflow run lists back in. An empty list here is the ONLY
    evidence that promotes NO_RUNS_IN_WINDOW -> NEVER_RAN."""
    out = dict(summaries)
    for fname, wf_runs in backfilled.items():
        prev = out.get(fname)
        if prev is None:
            continue
        man = (manifest_by_file or {}).get(fname) or {}
        wf = {
            "path": f".github/workflows/{fname}",
            "name": prev["name"],
            "state": prev["state"],
            "id": None,
        }
        ordered = sorted(wf_runs, key=lambda r: r.get("createdAt") or "", reverse=True)
        summary = _classify(
            wf, ordered, man.get("timeout_minutes") or prev["timeout_minutes"], backfilled=True
        )
        summary["cron_in_source"] = prev["cron_in_source"]
        out[fname] = summary
    return out
