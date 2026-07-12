"""Nightly row gate — the ordered chain's data-landed assertion.

CONTRACT (spec §8). For every `nightly: true` cadence-registry entry:
  1. FRESHNESS  last_run == today (UTC)
  2. VOLUME     count(*) >= expected_rows_min   — whenever the entry has a COUNTABLE TABLE
Any STALE / LOW_ROWS / UNRESOLVED -> name it -> exit 1 -> the chain skips the
rebuild rather than rebuilding 42 brains on yesterday's data.

This INVERTS the two probes' "always exit 0 / observability, never gate"
invariant (check_freshness.py:30-31, check_data_quality.py:21-22). It is a GATE.

WHY IT DOES NOT REUSE check_volume_entry (08f §5, drifts 2-3):
  * it early-returns None for every tier-1 lane -> city_pulse is unreachable;
  * it cannot scope a count to one metric_key -> the two live_search_* entries
    that share data_lake.daily_truth MASK each other (if mortgage never ran
    again, both entries still read fresh off median_price's daily write);
  * its pass/fail keys off the LOOSE observability floor — it never fails a run.
So this module owns _count_rows() and reads the gate's own Spine fields.

WHY IT DOES NOT REUSE check_tier2_entry()["status"] (08f §5 step 1): that status
is FRESH while age_days <= cadence_days * tolerance_multiplier — 1 x 3.0 = THREE
DAYS for a daily source. A source that last landed two days ago would sail
through a NIGHTLY gate. Reusing it rebuilds "green != data" inside the fix. We
take only the last_run VALUE and apply our own `== today_utc`.

Run: python -m ingest.scripts.assert_landed [--dry-run]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg import sql

from ingest.scripts.check_freshness import (
    _fetch_max_freshness,
    _get_connection,
    check_tier1_entry,
    load_registry,
)

REGISTRY_PATH = Path(__file__).parent.parent / "cadence_registry.yaml"

EXIT_OK = 0
EXIT_RED = 1


def utc_today() -> date:
    """The gate's day. UTC — NEVER date.today(), which is what check_freshness.py
    (:337, :431) uses. Those coincide on a GHA runner (TZ=UTC) and diverge on the
    operator's EDT laptop. (08f drift 4)"""
    return datetime.now(timezone.utc).date()


def nightly_entries(registry: dict[str, Any]) -> list[dict[str, Any]]:
    """Every `pipelines:` entry the Spine marks `nightly: true`.

    `not_yet_running:` is deliberately NOT scanned — a parked pipeline must never
    be able to red the chain."""
    return [e for e in (registry.get("pipelines") or []) if e.get("nightly") is True]


def _last_run(conn, entry: dict[str, Any]) -> date | None:
    """The entry's last landed day, lane-aware. Reuses the probe's resolvers for
    the VALUE ONLY — never their `status` (see module docstring)."""
    if entry.get("lane") == "tier-1":
        return check_tier1_entry(conn, entry).get("last_run")
    return _fetch_max_freshness(conn, entry)


def _count_rows(conn, entry: dict[str, Any]) -> int | None:
    """count for one entry, scoped by source_name AND the optional count_filter.

    Table resolution mirrors check_volume_entry (check_freshness.py:373-377):
        count_table -> freshness_table -> data_lake.<dlt_schema_name>

    `count_filter: {column: metric_key, value: median_asking_price}` is the Spine
    field that unmasks the two live_search entries sharing data_lake.daily_truth.

    `count_nonnull: <column>` switches count(*) to count(<column>) — an OUTCOME
    floor, not an effort floor. WHY (07/12/2026): the retired median_sale_price
    metric wrote 3 value=NULL rows every night for 19 straight days and this gate
    read LANDED throughout, because NULL rows are still rows. A feed whose declared
    value column is all-NULL now goes LOW_ROWS instead of green.

    Returns None — NEVER 0 — on an unresolvable table or ANY DB error. A silently
    absent table must be UNRESOLVED (red), not "0 rows" and not "not applicable".
    """
    table = (
        entry.get("count_table")
        or entry.get("freshness_table")
        or (f"data_lake.{entry['dlt_schema_name']}" if entry.get("dlt_schema_name") else None)
    )
    if not table or "." not in table:
        return None
    schema, _, name = table.partition(".")

    clauses: list[sql.Composable] = []
    params: list[Any] = []
    if entry.get("source_name"):
        clauses.append(sql.SQL("source_name = %s"))
        params.append(entry["source_name"])
    cf = entry.get("count_filter") or {}
    if cf.get("column") and cf.get("value") is not None:
        clauses.append(sql.SQL("{} = %s").format(sql.Identifier(cf["column"])))
        params.append(cf["value"])

    nonnull_col = entry.get("count_nonnull")
    count_expr = (
        sql.SQL("count({})").format(sql.Identifier(nonnull_col))
        if nonnull_col
        else sql.SQL("count(*)")
    )
    query = sql.SQL("SELECT {} FROM {}.{}").format(
        count_expr, sql.Identifier(schema), sql.Identifier(name)
    )
    if clauses:
        query = query + sql.SQL(" WHERE ") + sql.SQL(" AND ").join(clauses)

    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            row = cur.fetchone()
        return int(row[0]) if row else None
    except psycopg.Error:
        conn.rollback()  # a failed statement poisons the txn for every later probe
        return None


