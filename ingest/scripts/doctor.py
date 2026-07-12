"""doctor — ONE health line per dataset (spec §7 3c/3d).

worst of {freshness, volume, content, run-status} + a prescription.

Python on purpose: it IMPORTS check_freshness.py + check_data_quality.py rather than
re-querying them. Three cred domains, joined:
  A  Postgres (psycopg)   freshness · volume · content · the public.checks ledger
     -> ONE connection. public.checks lives in the SAME Postgres and is written over the
        same conn by check_freshness.sync_gap_checks — no Supabase REST needed for it.
  B  GitHub Actions (gh)  last-run / last-success / conclusion / enabled-disabled
     -> ingest/lib/gh_runs.py (subprocess; no Python helper exists for this domain).
  C  Supabase PostgREST   view liveness / missing GRANT
     -> check_freshness.check_view_liveness, already called inside run_probe. Genuinely
        separate ONLY because PostgREST catches a missing GRANT that psycopg structurally
        bypasses.

READ-ONLY BY CONSTRUCTION. Doctor writes nothing — not the checks ledger (that is
check_data_quality.sync_quality_checks + check_freshness.sync_gap_checks; a second writer
would double-open), not a baseline, not a row.

ADVISORY: exit 0 always, unless --fail-on red is passed (Task 12, after one green confirm).
"""
from __future__ import annotations

# ── pure join layer (no DB, no gh — unit-tested in ingest/tests/scripts/test_doctor.py) ──

# LOAD-BEARING: pg_catalog, NOT information_schema. The lake MCP proxy's
# information_schema.tables reports data_lake.listing_active_stats as a BASE TABLE. Only
# pg_catalog.pg_class.relkind identifies it as a view ('v'). Every view-vs-table branch in
# this file goes through here.
RELKIND_SQL = """
SELECT n.nspname, c.relname, c.relkind
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = ANY(%s)
  AND c.relkind = ANY(ARRAY['r', 'v', 'm', 'p', 'f'])
"""

_KIND = {"r": "table", "p": "table", "f": "table", "v": "view", "m": "view"}


def kind_from_relkind(relkind: str | None) -> str:
    """'v'/'m' -> view · 'r'/'p'/'f' -> table · absent from pg_class -> missing (a GHOST
    table: the registry claims it, Postgres has never heard of it)."""
    return _KIND.get(relkind or "", "missing")


def resolve_table(entry: dict) -> str | None:
    """The physical table a registry entry lands in — the join key between
    cadence_registry.yaml (keyed by PIPELINE NAME) and quality_registry.yaml (keyed by
    PHYSICAL TABLE). No crosswalk exists; doctor builds it.

    MIRRORS check_volume_entry's resolution order (check_freshness.py:373-377) exactly, so
    doctor's join key and the volume probe's count target can never diverge."""
    return (
        entry.get("count_table")
        or entry.get("freshness_table")
        or (f"data_lake.{entry['dlt_schema_name']}" if entry.get("dlt_schema_name") else None)
    )


_RANK = {"green": 0, "yellow": 1, "red": 2}


def worst_of(*severities: str) -> str:
    worst = "green"
    for s in severities:
        if _RANK.get(s, 0) > _RANK[worst]:
            worst = s
    return worst


# ── the four signals -> severity ──────────────────────────────────────────────

_FRESHNESS_SEVERITY = {
    "FRESH": "green",
    "WAITING": "green",
    "WINDOW_OPEN": "yellow",
    "STALE": "yellow",
    "UNINITIALIZED": "yellow",
    "OVERDUE": "red",
    "MISSING": "red",
}


def freshness_severity(result: dict, sla_errors: set[str]) -> str:
    """STALE is yellow — UNLESS this source opted into a freshness_sla and breached its own
    error_after_days, which is the source itself declaring the staleness unacceptable."""
    if result.get("name") in sla_errors:
        return "red"
    return _FRESHNESS_SEVERITY.get(result.get("status", ""), "yellow")


