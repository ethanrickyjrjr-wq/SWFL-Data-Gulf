"""Landed-rows watchdog — does every declared table actually HAVE DATA?

WHY THIS EXISTS (08/12/2026). `collier_official_records` was built, tested,
committed, documented as live in four places, and celebrated -- with ZERO rows in
the database and no table at all. Every gate we own passed. The morning digest
said "Lake: live, fresh" the whole time, because it asks whether the API answers,
not whether a given table has rows.

`ingest/scripts/assert_landed.py` already does this check properly -- but it is
OPT-IN via `nightly: true`, and only 5 entries opt in while 19 declare a
`count_table`. Fourteen countable pipelines sit outside it. This watchdog is the
OBSERVABILITY half for everything assert_landed does not gate: it never blocks a
push and never fails a build; it just refuses to let an empty table stay quiet.

Reports, per entry that declares a `count_table`:
  MISSING   the table does not exist at all          <- the Collier case
  EMPTY     the table exists and holds 0 rows
  LOW       count(*) < expected_rows_min (when declared)

`parked: true` entries are still reported but tagged [parked] -- a parked source
with an empty table is expected, not an alarm.

Zero LLM tokens. Read-only. Exit code is ALWAYS 0 -- this is a watchdog, not a
gate. Silent (no stdout) when everything has data, so it can back a cron that
only speaks when something is wrong.

Run:  ingest/.venv/Scripts/python.exe -m ingest.scripts.landed_watch [--all]
      --all  also print the healthy entries (default: only problems)
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import psycopg
import yaml


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def conninfo() -> str:
    """Credentials from .dlt/secrets.toml — the same source every ingest job uses."""
    import os

    env = os.environ.get("DESTINATION__POSTGRES__CREDENTIALS")
    if env:
        return env
    text = (repo_root() / ".dlt" / "secrets.toml").read_text(encoding="utf-8")

    def grab(key: str) -> str:
        m = re.search(rf'^\s*{key}\s*=\s*"?([^"\n]+)"?\s*$', text, re.M)
        if not m:
            raise RuntimeError(f".dlt/secrets.toml: missing {key}")
        return m.group(1).strip()

    return (
        f"host={grab('host')} port={grab('port')} dbname={grab('database')} "
        f"user={grab('username')} password={grab('password')}"
    )


def declared_tables() -> tuple[list[dict], list[str]]:
    """Every registry entry that names a table under ANY field, plus the names of
    the entries that name none.

    `count_table` is the explicit declaration, but only 18 of 73 entries carry one.
    A further 26 name a `freshness_table` — an equally real table, just declared for
    a different purpose. Checking BOTH is free and takes coverage from 25% to ~60%
    of the fleet. `expected_rows_min` only applies to a count_table (a
    freshness_table has no declared floor), so a freshness-only entry is checked
    for MISSING/EMPTY, never LOW.

    The returned second list is the entries that declare NO table at all — those
    are invisible to this watchdog and no amount of querying fixes that; someone
    has to say which table they write.
    """
    reg = yaml.safe_load((repo_root() / "ingest" / "cadence_registry.yaml").read_text(encoding="utf-8"))
    out: list[dict] = []
    undeclared: list[str] = []
    for section in ("pipelines", "not_yet_running"):
        for entry in reg.get(section) or []:
            table = entry.get("count_table")
            source_field = "count_table"
            if not table:
                table = entry.get("freshness_table")
                source_field = "freshness_table"
            if not table:
                undeclared.append(entry.get("name", "?"))
                continue
            out.append(
                {
                    "name": entry.get("name", "?"),
                    "table": table,
                    # A freshness_table has no declared row floor — never fake one.
                    "floor": entry.get("expected_rows_min") if source_field == "count_table" else None,
                    "parked": bool(entry.get("parked")),
                    "gated": bool(entry.get("nightly")),
                    "via": source_field,
                    "section": section,
                }
            )
    return out, undeclared


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--all", action="store_true", help="also print healthy entries")
    args = ap.parse_args(argv)

    entries, undeclared = declared_tables()
    # Two entries can legitimately name the same table (e.g. several CRE feeds all
    # land in marketbeat_swfl). Report the table once, naming every claimant.
    seen: dict[str, list[str]] = {}
    deduped: list[dict] = []
    for e in entries:
        if e["table"] in seen:
            seen[e["table"]].append(e["name"])
            continue
        seen[e["table"]] = [e["name"]]
        deduped.append(e)
    entries = deduped
    problems: list[str] = []
    healthy: list[str] = []
    ungated = 0

    with psycopg.connect(conninfo(), sslmode="require", connect_timeout=20) as conn:
        for e in entries:
            if not e["gated"]:
                ungated += 1
            schema, _, name = e["table"].partition(".")
            if not name:
                schema, name = "public", schema
            tag = " [parked]" if e["parked"] else ""
            gate = "" if e["gated"] else " [ungated]"

            with conn.cursor() as cur:
                cur.execute(
                    "select 1 from information_schema.tables "
                    "where table_schema=%s and table_name=%s",
                    (schema, name),
                )
                if cur.fetchone() is None:
                    problems.append(f"  MISSING  {e['name']}{tag}{gate} — {e['table']} does not exist")
                    continue
                # Identifiers cannot be parameterized; they come from our own
                # committed registry, and both halves are validated below.
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", schema) or not re.fullmatch(
                    r"[A-Za-z_][A-Za-z0-9_]*", name
                ):
                    problems.append(f"  SKIPPED  {e['name']} — unsafe table identifier {e['table']!r}")
                    continue
                cur.execute(f'select count(*) from "{schema}"."{name}"')  # noqa: S608
                rows = cur.fetchone()[0]

            floor = e["floor"]
            if rows == 0:
                problems.append(f"  EMPTY    {e['name']}{tag}{gate} — {e['table']} has 0 rows")
            elif floor is not None and rows < floor:
                problems.append(
                    f"  LOW      {e['name']}{tag}{gate} — {e['table']} {rows:,} rows, floor {floor:,}"
                )
            else:
                healthy.append(f"  ok       {e['name']}{tag}{gate} — {e['table']} {rows:,} rows")

    if problems:
        print(f"🪣 Declared tables with no data ({len(problems)} of {len(entries)}):")
        for line in problems:
            print(line)
        print(
            f"  — {ungated} of {len(entries)} entries are [ungated] "
            f"(no `nightly: true`, so assert_landed never checks them)."
        )
    # ── Sweep the lake itself ────────────────────────────────────────────────
    # The registry is a DECLARATION and 27 entries declare nothing. The database
    # is not a declaration — it is the fact. Every table that exists gets counted
    # whether or not a human ever wrote it down, so a pipeline can never be
    # invisible just because its registry line is thin.
    claimed = {e["table"] for e in entries}
    lake_empty: list[str] = []
    lake_total = 0
    with psycopg.connect(conninfo(), sslmode="require", connect_timeout=20) as conn:
        with conn.cursor() as cur:
            # data_lake ONLY. `public` holds APP tables (email_events, social_posts,
            # user_listings...) which are legitimately empty until the product has
            # users — sweeping them produced 37 false alarms against 2 real ones and
            # would train the reader to ignore this whole report. Alert fatigue is
            # the documented reason gha_red_watch grew a 24h cooldown; do not
            # re-create it here.
            cur.execute(
                "select table_schema, table_name from information_schema.tables "
                "where table_schema = 'data_lake' and table_type='BASE TABLE' "
                "and table_name not like '\\_dlt%' order by 1,2"
            )
            all_tables = cur.fetchall()
        for schema, name in all_tables:
            fq = f"{schema}.{name}"
            if fq in claimed:
                continue
            lake_total += 1
            with conn.cursor() as cur:
                cur.execute(f'select count(*) from "{schema}"."{name}"')  # noqa: S608
                if cur.fetchone()[0] == 0:
                    lake_empty.append(fq)

    if lake_empty:
        print(
            f"\n🫙 {len(lake_empty)} table(s) in the lake hold 0 rows and no registry entry "
            f"claims them (swept {lake_total} unclaimed tables):"
        )
        for fq in lake_empty:
            print(f"  EMPTY    {fq}")

    if undeclared:
        print(
            f"\n📝 {len(undeclared)} pipeline(s) declare no table in the registry. Their data is "
            f"still covered by the lake sweep above — this is a bookkeeping gap, not a blind spot:"
        )
        print("  " + ", ".join(sorted(undeclared)))
    if args.all:
        if healthy:
            print(f"\nHealthy ({len(healthy)}):" if problems else f"Healthy ({len(healthy)}):")
            for line in healthy:
                print(line)
        if not problems:
            print(f"\nAll {len(entries)} declared tables hold data.")

    return 0  # watchdog, never a gate


if __name__ == "__main__":
    sys.exit(main())
