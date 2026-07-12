# ingest/tests/scripts/test_assert_landed.py
"""Unit tests for assert_landed — the nightly row gate.

No DB. assert_landed() only reaches the database through two resolvers
(_last_run, _count_rows); both are monkeypatched. What is asserted here is the
DECISION TABLE — which is where every one of 08f §5's traps lives.
"""
import os
import sys
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from ingest.scripts import assert_landed as al

TODAY = date(2026, 7, 11)
YESTERDAY = date(2026, 7, 10)


class FakeConn:
    """assert_landed() itself never touches the conn — only the two patched
    resolvers do. This sentinel proves that: any real query would AttributeError."""

    def rollback(self):
        pass


class CtxConn(FakeConn):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _registry(*entries):
    # not_yet_running: deliberately carries a nightly: true entry — a PARKED
    # pipeline must never be able to red the chain.
    return {
        "pipelines": list(entries),
        "not_yet_running": [{"name": "parked_thing", "nightly": True, "expected_rows_min": 1}],
    }


def _patch(monkeypatch, last_runs: dict, counts: dict):
    monkeypatch.setattr(al, "_last_run", lambda conn, e: last_runs.get(e["name"]))
    monkeypatch.setattr(al, "_count_rows", lambda conn, e: counts.get(e["name"]))


def test_landed_when_fresh_today_and_above_the_floor(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": 34637})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert [x["status"] for x in r] == ["LANDED"]


def test_yesterday_is_STALE_even_though_the_probe_would_call_it_FRESH(monkeypatch):
    """check_tier2_entry:432 computes FRESH when age_days <= cadence *
    tolerance_multiplier — 1 x 3.0 = THREE DAYS for active_listings. A source that
    last landed two days ago is 'FRESH' to the probe. Reusing that status in a
    NIGHTLY gate rebuilds root-cause-1 ('green != data') inside the fix.
    assert_landed must apply its OWN `last_run == today` comparison. (08f §5 step 1)"""
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {"listing_lifecycle": YESTERDAY}, {"listing_lifecycle": 34637})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "STALE"


