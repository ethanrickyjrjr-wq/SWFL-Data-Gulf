"""The fill guard is WIRED, not merely built.

This repo's most-repeated failure is a guard that exists beside the pipeline and is never
called. These tests fail if someone deletes the call site, re-localizes _ENRICH_ONLY_COLS,
or breaks the before/after count contract. No DB, no network.
"""
import inspect
from pathlib import Path

import pytest

from ingest.pipelines.listing_lifecycle import distill, pipeline


# ── fake DB plumbing (no connection, no network) ───────────────────────────────


class _FakeCur:
    def __init__(self, row):
        self.row, self.sql, self.params = row, None, None

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, q, p=None):
        self.sql, self.params = q, p

    def fetchone(self):
        return self.row


class _FakeConn:
    def __init__(self, row):
        self.cur = _FakeCur(row)

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def cursor(self):
        return self.cur


# ── the one-root property ──────────────────────────────────────────────────────


def test_enrich_only_cols_is_module_level_and_drives_the_coalesce():
    """ONE list, two protections: the COALESCE set clause AND the fill guard. If this ever
    goes back to being a local inside upsert_state, the guard silently stops covering it."""
    assert isinstance(distill._ENRICH_ONLY_COLS, tuple)
    assert "baths" in distill._ENRICH_ONLY_COLS       # the 07/26/2026 casualty
    assert "listed_date" in distill._ENRICH_ONLY_COLS  # the 07/18/2026 near-miss

    src = inspect.getsource(distill.upsert_state)
    assert "_ENRICH_ONLY_COLS" in src
    assert "COALESCE" in src


def test_count_enrich_nonnull_returns_a_count_per_enrich_column(monkeypatch):
    row = tuple(1000 + i for i, _ in enumerate(distill._ENRICH_ONLY_COLS))
    fake = _FakeConn(row)
    monkeypatch.setattr(distill, "_get_conn", lambda: fake)

    out = distill.count_enrich_nonnull(source_name="api_feed")

    assert out == dict(zip(distill._ENRICH_ONLY_COLS, row))
    assert fake.cur.params == ("api_feed",)  # scoped to the source, never the whole table


def test_count_enrich_nonnull_fails_soft_so_it_never_kills_a_healthy_run(monkeypatch):
    def boom():
        raise RuntimeError("no DB")

    monkeypatch.setattr(distill, "_get_conn", boom)
    assert distill.count_enrich_nonnull() == {}


# ── the wiring itself ──────────────────────────────────────────────────────────


def test_pipeline_imports_and_calls_the_guard():
    assert hasattr(pipeline, "assert_fill_rate"), "guard not imported into the orchestrator"

    src = Path(pipeline.__file__).read_text(encoding="utf-8")
    assert "count_enrich_nonnull" in src, "no before/after baseline is ever taken"
    assert "assert_fill_rate(" in src, "the guard is imported but never called"
    # before must be captured ahead of the write loop, and asserted after it
    assert src.index("fill_before") < src.index("assert_fill_rate("), \
        "baseline must be captured BEFORE the merge, not after"


def test_guard_is_skipped_in_dry_run():
    """dry_run writes nothing, so there is nothing to compare — and a dry run must never
    require a live DB."""
    src = Path(pipeline.__file__).read_text(encoding="utf-8")
    assert "{} if dry_run else distill.count_enrich_nonnull" in src


def test_the_real_incident_would_now_fail_the_job():
    """End-to-end on the guard's contract, with the incident's real numbers."""
    from ingest.lib.guards import FillRateCollapseError, assert_fill_rate

    before = {"baths": 34139, "listed_date": 29500}
    after = {"baths": 339, "listed_date": 29500}  # the clobber, listed_date untouched

    with pytest.raises(FillRateCollapseError, match="baths"):
        for col, b in before.items():
            assert_fill_rate(b, after[col], tolerance=0.01,
                             table=distill._STATE_TABLE, column=col)


def test_fill_before_is_bound_on_every_path_through_run():
    """AST, not string matching: the baseline assignment must sit at the TOP level of run()'s
    body, never nested inside an `if`. It originally landed next to an `if source == "api":`
    block — one indent level deeper and the scrape path reaches `if fill_before:` with a
    NameError. The source-text tests above cannot see that."""
    import ast

    tree = ast.parse(Path(pipeline.__file__).read_text(encoding="utf-8"))
    run_fn = next(n for n in ast.walk(tree)
                  if isinstance(n, ast.FunctionDef) and n.name == "run")

    top_level_assigns = {
        t.id
        for stmt in run_fn.body
        if isinstance(stmt, ast.Assign)
        for t in stmt.targets
        if isinstance(t, ast.Name)
    }
    assert "fill_before" in top_level_assigns, (
        "fill_before is not assigned at the top level of run() — it is nested inside a "
        "branch, so some path reaches the guard with the name unbound"
    )
