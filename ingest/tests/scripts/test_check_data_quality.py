"""Unit tests for check_data_quality.py — SQL builders, schema diff, registry.

Safety is proven STRUCTURALLY (isinstance Composable + bound params), not by
string-matching: a raw f-string would be a plain `str` and fail the type assert.
The DB-touching paths are proven separately by the live "done when" proofs in the
spec; these tests stay offline (no psycopg connection)."""
import json
import os
import sys

import pytest
from psycopg import sql as pgsql

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))

from ingest.scripts.check_data_quality import (  # noqa: E402
    build_accepted_values_sql,
    build_not_null_sql,
    build_unique_sql,
    diff_schema,
    load_quality_registry,
    _quality_check_key,
    _schema_check_key,
)

_REGISTRY_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "ingest", "quality", "quality_registry.yaml"
)


# ── SQL builders: structural safety ─────────────────────────────────────────────


def test_not_null_builder_is_composable_no_params():
    query, params = build_not_null_sql("data_lake.news_articles_swfl", "article_url")
    assert isinstance(query, pgsql.Composable)  # a raw str would fail this
    assert params == []


def test_unique_builder_is_composable_no_params():
    query, params = build_unique_sql("data_lake.leepa_parcels", "folioid")
    assert isinstance(query, pgsql.Composable)
    assert params == []


def test_accepted_values_binds_values_not_interpolates():
    """The accepted set must be a bound array param (params), NEVER in the SQL —
    this is the SQL-injection guarantee for the one test that takes user values."""
    vals = ["a", "b", "c"]
    query, params = build_accepted_values_sql("data_lake.news_articles_swfl", "source_name", vals)
    assert isinstance(query, pgsql.Composable)
    # values are bound as a single list param (the LOCKED `<> ALL(%s::text[])` form),
    # cast to str — not formatted into the query text.
    assert params == [["a", "b", "c"]]


def test_accepted_values_query_uses_all_array_form_not_in():
    """Render check (readability, not the safety guarantee): the locked form is
    `<> ALL(%s::text[])`, NOT `NOT IN %s` (which is a psycopg3 SyntaxError)."""
    query, _ = build_accepted_values_sql("data_lake.x", "c", ["v"])
    rendered = query.as_string(None) if hasattr(query, "as_string") else str(query)
    assert "ALL(%s::text[])" in rendered
    assert "NOT IN %s" not in rendered


# ── schema diff classifier ──────────────────────────────────────────────────────


def test_diff_schema_identical_is_empty():
    base = {"a": "text", "b": "integer"}
    assert diff_schema(base, dict(base)) == []


def test_diff_schema_classifies_all_three():
    baseline = {"keep": "text", "gone": "integer", "shifted": "date"}
    live = {"keep": "text", "shifted": "text", "added": "boolean"}
    out = diff_schema(baseline, live)
    by_col = {d["col"]: d for d in out}
    assert by_col["added"] == {"col": "added", "change": "ADDED", "baseline_type": None, "live_type": "boolean"}
    assert by_col["gone"] == {"col": "gone", "change": "REMOVED", "baseline_type": "integer", "live_type": None}
    assert by_col["shifted"] == {
        "col": "shifted", "change": "TYPE_CHANGED", "baseline_type": "date", "live_type": "text",
    }
    # "keep" is unchanged -> must NOT appear
    assert "keep" not in by_col
    # sorted by col
    assert [d["col"] for d in out] == sorted(d["col"] for d in out)


def test_diff_schema_published_date_class():
    """The load-bearing case: news published_date text<->date is TYPE_CHANGED."""
    out = diff_schema({"published_date": "text"}, {"published_date": "date"})
    assert out == [{"col": "published_date", "change": "TYPE_CHANGED",
                    "baseline_type": "text", "live_type": "date"}]


# ── check_key slugging ──────────────────────────────────────────────────────────