def volume_severity(entry: dict, result: dict) -> tuple[str, str]:
    """(status, severity). THE FALSE-GREEN RULE.

    check_volume_entry returns None for three INDISTINGUISHABLE reasons — no
    expected_rows_min (:365-367), a tier-1 lane (:369-371), or ANY DB error including a
    table that does not exist (:399-404, rollback-swallowed). Treating None as "n/a, green"
    would re-ship "green != data" inside the fix. So we disambiguate from the ENTRY."""
    vs = result.get("volume_status")
    if vs == "OK":
        return ("OK", "green")
    if vs == "LOW_VOLUME":
        return ("LOW_VOLUME", "red")

    lane = entry.get("lane", "")
    tier1 = lane in ("tier-1", "tier-1-duckdb")

    # A tier-1 entry the SPINE made COUNTABLE (count_table + expected_rows_min) is gated by
    # assert_landed.py, which counts count_table DIRECTLY and never calls check_volume_entry.
    # check_volume_entry returning None for it is that helper's TIER-1 EARLY RETURN
    # (check_freshness.py:369-371) -- NOT a missing count. Reding it here would fail the daily
    # probe every morning on a healthy source: a manufactured false-RED, which is the exact
    # alarm-fatigue this build exists to reverse. (city_pulse is this case.)
    if tier1 and entry.get("count_table") and entry.get("expected_rows_min") is not None:
        return ("GATED_BY_ASSERT_LANDED", "green")
    if tier1 and entry.get("nightly"):
        # nightly but genuinely NOT countable -> the gate really is unreachable. Say so.
        return ("UNRESOLVED", "red")
    if tier1:
        return ("NOT_APPLICABLE", "green")
    if entry.get("expected_rows_min") is None:
        return ("NO_FLOOR", "yellow")
    # Declared a floor, tier-2, and the count still came back None -> the count could not
    # be taken. Ghost table / missing table / query error. This is redfin_city_swfl.
    return ("UNRESOLVED", "red")


def content_severity(table: str | None, value_results: list[dict]) -> tuple[str, str, list[dict]]:
    """(status, severity, failing_tests). Only ~4 of ~74 datasets carry contracts today —
    NO_CONTRACT contributes GREEN and the coverage count in the header carries that fact.
    Yellowing 70 rows would flood the report and train the operator to ignore it."""
    mine = [r for r in value_results if r.get("table") == table] if table else []
    if not mine:
        return ("NO_CONTRACT", "green", [])
    fails = [r for r in mine if r.get("status") == "FAIL"]
    skips = [r for r in mine if r.get("status") == "SKIP"]
    if any(r.get("severity") == "error" for r in fails):
        return ("FAIL", "red", fails)
    if fails:
        return ("FAIL", "yellow", fails)
    if skips:
        return ("SKIP", "yellow", skips)
    return ("PASS", "green", [])


_RUN_SEVERITY = {
    "GREEN": "green",
    "IN_PROGRESS": "green",
    "CANCELLED": "yellow",
    "NO_RUNS_IN_WINDOW": "yellow",
    "RED": "red",
    "TIMEOUT": "red",
    "NEVER_RAN": "red",
}


def run_severity(summary: dict | None, gh_error: str | None) -> tuple[str, str]:
    """An unavailable domain is reported as UNAVAILABLE, never as healthy."""
    if summary is None:
        if gh_error:
            return ("GH_UNAVAILABLE", "yellow")
        return ("NO_WORKFLOW", "yellow")  # Spine gap: no `workflow:` field -> unjoinable
    status = summary.get("run_status", "")
    if status == "DISABLED":
        # Cron in SOURCE + disabled_manually at the API = a schedule nobody is running.
        # Correction #5: 4 workflows, 6 orphaned registry entries. Neither Phase-2 mode
        # can see this class; the manifest + gh state can.
        return ("DISABLED", "red" if summary.get("cron_in_source") else "yellow")
    return (status, _RUN_SEVERITY.get(status, "yellow"))


# ── prescription assignment ───────────────────────────────────────────────────

from ingest.lib import prescriptions as rx  # noqa: E402


def _rx(code: str, *, line: dict, evidence: str = "") -> dict:
    return {
        "code": code,
        "should_retry": rx.should_retry(code),
        "fix": rx.fix_text(
            code,
            workflow=line.get("workflow"),
            table=line.get("table"),
            pipeline=line.get("pipeline"),
            subject=line.get("workflow") or line.get("table") or line.get("dataset"),
        ),
        "evidence": evidence,
    }


