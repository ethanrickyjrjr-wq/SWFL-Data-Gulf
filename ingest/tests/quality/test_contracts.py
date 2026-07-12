"""Unit tests for ingest/quality/contracts.py — the pure contract engine.

Pure and DB-free by construction: no psycopg connection, no fixtures on disk. The
row evaluator must be SQL-FAITHFUL — Locus A (Python, on the batch) and Locus B
(SQL, at rest) read the SAME registry spec, so if their NULL semantics diverge the
gate and the tripwire silently disagree about what a violation is."""
import pytest

from ingest.quality.contracts import (
    ContractConfigError,
    _MISSING,
    resolve_value,
    row_matches_where,
)


# ── resolve_value: row first, then batch-scalar ctx ────────────────────────────


def test_resolve_prefers_the_row_column():
    assert resolve_value({"list_price": 5000}, {"list_price": 999}, "list_price") == 5000


def test_resolve_falls_back_to_batch_ctx():
    """source_name is NOT a listing_state batch column (distill._STATE_COLS omits it;
    upsert_state injects it as a scalar at distill.py:200). ctx is the ONLY way a
    Locus-A contract can see it."""
    assert resolve_value({"list_price": 5000}, {"source_name": "api_feed"}, "source_name") == "api_feed"


def test_resolve_keeps_an_explicit_none_from_the_row():
    """sqft=None is a PRESENT column holding NULL — not a missing column. The whole
    price floor turns on that distinction (sqft-NULL mobile homes are out of scope)."""
    assert resolve_value({"sqft": None}, {"sqft": 1200}, "sqft") is None


def test_resolve_returns_missing_sentinel_for_an_unknown_column():
    """A typo'd column must be LOUD, never a silent None — a silent None makes the
    where-scope match nothing (or everything) and the contract reports a fake green."""
    assert resolve_value({"list_price": 1}, None, "lst_price") is _MISSING


# ── row_matches_where: SQL three-valued logic ──────────────────────────────────


def test_where_all_conditions_are_anded():
    row = {"sale_or_rent": "sale", "sqft": 1200}
    conds = [
        {"col": "sale_or_rent", "op": "eq", "value": "sale"},
        {"col": "sqft", "op": "not_null"},
    ]
    assert row_matches_where(row, None, conds) is True
    assert row_matches_where({"sale_or_rent": "sale", "sqft": None}, None, conds) is False


def test_empty_where_matches_every_row():
    assert row_matches_where({"anything": 1}, None, []) is True
    assert row_matches_where({"anything": 1}, None, None) is True


@pytest.mark.parametrize("op", ["eq", "ne", "in", "not_in", "lt", "lte", "gt", "gte"])
def test_null_never_satisfies_a_comparison(op):
    """SQL fidelity: `NULL <> 'x'` is UNKNOWN, not TRUE — the row is NOT selected.
    Python's `None != 'x'` is True, so a naive port would over-match every NULL row.
    The `not_in` case is the live one: property_type NOT IN ('land','other') must not
    silently pull in a NULL-typed row."""
    value = ["land", "other"] if op in ("in", "not_in") else 20000
    cond = {"col": "c", "op": op, "value": value}
    assert row_matches_where({"c": None}, None, [cond]) is False


def test_is_null_and_not_null_are_the_only_ops_that_see_null():
    assert row_matches_where({"c": None}, None, [{"col": "c", "op": "is_null"}]) is True
    assert row_matches_where({"c": None}, None, [{"col": "c", "op": "not_null"}]) is False
    assert row_matches_where({"c": 1}, None, [{"col": "c", "op": "not_null"}]) is True


def test_unknown_op_raises_config_error():
    with pytest.raises(ContractConfigError, match="unknown where op"):
        row_matches_where({"c": 1}, None, [{"col": "c", "op": "approximately", "value": 1}])


def test_missing_column_raises_config_error():
    """An unresolvable column is a CONFIG bug, not a data verdict. Raise here; the
    caller (evaluate_batch) catches it and SKIPs that one contract loudly."""
    with pytest.raises(ContractConfigError, match="lst_price"):
        row_matches_where({"list_price": 1}, None, [{"col": "lst_price", "op": "not_null"}])
