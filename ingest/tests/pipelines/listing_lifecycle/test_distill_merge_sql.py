"""Pure tests over the upsert_state MERGE SQL — no live DB (fake conn captures executemany).

The failure mode these guard (found 07/26/2026, operator gripe "WHY WOULD WE NOT HAVE BATHS"):
/search sweep rows never carry baths — baths only arrives via the /nearby-home-values enrich,
which fires ONCE, on the run a listing is first seen. A blanket `baths = EXCLUDED.baths` on
conflict therefore erases every enriched value on the very next nightly sweep (99% of
listing_state was NULL-baths when measured). Same shape as the listed_date clobber fixed
07/18/2026 — the COALESCE treatment must cover every enrich-only column, not just one.
"""
from ingest.pipelines.listing_lifecycle import distill


class _FakeCursor:
    def __init__(self, sink):
        self._sink = sink

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def executemany(self, sql, params):
        self._sink["sql"] = sql
        self._sink["params"] = params


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


def _captured_merge_sql(monkeypatch) -> str:
    sink: dict = {}
    monkeypatch.setattr(distill, "_get_conn", lambda: _FakeConn(sink))
    row = {"address_key": "6480 SANDALWOODLN:34112", "sale_or_rent": "sale"}
    distill.upsert_state([row])
    return sink["sql"]


def test_merge_preserves_stored_baths_when_sweep_row_has_none(monkeypatch):
    # Night 1 enrich fills baths=2.5; night 2's sweep row has baths=None. The merge must keep
    # the stored value — COALESCE, not a blanket EXCLUDED overwrite.
    sql = _captured_merge_sql(monkeypatch)
    assert "baths = COALESCE(EXCLUDED.baths, listing_state.baths)" in sql
    assert "baths = EXCLUDED.baths" not in sql


def test_merge_still_preserves_listed_date(monkeypatch):
    # The 07/18/2026 fix for the same clobber shape on listed_date must survive this change.
    sql = _captured_merge_sql(monkeypatch)
    assert "listed_date = COALESCE(EXCLUDED.listed_date, listing_state.listed_date)" in sql


def test_merge_still_tracks_sweep_for_live_columns(monkeypatch):
    # Columns the sweep DOES carry must keep plain overwrite semantics — a price change or
    # status flip must never be frozen by an over-broad COALESCE.
    sql = _captured_merge_sql(monkeypatch)
    assert "list_price = EXCLUDED.list_price" in sql
    assert "status = EXCLUDED.status" in sql
