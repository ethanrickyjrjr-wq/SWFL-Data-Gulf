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


# ── evaluate_batch: purity, policy, abort math ─────────────────────────────────

from ingest.quality.contracts import evaluate_batch, load_contracts  # noqa: E402

_REG_REPORT = {"tables": {"t": {"content_contracts": [
    {"name": "floor", "type": "range", "locus": "both", "policy": "report", "severity": "error",
     "col": "p", "min": 100, "where": [],
     "abort_if": {"share_pct_gt": 5.0, "violations_gte": 25, "if_no_clean_rows": True}},
]}}}

_REG_QUARANTINE = {"tables": {"t": {"content_contracts": [
    {"name": "allow", "type": "enum", "locus": "both", "policy": "quarantine", "severity": "error",
     "col": "k", "allowed": ["a"], "allow_null": False, "where": [],
     "abort_if": {"share_pct_gt": 50.0, "violations_gte": 500, "if_no_clean_rows": True}},
]}}}


def test_report_policy_drops_nothing_but_counts_everything():
    """Correction #2, encoded: a price floor is a SIGNAL, not a licence to drop rows.
    Real manufactured-home SALES run continuously from $2,000 to $59,900 — no floor
    separates them from rent artifacts, so `report` must never remove a row."""
    rows = [{"p": 50}, {"p": 500}]
    clean, quarantined, stats = evaluate_batch(rows, "t", registry=_REG_REPORT)
    assert clean == rows and quarantined == []
    c = stats["contracts"][0]
    assert (c["violations"], c["in_scope"], c["status"]) == (1, 2, "VIOLATIONS")
    assert c["share_pct"] == pytest.approx(50.0)
    assert stats["abort"] is False  # 1 violation < violations_gte 25


def test_quarantine_policy_removes_offenders_and_merges_the_clean_rest():
    rows = [{"k": "a"}, {"k": "condos"}, {"k": "a"}]
    clean, quarantined, stats = evaluate_batch(rows, "t", registry=_REG_QUARANTINE)
    assert clean == [{"k": "a"}, {"k": "a"}]
    assert quarantined == [{"k": "condos"}]
    assert (stats["rows_in"], stats["rows_clean"], stats["rows_quarantined"]) == (3, 2, 1)
    assert stats["abort"] is False


def test_evaluate_batch_never_raises_on_a_violation():
    """PURITY CONTRACT. The abort RAISE lives in the merge orchestrator, never here —
    that keeps contracts.py importable and testable with no DB and no guards dependency."""
    clean, quarantined, stats = evaluate_batch([{"p": 1}] * 1000, "t", registry=_REG_REPORT)
    assert stats["abort"] is True          # returned as data...
    assert isinstance(stats["abort_reason"], str)   # ...with a reason string
    assert len(clean) == 1000              # ...and report policy still dropped nothing


def test_abort_needs_BOTH_share_and_count_a_small_recovery_batch_survives():
    """A 169-row recovery batch carrying 3 bad rows is 1.78% share. A share-only rule at
    1% would have ABORTED a legitimate recovery run. Real batches: 7 rows (07/07), 364
    (07/08), 21,142 (07/10)."""
    rows = [{"p": 1}] * 3 + [{"p": 500}] * 166       # 3/169 = 1.78% share, 3 violations
    _, _, stats = evaluate_batch(rows, "t", registry=_REG_REPORT)
    assert stats["contracts"][0]["share_pct"] == pytest.approx(100 * 3 / 169, abs=1e-4)
    assert stats["abort"] is False                    # 3 < violations_gte 25


def test_abort_fires_when_share_AND_count_both_breach():
    rows = [{"p": 1}] * 30 + [{"p": 500}] * 70       # 30% > 5.0 and 30 >= 25
    _, _, stats = evaluate_batch(rows, "t", registry=_REG_REPORT)
    assert stats["abort"] is True
    assert "floor" in stats["abort_reason"]


def test_if_no_clean_rows_aborts_a_tiny_100pct_contaminated_batch():
    """The silent-total-loss hole (08h §5): a 100%-contaminated batch UNDER violations_gte
    would quarantine every row, merge zero, and exit GREEN. A 7-row batch really happened
    (07/07/2026)."""
    rows = [{"k": "condos"}] * 7                     # 100% share but only 7 < 500
    clean, quarantined, stats = evaluate_batch(rows, "t", registry=_REG_QUARANTINE)
    assert clean == [] and len(quarantined) == 7
    assert stats["abort"] is True
    assert "no clean rows" in stats["abort_reason"]


def test_an_empty_batch_is_a_clean_no_op():
    clean, quarantined, stats = evaluate_batch([], "t", registry=_REG_REPORT)
    assert (clean, quarantined, stats["abort"]) == ([], [], False)


def test_a_table_with_no_contracts_passes_everything_through_untouched():
    """41,510 leepa_parcels nominal-consideration transfers are protected by TABLE-SCOPING:
    no price contract is authored for that table. A naive `last_sale_amount >= 20000` floor
    would quarantine 71,388 legitimate quitclaim / family transfers."""
    rows = [{"folioid": "x", "last_sale_amount": 100}]
    clean, quarantined, stats = evaluate_batch(rows, "data_lake.leepa_parcels", registry=_REG_REPORT)
    assert clean == rows and quarantined == [] and stats["contracts"] == []


def test_a_malformed_contract_SKIPs_loudly_and_never_reports_a_pass():
    reg = {"tables": {"t": {"content_contracts": [
        {"name": "typo", "type": "range", "locus": "both", "policy": "report",
         "severity": "error", "col": "p", "min": 1,
         "where": [{"col": "nonexistent_col", "op": "not_null"}]},
    ]}}}
    clean, _, stats = evaluate_batch([{"p": 5}], "t", registry=reg)
    c = stats["contracts"][0]
    assert c["status"] == "SKIP"          # NOT "PASS"
    assert "nonexistent_col" in c["detail"]
    assert clean == [{"p": 5}]            # a broken contract never takes down a load


def test_probe_only_contracts_are_skipped_at_the_merge_locus():
    """A sql_expectation is cross-row (a median, a JOIN) — not evaluable on a batch of dicts.
    locus: probe means Locus B only, and evaluate_batch must not pretend otherwise."""
    reg = {"tables": {"t": {"content_contracts": [
        {"name": "tripwire", "type": "sql_expectation", "locus": "probe", "policy": "report",
         "severity": "error", "failing_rows_sql": "SELECT count(*) FROM t"},
    ]}}}
    clean, _, stats = evaluate_batch([{"p": 1}], "t", registry=reg)
    assert stats["contracts"] == []       # not evaluated, not faked as a pass
    assert clean == [{"p": 1}]


def test_load_contracts_reads_the_real_registry_for_listing_state():
    got = load_contracts("data_lake.listing_state")
    assert [c["name"] for c in got] == [
        "listing_state_home_price_floor",
        "listing_state_property_type_allowlist",
    ]
