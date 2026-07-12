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
