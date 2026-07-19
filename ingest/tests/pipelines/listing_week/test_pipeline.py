"""Orchestration tests with injected I/O (no DB, no psycopg)."""
from datetime import date

from ingest.pipelines.listing_week.pipeline import run
from ingest.tests.pipelines.listing_week.test_builder import HISTORY, STATE_ROW

FAKE_IO = {"load_state": lambda: [STATE_ROW], "load_transitions": lambda: HISTORY,
           "merge": lambda rows: len(rows), "label": lambda ups: len(ups)}

def test_weekly_run_builds_last_completed_week_and_labels_prior():
    # today Mon 07/20 -> build week 07/13 (just completed), label week 07/06.
    out = run(dry_run=False, today=date(2026, 7, 20), _io=FAKE_IO)
    assert out["weeks"] == [date(2026, 7, 13)]
    assert out["rows_merged"] == 1
    assert out["labels_applied"] == 1          # 07/06 labels from 07/13 events

def test_backfill_walks_all_weeks():
    out = run(dry_run=False, today=date(2026, 7, 20),
              backfill_from=date(2026, 6, 29), _io=FAKE_IO)
    assert out["weeks"] == [date(2026, 6, 29), date(2026, 7, 6), date(2026, 7, 13)]
    assert out["rows_merged"] == 3

def test_dry_run_writes_nothing():
    writes = []
    io = dict(FAKE_IO, merge=lambda rows: writes.append(rows) or 0,
              label=lambda ups: writes.append(ups) or 0)
    run(dry_run=True, today=date(2026, 7, 20), _io=io)
    assert writes == []

def test_zero_rows_on_real_run_raises():
    io = dict(FAKE_IO, load_state=lambda: [], load_transitions=lambda: [])
    try:
        run(dry_run=False, today=date(2026, 7, 20), _io=io)
        raise AssertionError("should have raised")
    except SystemExit as e:
        assert e.code == 1