def _result(entry, name, last_run, landed, floor, status, detail) -> dict[str, Any]:
    return {
        "name": name,
        "last_run": last_run,
        "landed": landed,
        "expected_rows_min": floor,
        "status": status,
        "detail": detail,
    }


def assert_landed(
    conn, registry: dict[str, Any], today: date | None = None
) -> list[dict[str, Any]]:
    """One result per `nightly: true` entry.
    status: LANDED | STALE | LOW_ROWS | UNRESOLVED"""
    today = today or utc_today()
    results: list[dict[str, Any]] = []

    for entry in nightly_entries(registry):
        name = entry.get("name", "<unnamed>")
        floor = entry.get("expected_rows_min")
        last_run = _last_run(conn, entry)

        if last_run is None:
            results.append(
                _result(entry, name, None, None, floor, "UNRESOLVED",
                        "no freshness value resolved (missing table? ghost entry?)")
            )
            continue

        if last_run != today:
            results.append(
                _result(entry, name, last_run, None, floor, "STALE",
                        f"last landed {last_run}, expected {today} (UTC)")
            )
            continue

        # The VOLUME half opts out on ABSENCE OF A COUNTABLE TABLE — never on an
        # absent floor. `expected_rows_min` exists on nearly every entry, so
        # "no floor" is NOT inferable as "don't count me" (that reversion is how the
        # gate silently counted zero rows while CI stayed green).
        target = entry.get("count_table") or entry.get("freshness_table")
        if not target:
            results.append(
                _result(entry, name, last_run, None, floor, "LANDED",
                        "freshness-only (no countable table)")
            )
            continue
        if floor is None:
            results.append(
                _result(entry, name, last_run, None, None, "UNRESOLVED",
                        "countable table but no expected_rows_min floor")
            )
            continue

        landed = _count_rows(conn, entry)
        if landed is None:
            results.append(
                _result(entry, name, last_run, None, floor, "UNRESOLVED",
                        "floor declared but count(*) did not resolve — missing/ghost table?")
            )
        elif landed < floor:
            results.append(
                _result(entry, name, last_run, landed, floor, "LOW_ROWS",
                        f"{landed} rows < floor {floor}")
            )
        else:
            results.append(
                _result(entry, name, last_run, landed, floor, "LANDED",
                        f"{landed} rows >= floor {floor}")
            )

    return results


_ICON = {"LANDED": "✅", "STALE": "❌", "LOW_ROWS": "❌", "UNRESOLVED": "❌"}


def format_results(results: list[dict[str, Any]]) -> str:
    lines = ["## Nightly row gate (assert_landed)", ""]
    for r in results:
        lines.append(
            f"{_ICON.get(r['status'], '❓')} `{r['name']}` — **{r['status']}** — {r['detail']}"
        )
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Nightly row gate: assert every `nightly: true` source landed TODAY (UTC)."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report only — always exit 0, never gate the chain. Ship with this first (spec §15 step 6).",
    )
    args = parser.parse_args(argv)

    # GHA runners are UTF-8; a Windows dev console is cp1252, which cannot encode
    # the ✅/❌ report icons. Reconfigure rather than crash — the report matters
    # more than the glyphs.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    registry = load_registry(REGISTRY_PATH)
    with _get_connection() as conn:
        results = assert_landed(conn, registry)

    print(format_results(results))

    if not results:
        print(
            "::error::assert_landed found ZERO `nightly: true` entries. The Spine is not wired — "
            "a gate that gates nothing is a green light.",
            file=sys.stderr,
        )
        return EXIT_OK if args.dry_run else EXIT_RED

    bad = [r for r in results if r["status"] != "LANDED"]
    if not bad:
        print(f"All {len(results)} nightly sources landed for {utc_today()} (UTC).")
        return EXIT_OK

    for r in bad:
        print(f"::error::{r['name']} — {r['status']}: {r['detail']}", file=sys.stderr)
    if args.dry_run:
        print(f"--dry-run: {len(bad)} source(s) would have RED-ed the chain. Reporting only.")
        return EXIT_OK
    return EXIT_RED


if __name__ == "__main__":
    sys.exit(main())
