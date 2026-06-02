"""Rebuild gate — decides whether a brain rebuild is actually warranted.

The daily-rebuild cron currently re-renders the whole brain DAG every night,
even though most sources publish monthly (FRED labor) or annually (Census CBP,
FDOT, LeePA). A nightly rebuild of data that changed a month ago burns ~20 min
of LLM triage to stamp a new freshness token on byte-identical numbers. The
source citation already carries `verified` / `expires` dates, so the token does
not need to rotate nightly.

This gate answers one question: **has any registered source ingested data more
recently than the brains were last built?**

  - YES  -> exit 0  ("rebuild needed"); prints which sources are newer.
  - NO   -> exit 10 ("nothing due, skip"); the cron skips the rebuild.
  - error/unknown -> exit 0 (FAIL OPEN — rebuild rather than risk freezing
    brains forever on a transient DB or parse error).

It reuses ingest/scripts/check_freshness.py for the per-source last-ingest
timestamps and ingest/cadence_registry.yaml for the active pipeline list, so
there are no hand-rolled SQL queries here to drift from the probe.

"Last build" = the OLDEST `refined_at` across brains/*.md. Using the minimum
(not the maximum) is deliberate: a single manually-rebuilt pack must not make
the whole system look freshly built. If the oldest brain predates a source's
latest ingest, that brain is behind and a rebuild is due. This biases toward
rebuilding (safe) and never wrongly skips.

Wiring (do NOT apply here — daily-rebuild.yml is owned by the Phase 7 work).
Once Phase 7 lands, gate the rebuild step like this:

    - name: Decide whether a rebuild is due
      id: gate
      run: |
        if python ingest/scripts/rebuild_due.py; then
          echo "run=true" >> "$GITHUB_OUTPUT"
        else
          echo "run=false" >> "$GITHUB_OUTPUT"
        fi
    - name: Run refinery
      if: steps.gate.outputs.run == 'true'
      run: bun refinery/cli.mts master

The gate also writes `rebuild_needed=true|false` to $GITHUB_OUTPUT when present,
so a workflow can branch on the step output instead of the exit code.

Usage:
    python ingest/scripts/rebuild_due.py            # gate (exit 0 / 10)
    python ingest/scripts/rebuild_due.py --explain  # always exit 0; print decision only
"""
import argparse
import os
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path

# Reuse the probe's connection + registry + per-source freshness logic.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_freshness import (  # noqa: E402
    _get_connection,
    check_tier1_entry,
    check_tier2_entry,
    load_registry,
)

EXIT_REBUILD = 0   # a source is newer than the last build, or we can't tell (fail-open)
EXIT_SKIP = 10     # nothing ingested since the last build — skip the rebuild

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
BRAINS_DIR = REPO_ROOT / "brains"
REGISTRY_PATH = Path(__file__).resolve().parent.parent / "cadence_registry.yaml"

_REFINED_AT_RE = re.compile(r"^refined_at:\s*(\S+)\s*$", re.MULTILINE)


def _parse_iso_date(raw: str) -> date | None:
    """Parse an ISO timestamp like 2026-06-02T04:44:08Z into a UTC date."""
    raw = raw.strip().strip("'\"")
    if raw.endswith("Z"):
        raw = raw[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date()


def last_build_date() -> date | None:
    """Oldest refined_at across brains/*.md — the floor of when the system was last built."""
    if not BRAINS_DIR.is_dir():
        return None
    dates: list[date] = []
    for md in BRAINS_DIR.glob("*.md"):
        # The frontmatter is at the top of the file; read a small head, not the whole brain.
        head = md.read_text(encoding="utf-8", errors="replace")[:4000]
        m = _REFINED_AT_RE.search(head)
        if not m:
            continue
        d = _parse_iso_date(m.group(1))
        if d is not None:
            dates.append(d)
    return min(dates) if dates else None


def newest_source_ingest(conn, registry: dict) -> tuple[date | None, list[tuple[str, date]]]:
    """Return (newest ingest date across active pipelines, per-source (name, last_run) list)."""
    per_source: list[tuple[str, date]] = []
    for entry in registry.get("pipelines", []):
        lane = entry.get("lane", "")
        try:
            if lane in ("tier-1", "tier-1-duckdb"):
                r = check_tier1_entry(conn, entry)
            elif lane == "tier-2":
                r = check_tier2_entry(conn, entry)
            else:
                continue
        except Exception as exc:  # one bad pipeline must not blind the whole gate
            print(f"  ! {entry.get('name', '?')}: freshness query failed ({exc})", file=sys.stderr)
            continue
        if r.get("last_run") is not None:
            per_source.append((r["name"], r["last_run"]))
    newest = max((d for _, d in per_source), default=None)
    return newest, per_source


def decide() -> int:
    built = last_build_date()
    if built is None:
        print("Could not read any brains/*.md refined_at — FAIL OPEN, rebuild.", file=sys.stderr)
        return EXIT_REBUILD

    registry = load_registry(REGISTRY_PATH)
    conn = _get_connection()
    try:
        newest, per_source = newest_source_ingest(conn, registry)
    finally:
        conn.close()

    if newest is None:
        print("No source ingest timestamps found — FAIL OPEN, rebuild.", file=sys.stderr)
        return EXIT_REBUILD

    print(f"Last brain build (oldest refined_at): {built}")
    print(f"Newest source ingest:                 {newest}")

    fresher = sorted(
        ((name, d) for name, d in per_source if d > built),
        key=lambda x: x[1],
        reverse=True,
    )
    if fresher:
        print(f"\nREBUILD - {len(fresher)} source(s) ingested since the last build:")
        for name, d in fresher:
            print(f"  - {name}: {d}")
        return EXIT_REBUILD

    print("\nSKIP - no source has new data since the last build.")
    print("(Provenance dates already live in each brain's source citation; "
          "re-rendering would only restamp identical numbers.)")
    return EXIT_SKIP


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Decide whether a brain rebuild is due.")
    parser.add_argument(
        "--explain",
        action="store_true",
        help="Always exit 0; print the decision without gating (for inspection).",
    )
    args = parser.parse_args(argv)

    try:
        code = decide()
    except Exception as exc:  # any unexpected failure -> fail open (rebuild), never freeze
        print(f"Gate error ({exc}) — FAIL OPEN, rebuild.", file=sys.stderr)
        code = EXIT_REBUILD

    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a", encoding="utf-8") as fh:
            fh.write(f"rebuild_needed={'true' if code == EXIT_REBUILD else 'false'}\n")

    if args.explain:
        return 0
    return code


if __name__ == "__main__":
    sys.exit(main())
