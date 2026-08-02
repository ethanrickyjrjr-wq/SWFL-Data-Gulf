"""TDD for ingest.lib.raw_landing — the generic raw-body landing writer (08/02/2026 decree:
every paid SteadyAPI surface raw-lands). Each test is named for the failure mode it kills
(Step-1 failure-modes table, generalized)."""
from __future__ import annotations

import pytest

from ingest.lib import raw_landing


class _Cur:
    def __init__(self, log):
        self.log = log

    def executemany(self, sql, params):
        self.log.append((sql, params))

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class _Conn:
    def __init__(self, log):
        self.log = log
        self.committed = False

    def cursor(self):
        return _Cur(self.log)

    def commit(self):
        self.committed = True

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture()
def db(monkeypatch):
    log: list = []
    conn = _Conn(log)
    monkeypatch.setattr(raw_landing, "_get_conn", lambda: conn)
    return log, conn


# failure mode: duplicate rows on re-fetch → PK upsert, latest wins
def test_upsert_raw_sql_is_on_conflict_do_update(db):
    log, conn = db
    n = raw_landing.upsert_raw(
        "data_lake.steadyapi_search_raw", ["property_id"],
        [{"property_id": "P1", "county": "Lee", "body": {"v": 1}}],
    )
    assert n == 1 and conn.committed
    sql, params = log[0]
    assert "ON CONFLICT (property_id) DO UPDATE SET" in sql
    assert "body = EXCLUDED.body" in sql and "fetched_at = EXCLUDED.fetched_at" in sql
    assert "property_id = EXCLUDED" not in sql  # key col never in SET


# failure mode: composite-key time-series grain (county+captured_date) mishandled
def test_upsert_raw_composite_key_excluded_from_set(db):
    log, _ = db
    raw_landing.upsert_raw(
        "data_lake.steadyapi_price_histogram_raw", ["county", "captured_date"],
        [{"county": "Lee", "captured_date": "2026-08-02", "body": {"bands": []}}],
    )
    sql, _p = log[0]
    assert "ON CONFLICT (county, captured_date) DO UPDATE SET" in sql
    assert "county = EXCLUDED" not in sql and "captured_date = EXCLUDED" not in sql


# failure mode: dict lands as text instead of jsonb → Jsonb wrapper required
def test_upsert_raw_wraps_body_as_jsonb(db):
    from psycopg.types.json import Jsonb

    log, _ = db
    raw_landing.upsert_raw(
        "data_lake.steadyapi_search_raw", ["property_id"],
        [{"property_id": "P1", "county": "Lee", "body": {"nested": {"deep": True}}}],
    )
    _sql, params = log[0]
    assert isinstance(params[0]["body"], Jsonb)


# failure mode: empty batch burns a connection / errors
def test_upsert_raw_empty_is_noop(db):
    log, _ = db
    assert raw_landing.upsert_raw("t", ["k"], []) == 0
    assert log == []


# failure mode: --dry-run writes to prod
def test_upsert_raw_dry_run_writes_nothing(db):
    log, _ = db
    n = raw_landing.upsert_raw(
        "t", ["k"], [{"k": "1", "body": {}}], dry_run=True,
    )
    assert n == 1 and log == []


# failure mode: raw-landing failure kills the run whose typed write succeeded
def test_write_isolated_swallows_and_returns_zero(monkeypatch, capsys):
    def boom(*a, **kw):
        raise RuntimeError("pooler blip")

    monkeypatch.setattr(raw_landing, "upsert_raw", boom)
    n = raw_landing.write_isolated("t", ["k"], [{"k": "1", "body": {}}], label="test-lane")
    assert n == 0
    assert "test-lane" in capsys.readouterr().out


def test_write_isolated_empty_is_noop_without_touching_db(monkeypatch):
    def boom(*a, **kw):  # pragma: no cover — must never be called
        raise AssertionError("should not reach upsert_raw")

    monkeypatch.setattr(raw_landing, "upsert_raw", boom)
    assert raw_landing.write_isolated("t", ["k"], []) == 0
