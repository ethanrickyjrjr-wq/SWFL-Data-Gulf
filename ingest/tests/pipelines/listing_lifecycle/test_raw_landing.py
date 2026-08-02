"""Tests for the SteadyAPI raw-body landing (08/02/2026 playbook, Step 1c/1d) — no live DB.

Two things under test:
  • distill.insert_raw_bodies — the writer, UPSERT idempotency on property_id.
  • backfill_listed_date._write_raw_bodies_with_isolation — a raw-body write failure must never
    abort the run or block the listed_date write (the two are independent writes per chunk).
"""
from __future__ import annotations

from ingest.pipelines.listing_lifecycle import distill


class _FakeCursor:
    def __init__(self, sink):
        self._sink = sink

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def executemany(self, sql, params):
        self._sink.setdefault("calls", []).append({"sql": sql, "params": list(params)})


class _FakeConn:
    def __init__(self, sink):
        self._sink = sink

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return _FakeCursor(self._sink)

    def commit(self):
        pass


def test_insert_raw_bodies_upsert_sql_on_conflict_property_id(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(distill, "_get_conn", lambda: _FakeConn(sink))
    rows = [
        {"property_id": "P1", "address_key": "1 MAIN ST:33901", "county": "Lee", "body": {"a": 1}},
    ]
    n = distill.insert_raw_bodies(rows)
    assert n == 1
    call = sink["calls"][0]
    assert "ON CONFLICT (property_id) DO UPDATE" in call["sql"]
    assert "body = EXCLUDED.body" in call["sql"]
    assert "address_key = EXCLUDED.address_key" in call["sql"]
    assert "county = EXCLUDED.county" in call["sql"]
    assert "fetched_at = EXCLUDED.fetched_at" in call["sql"]
    assert call["params"][0]["property_id"] == "P1"


def test_insert_raw_bodies_second_write_targets_same_property_id(monkeypatch):
    # Two probes of the SAME property (a re-probe) target the identical primary key — ON CONFLICT DO
    # UPDATE is what turns that into "one row, second body wins" at the DB layer (proven by the SQL
    # shape in the test above); this proves the writer routes a re-probe through the same key.
    sink: dict = {}
    monkeypatch.setattr(distill, "_get_conn", lambda: _FakeConn(sink))
    distill.insert_raw_bodies([{"property_id": "P1", "address_key": "A", "county": "Lee", "body": {"v": 1}}])
    distill.insert_raw_bodies([{"property_id": "P1", "address_key": "A", "county": "Lee", "body": {"v": 2}}])
    assert len(sink["calls"]) == 2
    assert sink["calls"][0]["params"][0]["property_id"] == "P1"
    assert sink["calls"][1]["params"][0]["property_id"] == "P1"
    assert sink["calls"][1]["params"][0]["body"].obj == {"v": 2}  # Jsonb wrapper — .obj is the payload


def test_insert_raw_bodies_empty_is_noop(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(distill, "_get_conn", lambda: _FakeConn(sink))
    n = distill.insert_raw_bodies([])
    assert n == 0
    assert "calls" not in sink


def test_insert_raw_bodies_dry_run_writes_nothing():
    n = distill.insert_raw_bodies(
        [{"property_id": "P1", "address_key": "A", "county": "Lee", "body": {"v": 1}}], dry_run=True
    )
    assert n == 1  # reports what WOULD be written


# ------------------------------------------------------ backfill raw-write isolation (Step 1d guard)

def test_write_raw_bodies_with_isolation_swallows_failure_and_logs(monkeypatch, capsys):
    from ingest.pipelines.listing_lifecycle import backfill_listed_date as B

    def boom(rows, *, dry_run=False):
        raise RuntimeError("simulated raw-write failure")

    monkeypatch.setattr(B.distill, "insert_raw_bodies", boom)
    bodies = [{"property_id": "P1", "address_key": "A", "county": "Lee", "body": {"v": 1}}]

    # Must NOT raise — a raw-write failure is logged and swallowed, never propagated to the run loop.
    B._write_raw_bodies_with_isolation(bodies)
    assert "raw" in capsys.readouterr().out.lower()


def test_write_raw_bodies_with_isolation_writes_on_success(monkeypatch):
    from ingest.pipelines.listing_lifecycle import backfill_listed_date as B

    calls: list = []
    monkeypatch.setattr(B.distill, "insert_raw_bodies", lambda rows, **kw: (calls.append(rows), len(rows))[1])
    bodies = [{"property_id": "P1", "address_key": "A", "county": "Lee", "body": {"v": 1}}]
    B._write_raw_bodies_with_isolation(bodies)
    assert calls == [bodies]


def test_write_raw_bodies_with_isolation_empty_is_noop(monkeypatch):
    from ingest.pipelines.listing_lifecycle import backfill_listed_date as B

    calls: list = []
    monkeypatch.setattr(B.distill, "insert_raw_bodies", lambda rows, **kw: calls.append(rows))
    B._write_raw_bodies_with_isolation([])
    assert calls == []  # never calls the writer on an empty batch


def test_run_chunk_writes_listed_date_even_when_raw_write_fails(monkeypatch):
    """End-to-end guard: a raw-body write failure inside run()'s chunk loop must not prevent
    update_listed_date from committing — the two writes are independent per the playbook's
    failure-modes table ('Raw write failure kills a 5-hour run')."""
    from ingest.pipelines.listing_lifecycle import backfill_listed_date as B

    target = {
        "address_key": "1 MAIN ST:33901", "sale_or_rent": "sale", "property_id": "P1",
        "zip_code": "33901", "county": "Lee", "first_seen": "2026-01-01",
    }
    monkeypatch.setattr(B, "select_targets", lambda **kw: [target])
    monkeypatch.setattr(B, "remaining_count", lambda **kw: 0)
    monkeypatch.setattr(
        B, "fetch_sold_event_raw",
        lambda pid, *, since, at, key=None: (
            {"outcome": "holding", "listed_date": "2026-02-01"}, {"meta": {}, "body": {}},
        ),
    )
    monkeypatch.setattr(B.distill, "insert_raw_bodies", lambda rows, **kw: (_ for _ in ()).throw(RuntimeError("boom")))

    written: list = []
    monkeypatch.setattr(
        B.distill, "update_listed_date",
        lambda updates, *, source_name=None, dry_run=False: (written.extend(updates), len(updates))[1],
    )

    result = B.run(dry_run=False, limit=1)

    assert written and written[0]["listed_date"] == "2026-02-01"
    assert result["wrote"] == 1