def test_check_keys_slug_qualified_table():
    """The qualified table's dot/underscore must be slugged into the key so it
    stays a clean kebab token (mirrors the gap detector's _slug)."""
    qk = _quality_check_key("data_lake.news_articles_swfl", "article_url", "unique")
    assert qk == "quality_fail_data-lake-news-articles-swfl_article_url_unique"
    assert "." not in qk
    sk = _schema_check_key("data_lake.news_articles_swfl", "published_date")
    assert sk == "schema_drift_data-lake-news-articles-swfl_published_date"
    assert "." not in sk


# ── registry smoke ──────────────────────────────────────────────────────────────


def test_quality_registry_parses_and_is_well_formed():
    reg = load_quality_registry(_REGISTRY_PATH)
    assert "tables" in reg and reg["tables"], "registry must have at least one table"
    for table, cfg in reg["tables"].items():
        for spec in cfg.get("value_tests", []):
            for k in ("col", "test", "severity"):
                assert k in spec, f"{table} value_test missing {k}: {spec}"
            assert spec["severity"] in ("warn", "error")
            assert spec["test"] in ("not_null", "unique", "accepted_values")
            if spec["test"] == "accepted_values":
                assert isinstance(spec.get("values"), list) and spec["values"], \
                    f"{table} accepted_values must carry a non-empty 'values' list"


def test_quality_registry_has_four_pilot_tables():
    reg = load_quality_registry(_REGISTRY_PATH)
    for t in ("data_lake.news_articles_swfl", "data_lake.zhvi_swfl",
              "data_lake.zori_swfl", "data_lake.leepa_parcels"):
        assert t in reg["tables"], f"pilot table {t} missing from registry"


def test_committed_baselines_exist_and_parse():
    """The four pilot baselines must be committed (else first CI run shows
    BASELINE_MISSING). Each must be a {column: data_type} JSON map."""
    bdir = os.path.join(os.path.dirname(_REGISTRY_PATH), "schema_baselines")
    for t in ("data_lake.news_articles_swfl", "data_lake.zhvi_swfl",
              "data_lake.zori_swfl", "data_lake.leepa_parcels"):
        p = os.path.join(bdir, f"{t}.json")
        assert os.path.exists(p), f"missing baseline {p} — run --update-baseline"
        data = json.loads(open(p, encoding="utf-8").read())
        assert isinstance(data, dict) and data
        assert all(isinstance(k, str) and isinstance(v, str) for k, v in data.items())


# ── Locus B: content contracts ─────────────────────────────────────────────────

from ingest.scripts.check_data_quality import (  # noqa: E402
    _CONTRACT_PREFIX,
    _QUALITY_PREFIX,
    _SCHEMA_PREFIX,
    _contract_check_key,
    format_content_contracts,
    run_content_contracts,
    sync_quality_checks,
)


class _FakeCursor:
    """Records every SQL string executed; answers count(*) queries with a canned number.

    The per-key ledger existence SELECT ("SELECT id, state FROM public.checks ...") must
    answer None ("no row yet") or sync_quality_checks' `row[1]` would IndexError on the
    one-element count tuple — the fake distinguishes it by the query text it just saw."""

    def __init__(self, count=0, log=None):
        self._count, self.log = count, log if log is not None else []
        self._last_q = ""

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, q, params=None):
        self._last_q = q.as_string(None) if hasattr(q, "as_string") else str(q)
        self.log.append((self._last_q, params))

    def fetchone(self):
        if "SELECT id, state FROM public.checks" in self._last_q:
            return None  # "no existing ledger row" -> the INSERT path
        return (self._count,)

    def fetchall(self):
        return []


class _FakeConn:
    def __init__(self, count=0):
        self.count, self.log = count, []

    def cursor(self):
        return _FakeCursor(self.count, self.log)

    def rollback(self):
        pass

    def commit(self):
        pass