def prescribe(line: dict) -> dict | None:
    """(observed signal shape) -> enum member. PURE. First match wins.

    Doctor can only assign DOCTOR_ASSIGNABLE — the six members its four signals can
    actually observe. ACTION_VERSION / SECRET_NOT_WIRED / SCHEMA_NAME_DRIFT come from
    Phase 2's check-registry-identity.mts at PR TIME (it fails the PR and writes no ledger
    row — nothing for doctor to see). WAF_BLOCK needs the failed run's LOG (the incident
    handler's surface). Anything else red and unclassifiable -> UNKNOWN WITH EVIDENCE.
    A red line never carries an invented diagnosis.

    Returns None for a green/yellow line, and None for a red whose ONLY red signal is
    content — a failing contract already names its table, column, test and failing-row
    count, which is a better diagnosis than any enum member we have. format_report
    enforces that every red line carries a prescription OR >=1 failing content test.
    """
    if line["health"] != "red":
        return None

    fresh = line["freshness"]
    vol = line["volume"]
    content = line["content"]
    run = line["run"]

    # 1 — a live table with rows and no registry entry at all.
    if line["kind"] == "coverage_only":
        return _rx(
            rx.ZERO_COVERAGE,
            line=line,
            evidence=f"{line['table']} has rows; ingest/cadence_registry.yaml has no entry for it.",
        )

    # 2 — the run burned its ceiling. NEVER retry (money guard).
    if run["status"] == "TIMEOUT":
        return _rx(
            rx.TIMEOUT_KILL,
            line=line,
            evidence=f"cancelled at >=95% of timeout-minutes; {run.get('url') or 'no run url'}",
        )

    # 3 — green run, no data. A dead vendor key returns an empty 200.
    if run["status"] == "GREEN" and (
        vol["status"] == "LOW_VOLUME" or vol.get("landed") == 0 or fresh["status"] == "MISSING"
    ):
        return _rx(
            rx.GAP_SENTINEL,
            line=line,
            evidence=f"last run succeeded ({run.get('url') or 'no url'}) but volume="
            f"{vol['status']} landed={vol.get('landed')} freshness={fresh['status']}",
        )

    # 4 — registry claims it, the DB does not have it.
    if fresh["status"] == "MISSING" or vol["status"] == "UNRESOLVED" or line["kind"] == "missing":
        return _rx(
            rx.NEVER_LANDED,
            line=line,
            evidence=f"freshness={fresh['status']} volume={vol['status']} "
            f"pg_class kind={line['kind']}",
        )

    # 5 — one or two failures is transient. Three is a class.
    if run["status"] == "RED" and run.get("consecutive_failures", 0) <= 2:
        return _rx(
            rx.TRANSIENT,
            line=line,
            evidence=f"{run.get('consecutive_failures')} consecutive failure(s); "
            f"{run.get('url') or 'no run url'}",
        )

    # 6 — red, and no class fits. SAY SO. Attach the evidence. Invent nothing.
    if run["severity"] == "red":
        if run["status"] == "DISABLED":
            ev = (
                f"workflow {line.get('workflow')} carries a cron in source but its state at the "
                f"GitHub API is disabled_manually — a schedule nobody is running. No enum member "
                f"covers this class yet (check doctor_rx_workflow_disabled_member)."
            )
        elif run["status"] == "NEVER_RAN":
            ev = (
                f"workflow {line.get('workflow')} has never run (confirmed by a targeted "
                f"`gh run list --workflow` backfill, not merely absent from the bulk window)."
            )
        else:
            ev = (
                f"{run.get('consecutive_failures')} consecutive failure(s), last conclusion="
                f"{run.get('last_conclusion')}; {run.get('url') or 'no run url'} — no class is "
                f"inferable from run metadata alone. Read the log."
            )
        return _rx(rx.UNKNOWN, line=line, evidence=ev)

    # 7 — the only red is content. The failing contract IS the diagnosis.
    if content["severity"] == "red":
        return None

    # 8 — red with no red signal is a bug in worst_of; say UNKNOWN rather than stay silent.
    return _rx(
        rx.UNKNOWN,
        line=line,
        evidence=f"line is red but no signal is red: freshness={fresh['status']} "
        f"volume={vol['status']} content={content['status']} run={run['status']}",
    )


# ── the join ──────────────────────────────────────────────────────────────────

from ingest.scripts.check_freshness import _slug  # noqa: E402

# public.checks keys that are TABLE-scoped (check_data_quality.py:51-52, plus Phase 1's
# contract prefix). Doctor READS these; it never writes them — check_data_quality owns
# quality_fail_/schema_drift_ and check_freshness owns corridor_gap_. A second writer
# would double-open every key.
_TABLE_CHECK_PREFIXES = ("quality_fail_", "schema_drift_", "contract_fail_")


def _checks_for_table(table: str | None, ledger_rows: list[dict]) -> list[str]:
    if not table:
        return []
    stems = tuple(p + _slug(table) for p in _TABLE_CHECK_PREFIXES)
    return sorted(r["check_key"] for r in ledger_rows if r["check_key"].startswith(stems))


