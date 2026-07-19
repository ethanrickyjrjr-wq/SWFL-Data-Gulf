"""Weekly person-period panel builder for the sell-odds model (Phase 0).

Steady state (weekly cron, Monday): build rows for the just-completed week
(features frozen at its Sunday), then fill labels for the week before it from
the events the completed week revealed. Backfill replays every week from
--backfill-from (2026-06-29 = first Monday of tracker history) to now.

Run:
  python -m ingest.pipelines.listing_week.pipeline [--dry-run] [--backfill-from YYYY-MM-DD]
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta

from ingest.pipelines.listing_week.builder import (
    build_week_rows, label_updates, week_start_of,
)

TRACKER_EPOCH = date(2026, 6, 29)  # first Monday on/after tracker start 06/27/2026


def run(*, dry_run: bool = False, backfill_from: date | None = None,
        today: date | None = None, _io: dict | None = None) -> dict:
    today = today or date.today()
    last_completed = week_start_of(today) - timedelta(days=7)
    first = backfill_from or last_completed
    if first < TRACKER_EPOCH:
        first = TRACKER_EPOCH

    if _io is None:
        from ingest.pipelines.listing_week import db
        conn = db.get_conn()
        _io = {"load_state": lambda: db.load_sale_state(conn),
               "load_transitions": lambda: db.load_transitions(conn),
               "merge": lambda rows: db.merge_week_rows(conn, rows),
               "label": lambda ups: db.apply_label_updates(conn, ups)}

    state = _io["load_state"]()
    transitions = _io["load_transitions"]()

    weeks, rows_merged, labels_applied = [], 0, 0
    w = first
    while w <= last_completed:
        weeks.append(w)
        rows = build_week_rows(state, transitions, w)
        ups = label_updates(transitions, w - timedelta(days=7))
        print(f"[listing-week] {w}: {len(rows)} rows, {len(ups)} label fills"
              + (" (dry-run)" if dry_run else ""), flush=True)
        if not dry_run:
            rows_merged += _io["merge"](rows)
            labels_applied += _io["label"](ups)
        w += timedelta(days=7)

    if not dry_run and rows_merged == 0:
        print("[listing-week] FATAL: 0 rows merged on a real run — refusing to "
              "report success (empty listing_state/transitions read?)", flush=True)
        sys.exit(1)
    return {"weeks": weeks, "rows_merged": rows_merged,
            "labels_applied": labels_applied}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--backfill-from", type=date.fromisoformat, default=None)
    a = p.parse_args()
    run(dry_run=a.dry_run, backfill_from=a.backfill_from)
