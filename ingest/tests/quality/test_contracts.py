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


# ── range evaluator ────────────────────────────────────────────────────────────

from ingest.quality.contracts import enum_violations, range_violations  # noqa: E402

# The price-floor spec exactly as authored in quality_registry.yaml (Task 5). The
# sqft-IS-NOT-NULL scope is the ONLY one that separates the Marco Island rent artifacts
# (sqft present) from the real N. Fort Myers mobile-home SALES (sqft NULL).
_PRICE_FLOOR = {
    "name": "listing_state_home_price_floor",
    "type": "range",
    "col": "list_price",
    "min": 20000,
    "where": [
        {"col": "source_name", "op": "eq", "value": "api_feed"},
        {"col": "sale_or_rent", "op": "eq", "value": "sale"},
        {"col": "state", "op": "eq", "value": "active"},
        {"col": "list_price", "op": "not_null"},
        {"col": "sqft", "op": "not_null"},
        {"col": "property_type", "op": "in",
         "value": ["single_family", "condo", "townhouse", "multi_family"]},
    ],
}
_CTX = {"source_name": "api_feed"}


def _row(**kw):
    base = {"sale_or_rent": "sale", "state": "active", "property_type": "single_family",
            "list_price": 350000, "sqft": 1800, "beds": 3, "lot_acres": 0.20,
            "zip_code": "33901", "address_key": "SYNTHETIC:33901"}
    base.update(kw)
    return base


def test_range_flags_a_below_floor_row_in_scope():
    rows = [_row(address_key="10TAMPAPL303:34145", property_type="condo", list_price=9000,
                 beds=1, sqft=855, lot_acres=None, zip_code="34145")]
    assert range_violations(rows, _CTX, _PRICE_FLOOR) == [0]


def test_range_passes_a_row_above_the_floor():
    assert range_violations([_row()], _CTX, _PRICE_FLOOR) == []


def test_range_null_in_scope_is_a_violation_not_a_pass():
    """`NULL NOT BETWEEN 4 AND 40` is NULL in SQL, which SILENTLY PASSES the row. A NULL
    ratio with both price columns present is exactly the hole the band contract had."""
    spec = {"col": "sold_to_rent_ratio", "min": 4.0, "max": 40.0,
            "where": [{"col": "median_sold_price", "op": "not_null"},
                      {"col": "median_rent_price", "op": "not_null"}]}
    rows = [{"median_sold_price": 300000, "median_rent_price": 2000, "sold_to_rent_ratio": None}]
    assert range_violations(rows, None, spec) == [0]


def test_range_allow_null_true_lets_a_null_through():
    spec = {"col": "x", "min": 1, "allow_null": True, "where": []}
    assert range_violations([{"x": None}], None, spec) == []


def test_range_max_bound_flags_above_the_ceiling():
    spec = {"col": "sold_to_rent_ratio", "min": 4.0, "max": 40.0, "where": []}
    rows = [{"sold_to_rent_ratio": 1.28}, {"sold_to_rent_ratio": 21.14},
            {"sold_to_rent_ratio": 55.0}]
    assert range_violations(rows, None, spec) == [0, 2]  # 21.14 (Cape Coral) is LEGIT


def test_range_needs_at_least_one_bound():
    with pytest.raises(ContractConfigError, match="min.*max"):
        range_violations([{"x": 1}], None, {"col": "x", "where": []})


def test_range_out_of_scope_rows_are_never_evaluated():
    """522 legit sub-$20k LAND lots are protected by scope, not by threshold."""
    land = _row(property_type="land", list_price=18000, sqft=None, beds=None, lot_acres=0.23)
    assert range_violations([land], _CTX, _PRICE_FLOOR) == []


# ── enum evaluator ─────────────────────────────────────────────────────────────

# Allowlist = the UNION of BOTH writers' code-reachable codomains — NOT the live active mix.
# Authoring it from the 6-value active mix quarantines 2,996 legitimate 'residential' rows.
_PTYPE_ENUM = {
    "name": "listing_state_property_type_allowlist",
    "type": "enum",
    "col": "property_type",
    "allowed": ["single_family", "condo", "townhouse", "multi_family",
                "land", "other", "manufactured", "residential"],
    "allow_null": False,
    "where": [],
}


def test_enum_passes_every_allowed_token():
    rows = [_row(property_type=t) for t in _PTYPE_ENUM["allowed"]]
    assert enum_violations(rows, None, _PTYPE_ENUM) == []


def test_enum_protects_the_2996_residential_rows():
    """extract.py:140 emits 'residential' (Source-B vocabulary); catchup.py:92 flipped those
    rows into source_name='api_feed'. 2,996 live rows, median $359,900 Lee / $770,000 Collier
    — LEGITIMATE HOMES. Dropping 'residential' from the allowlist quarantines all of them."""
    rows = [_row(property_type="residential", state="holding", list_price=359900)]
    assert enum_violations(rows, None, _PTYPE_ENUM) == []


def test_enum_flags_a_raw_vendor_token_a_bypassed_normalizer_would_land():
    """`condos` / `townhomes` / `duplex_triplex` / `mobile` are the LIVE vocabulary of the
    sibling table data_lake.rental_listings_swfl (raw SteadyAPI tokens, never passed through
    PROPERTY_TYPE_MAP). They are what lands in listing_state if a writer skips the mapper —
    the only realistic way this contract ever fires. Not invented: observed."""
    rows = [_row(property_type="condos"), _row(property_type="duplex_triplex")]
    assert enum_violations(rows, None, _PTYPE_ENUM) == [0, 1]


def test_enum_null_is_a_violation_when_allow_null_false():
    assert enum_violations([_row(property_type=None)], None, _PTYPE_ENUM) == [0]
