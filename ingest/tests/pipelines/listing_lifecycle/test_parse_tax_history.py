"""Tests for family B of SteadyAPI Step 3 (08/03/2026 spec) — parsing
data_lake.steadyapi_property_history_raw's tax_history[] into the typed
data_lake.steadyapi_tax_history table. Zero paid calls; no live DB in these tests.

Design: docs/superpowers/specs/2026-08-03-steadyapi-tax-history-design.md
Mirrors test_parse_listing_events.py's pattern (family A).
"""
from __future__ import annotations

import pytest

from ingest.pipelines.listing_lifecycle import parse_tax_history as P


def test_parse_sql_reads_nested_envelope_path():
    # Same envelope trap as family A: the array lives at body->'body'->'tax_history', not
    # top-level.
    assert "body->'body'->'tax_history'" in P.PARSE_SQL
    assert "body->'tax_history'" not in P.PARSE_SQL.replace("body->'body'->'tax_history'", "")


def test_parse_sql_guards_array_typeof():
    assert "jsonb_typeof" in P.PARSE_SQL
    assert "'array'" in P.PARSE_SQL


def test_parse_sql_truncates_before_insert():
    trunc_idx = P.PARSE_SQL.upper().index("TRUNCATE")
    insert_idx = P.PARSE_SQL.upper().index("INSERT")
    assert trunc_idx < insert_idx


def test_parse_sql_reads_assessment_and_market_value_subobjects():
    assert "'assessment'->>'total'" in P.PARSE_SQL
    assert "'assessment'->>'building'" in P.PARSE_SQL
    assert "'assessment'->>'land'" in P.PARSE_SQL
    assert "'market_value'->>'total'" in P.PARSE_SQL
    assert "'market_value'->>'building'" in P.PARSE_SQL
    assert "'market_value'->>'land'" in P.PARSE_SQL


class _FakeCursor:
    def __init__(self, sink, floor, post_count):
        self._sink = sink
        self._floor = floor
        self._post_count = post_count

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=None):
        self._sink.setdefault("calls", []).append(sql.strip().split("\n")[0].strip())

    def fetchone(self):
        calls = self._sink.get("calls", [])
        last = calls[-1] if calls else ""
        if last.upper().startswith("SELECT SUM") or "jsonb_array_length" in last:
            return (self._floor,)
        if last.upper().startswith("SELECT COUNT"):
            return (self._post_count,)
        return (None,)


class _FakeConn:
    def __init__(self, sink, floor, post_count):
        self._sink = sink
        self._floor = floor
        self._post_count = post_count

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return _FakeCursor(self._sink, self._floor, self._post_count)

    def commit(self):
        self._sink.setdefault("commits", 0)
        self._sink["commits"] += 1


def test_run_parse_computes_floor_before_truncate_insert(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(P, "_get_conn", lambda: _FakeConn(sink, floor=273051, post_count=273051))
    P.run_parse(dry_run=False)
    calls = sink["calls"]
    floor_idx = next(i for i, c in enumerate(calls) if "jsonb_array_length" in c.lower() or "SUM" in c.upper())
    truncate_idx = next(i for i, c in enumerate(calls) if c.upper().startswith("TRUNCATE"))
    assert floor_idx < truncate_idx


def test_run_parse_raises_when_result_below_floor(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(P, "_get_conn", lambda: _FakeConn(sink, floor=273051, post_count=100))
    with pytest.raises(RuntimeError):
        P.run_parse(dry_run=False)


def test_run_parse_does_not_raise_when_result_meets_floor(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(P, "_get_conn", lambda: _FakeConn(sink, floor=273051, post_count=273051))
    result = P.run_parse(dry_run=False)
    assert result["row_count"] == 273051


def test_run_parse_dry_run_issues_no_ddl(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(P, "_get_conn", lambda: _FakeConn(sink, floor=273051, post_count=0))
    result = P.run_parse(dry_run=True)
    calls = sink.get("calls", [])
    assert not any(c.upper().startswith("TRUNCATE") for c in calls)
    assert not any(c.upper().startswith("INSERT") for c in calls)
    assert result["floor"] == 273051


def test_run_parse_single_transaction_one_commit(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(P, "_get_conn", lambda: _FakeConn(sink, floor=273051, post_count=273051))
    P.run_parse(dry_run=False)
    assert sink.get("commits") == 1