def build_health_lines(
    *,
    registry: dict,
    pipeline_results: list[dict],
    view_results: list[dict],
    sla_errors: set[str],
    value_results: list[dict],
    ledger_rows: list[dict],
    gh_summaries: dict[str, dict],
    gh_error: str | None,
    manifest_by_file: dict[str, dict],
    relkinds: dict[str, str],
    quality_tables: list[str],
) -> list[dict]:
    """PURE. One health line per dataset = worst of {freshness, volume, content, run}.

    Two kinds of line:
      - a REGISTRY line, one per `pipelines:` entry (joined to its table, its contracts,
        its workflow's runs, its open ledger checks, and its view-liveness probe);
      - a COVERAGE_ONLY line, one per quality-registry table with NO registry entry —
        which is exactly how ZERO_COVERAGE surfaces (the parcel_subdivision class, and
        the ONLY way data_lake.listing_active_stats — a VIEW with no pipeline — gets a
        health line at all).
    """
    by_name = {r["name"]: r for r in pipeline_results}
    views_by_pipeline = {v["pipeline"]: v for v in view_results}
    lines: list[dict] = []
    covered_tables: set[str] = set()

    for entry in registry.get("pipelines", []) or []:
        name = entry["name"]
        result = by_name.get(name)
        if result is None:
            # run_probe's lane dispatch ends in `else: continue` (check_freshness.py:645-646),
            # silently dropping any entry that is neither tier-1 nor tier-2. A registry entry
            # with NO probe result is itself a finding, not a pass.
            result = {"name": name, "status": "MISSING", "age_days": None, "last_run": None,
                      "volume_status": None, "volume_landed": None, "volume_min": None}

        table = resolve_table(entry)
        if table:
            covered_tables.add(table)
        kind = kind_from_relkind(relkinds.get(table)) if table else entry.get("lane", "tier-1")

        f_sev = freshness_severity(result, sla_errors)
        v_status, v_sev = volume_severity(entry, result)
        c_status, c_sev, c_failing = content_severity(table, value_results)

        workflow = entry.get("workflow")
        summary = gh_summaries.get(workflow) if workflow else None
        r_status, r_sev = run_severity(summary, gh_error if workflow else None)

        view = views_by_pipeline.get(name)
        view_sev = "yellow" if (view and view["status"] != "VIEW_FRESH") else "green"

        line = {
            "dataset": name,
            "table": table,
            "kind": kind,
            "lane": entry.get("lane"),
            "workflow": workflow,
            "pipeline": name,
            "freshness": {"status": result["status"], "severity": f_sev,
                          "age_days": result.get("age_days"),
                          "last_run": str(result.get("last_run") or "") or None},
            "volume": {"status": v_status, "severity": v_sev,
                       "landed": result.get("volume_landed"), "min_rows": result.get("volume_min")},
            "content": {"status": c_status, "severity": c_sev, "failing": c_failing},
            "run": {
                "status": r_status,
                "severity": r_sev,
                "last_conclusion": (summary or {}).get("last_conclusion"),
                "last_success_at": (summary or {}).get("last_success_at"),
                "consecutive_failures": (summary or {}).get("consecutive_failures", 0),
                "url": (summary or {}).get("url"),
                "cron_in_source": (summary or {}).get("cron_in_source"),
            },
            "view": {"status": view["status"], "detail": view["detail"]} if view else None,
            "open_checks": _checks_for_table(table, ledger_rows),
        }
        line["health"] = worst_of(f_sev, v_sev, c_sev, r_sev, view_sev)
        line["prescription"] = prescribe(line)
        lines.append(line)

    # Coverage-only: a table the quality registry knows and the cadence registry does not.
    for table in sorted(set(quality_tables) - covered_tables):
        c_status, c_sev, c_failing = content_severity(table, value_results)
        line = {
            "dataset": table,
            "table": table,
            "kind": "view" if kind_from_relkind(relkinds.get(table)) == "view" else "coverage_only",
            "lane": None,
            "workflow": None,
            "pipeline": None,
            "freshness": {"status": "NO_REGISTRY_ENTRY", "severity": "yellow",
                          "age_days": None, "last_run": None},
            "volume": {"status": "NO_REGISTRY_ENTRY", "severity": "yellow",
                       "landed": None, "min_rows": None},
            "content": {"status": c_status, "severity": c_sev, "failing": c_failing},
            "run": {"status": "NO_WORKFLOW", "severity": "yellow", "last_conclusion": None,
                    "last_success_at": None, "consecutive_failures": 0, "url": None,
                    "cron_in_source": None},
            "view": None,
            "open_checks": _checks_for_table(table, ledger_rows),
        }
        # A VIEW with no pipeline (listing_active_stats) is NOT a coverage gap — it is
        # correctly registry-less, and Locus B is its only possible gate (spec §5). A base
        # TABLE with rows and no registry entry IS the ZERO_COVERAGE gap.
        if line["kind"] == "coverage_only":
            line["health"] = "red"
        else:
            line["health"] = worst_of(c_sev, "yellow")
        line["prescription"] = prescribe(line)
        lines.append(line)

    return lines