def test_run_content_contracts_returns_the_run_value_tests_result_shape():
    """Same keys as run_value_tests -> the formatter and the ledger sync compose unchanged."""
    results = run_content_contracts(_FakeConn(0), load_quality_registry())
    assert results
    for r in results:
        assert set(r) >= {"table", "col", "test", "severity", "failing_rows", "status"}
    assert all(r["status"] == "PASS" for r in results)   # count(*) == 0 -> PASS


def test_run_content_contracts_marks_a_nonzero_count_FAIL():
    results = run_content_contracts(_FakeConn(7), load_quality_registry())
    assert all(r["status"] == "FAIL" and r["failing_rows"] == 7 for r in results)


def test_run_content_contracts_skips_merge_only_contracts():
    """`market_details_sold_rent_band` is locus: merge — it has no at-rest form (the table is an
    accumulating time series; its at-rest twin is a separate sql_expectation)."""
    names = {r["test"] for r in run_content_contracts(_FakeConn(0), load_quality_registry())}
    assert "market_details_sold_rent_band" not in names
    assert "market_details_sold_rent_band_at_rest" in names
    assert "listing_active_stats_land_blend_tripwire" in names
    assert "listing_state_home_price_floor" in names          # locus: both -> runs at rest too


def test_a_broken_contract_SKIPs_and_never_breaks_the_run():
    """The probe ALWAYS exits 0 (check_data_quality.py:21-22). A malformed contract is a SKIP."""
    reg = {"tables": {"t": {"content_contracts": [
        {"name": "broken", "type": "range", "locus": "probe", "policy": "report",
         "severity": "error"},   # no col, no min, no max
    ]}}}
    (r,) = run_content_contracts(_FakeConn(0), reg)
    assert r["status"] == "SKIP" and r["failing_rows"] is None


def test_the_ledger_AUTO_CLOSE_query_carries_the_contract_prefix():
    """THE SILENT ONE. sync_quality_checks' auto-close hardcodes its LIKE params (:339-344).
    Forget the third prefix and a contract check opens and NEVER auto-closes — a permanently
    open stale check, i.e. exactly the false-RED class this build exists to kill."""
    conn = _FakeConn(0)
    sync_quality_checks(conn, [], [], [])
    autoclose = [q for q, p in conn.log if "state='open'" in q and "check_key LIKE" in q]
    assert autoclose, "no auto-close query ran"
    q, params = next((q, p) for q, p in conn.log if "check_key LIKE" in q and "state='open'" in q)
    assert q.count("check_key LIKE %s") == 3
    assert _CONTRACT_PREFIX + "%" in params
    assert _QUALITY_PREFIX + "%" in params and _SCHEMA_PREFIX + "%" in params


def test_only_error_severity_contract_fails_open_a_checks_row():
    """The `_watch` twin is `warn` — it reports 2 known-accepted ZIPs forever and must never
    open a check."""
    conn = _FakeConn(0)
    contract_results = [
        {"table": "data_lake.market_details_swfl", "col": None,
         "test": "market_details_sold_rent_band_watch", "severity": "warn",
         "failing_rows": 2, "status": "FAIL"},
        {"table": "data_lake.listing_active_stats", "col": None,
         "test": "listing_active_stats_land_blend_tripwire", "severity": "error",
         "failing_rows": 3, "status": "FAIL"},
    ]
    sync_quality_checks(conn, [], [], contract_results)
    inserts = [p for q, p in conn.log if "INSERT INTO public.checks" in q]
    assert len(inserts) == 1
    assert _contract_check_key("data_lake.listing_active_stats",
                               "listing_active_stats_land_blend_tripwire") in inserts[0]


def test_format_content_contracts_says_clean_when_all_pass():
    out = format_content_contracts([
        {"table": "t", "col": "c", "test": "x", "severity": "error",
         "failing_rows": 0, "status": "PASS"},
    ])
    assert "✅" in out and "1" in out