def test_low_rows_is_RED_even_when_freshness_is_green(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": 12})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "LOW_ROWS"


def test_unresolved_count_is_RED_never_skipped(monkeypatch):
    """THE None TRAP (08f §5 step 3). A missing/ghost table makes the count return
    None. Treating None as 'not applicable' PASSES a nonexistent table — exactly
    the redfin_city_swfl class (00-DIAGNOSIS.md:17). None -> UNRESOLVED -> RED."""
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": None})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "UNRESOLVED"


def test_unresolved_freshness_is_RED(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    _patch(monkeypatch, {}, {})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "UNRESOLVED"


def test_entry_without_a_countable_table_is_freshness_only(monkeypatch):
    """A `nightly: true` entry with NO count_table/freshness_table cannot be
    volume-gated — a DECLARATIVE, registry-visible opt-out of the volume half.
    NOT the same as a countable table whose count does not resolve, which is RED above."""
    reg = _registry({"name": "city_pulse", "lane": "tier-1", "nightly": True})
    _patch(monkeypatch, {"city_pulse": TODAY}, {})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "LANDED"
    assert r[0]["expected_rows_min"] is None


def test_freshness_only_entry_still_REDs_when_stale(monkeypatch):
    reg = _registry({"name": "city_pulse", "lane": "tier-1", "nightly": True})
    _patch(monkeypatch, {"city_pulse": YESTERDAY}, {})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert r[0]["status"] == "STALE"


def test_non_nightly_entries_are_not_gated(monkeypatch):
    reg = _registry(
        {"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000},
        {"name": "redfin_lee", "cadence_days": 30},
    )
    _patch(monkeypatch, {"listing_lifecycle": TODAY}, {"listing_lifecycle": 30000})
    r = al.assert_landed(FakeConn(), reg, today=TODAY)
    assert [x["name"] for x in r] == ["listing_lifecycle"]


def test_not_yet_running_entries_never_gate_the_chain():
    assert al.nightly_entries(_registry()) == []


def test_utc_today_is_utc_not_local():
    """08f drift 4: both probes compute age with date.today() — LOCAL time. That
    coincides on a GHA runner (TZ=UTC) and DIVERGES on the operator's EDT laptop:
    after 8 PM EDT, local date is already tomorrow's UTC date, so a local-date
    nightly gate false-REDs every evening. The gate's contract is explicitly UTC."""
    assert al.utc_today() == datetime.now(timezone.utc).date()


def test_main_exits_1_on_stale_and_0_under_dry_run(monkeypatch):
    # main() uses the REAL utc_today() — the fixture must too, or this test is
    # clock-dependent (a fixed date passes on exactly one day and flakes after).
    from datetime import timedelta

    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    monkeypatch.setattr(al, "load_registry", lambda p: reg)
    monkeypatch.setattr(al, "_get_connection", lambda: CtxConn())
    _patch(monkeypatch, {"listing_lifecycle": al.utc_today() - timedelta(days=1)}, {"listing_lifecycle": 34637})
    assert al.main([]) == 1
    assert al.main(["--dry-run"]) == 0


def test_main_exits_0_when_everything_landed(monkeypatch):
    reg = _registry({"name": "listing_lifecycle", "nightly": True, "count_table": "data_lake.listing_state", "expected_rows_min": 28000})
    monkeypatch.setattr(al, "load_registry", lambda p: reg)
    monkeypatch.setattr(al, "_get_connection", lambda: CtxConn())
    _patch(monkeypatch, {"listing_lifecycle": al.utc_today()}, {"listing_lifecycle": 34637})
    assert al.main([]) == 0


def test_zero_nightly_entries_is_RED(monkeypatch):
    """A gate that gates nothing is a green light. If the Spine's `nightly:` flags
    are missing or get dropped in a refactor, assert_landed must NOT silently pass
    the chain — it must red and say why."""
    monkeypatch.setattr(al, "load_registry", lambda p: {"pipelines": [{"name": "x"}]})
    monkeypatch.setattr(al, "_get_connection", lambda: CtxConn())
    assert al.main([]) == 1


def test_REAL_registry_every_nightly_entry_has_a_floor_and_a_countable_target():
    """N-1's regression lock, on the REAL file: a fixture-only suite cannot catch a
    field-name reversion (that is exactly how the min_rows defect shipped). Every
    `nightly: true` entry in ingest/cadence_registry.yaml must resolve a countable
    target AND a non-None expected_rows_min — except a declared freshness-only entry
    (no countable table at all), which today is none of them."""
    real = al.load_registry(al.REGISTRY_PATH)
    nightly = al.nightly_entries(real)
    assert len(nightly) == 4, [e["name"] for e in nightly]
    assert all(e["name"] != "active_listings" for e in nightly)  # N-2: never gate the corpse
    for e in nightly:
        target = e.get("count_table") or e.get("freshness_table")
        assert target, f"{e['name']}: nightly but no countable target"
        assert e.get("expected_rows_min") is not None, f"{e['name']}: no expected_rows_min floor"


# --- _count_rows SQL construction (count_nonnull: the OUTCOME floor) -----------
class _RecCursor:
    def __init__(self):
        self.q = None
        self.params = None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, q, params):
        self.q = q
        self.params = params

    def fetchone(self):
        return (7,)


class _RecConn(FakeConn):
    def __init__(self):
        self._cur = _RecCursor()

    def cursor(self):
        return self._cur


def test_count_nonnull_counts_the_value_column_not_rows():
    """OUTCOME floor. `count_nonnull: value` must emit count("value") — NULL-valued
    rows excluded — never count(*). The retired median_sale_price metric wrote 3
    all-NULL rows/night for 19 nights and read LANDED under count(*); this is the
    hole that made a dead feed green."""
    conn = _RecConn()
    entry = {
        "name": "live_search_daily_median_asking",
        "count_table": "data_lake.daily_truth",
        "count_filter": {"column": "metric_key", "value": "median_asking_price"},
        "count_nonnull": "value",
    }
    assert al._count_rows(conn, entry) == 7
    q = repr(conn._cur.q)
    assert "Identifier('value')" in q, q
    assert "count(*)" not in q, q
    # count_filter still scopes the WHERE — the two floors compose.
    assert conn._cur.params == ["median_asking_price"]


def test_count_without_nonnull_field_stays_count_star():
    """No `count_nonnull:` -> unchanged count(*). The field is opt-in per entry;
    tables without a single truth-bearing column keep the row floor."""
    conn = _RecConn()
    entry = {"name": "listing_lifecycle", "count_table": "data_lake.listing_state"}
    assert al._count_rows(conn, entry) == 7
    assert "count(*)" in repr(conn._cur.q)
