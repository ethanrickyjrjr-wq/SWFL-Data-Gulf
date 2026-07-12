"""Content contracts — pure, DB-free evaluation of registry-declared data contracts.

ONE authority, TWO compilers. Both read the SAME `content_contracts:` block in
ingest/quality/quality_registry.yaml, so a predicate can never drift between the gate
and the tripwire:

  Locus A (blocking-capable) — evaluate_batch(rows, table, ctx) in the merge orchestrator,
    on the candidate batch, immediately before the merge call. Pure: it NEVER raises and
    NEVER touches a DB. It returns (clean, quarantined, stats); the orchestrator inspects
    stats["abort"] and raises ContentContractError, or takes `clean`. The raise lives in
    the caller by design.

  Locus B (report-only) — build_*_sql(table, spec) in check_data_quality.py, run at rest.
    The ONLY locus a bare VIEW has (data_lake.listing_active_stats has no pipeline).

SQL FIDELITY IS THE LOAD-BEARING PROPERTY. The row evaluator implements SQL's
three-valued logic: a NULL never satisfies a comparison. Python's `None != 'x'` is True
while SQL's `NULL <> 'x'` is UNKNOWN (row not selected) — port that naively and Locus A
and Locus B silently disagree about what a violation is.

BATCH CONTEXT. `source_name` is NOT a batch-row column on listing_state:
distill._STATE_COLS (listing_lifecycle/distill.py:77-89) omits it and upsert_state injects
it as a scalar at merge time (distill.py:200). `ctx` supplies those batch-scalar columns so
a Locus-A contract can evaluate a source_name predicate at all.
"""
from __future__ import annotations

from typing import Any

_MISSING = object()  # "this column exists in neither the row nor the ctx" — never a value


class ContractConfigError(ValueError):
    """A malformed or unresolvable contract spec (unknown op, unknown column, bad type).

    A CONFIG bug, never a data verdict. evaluate_batch() catches it per-contract and marks
    that contract SKIP with the reason — a broken contract must never be reported as a pass,
    and must never take down a load."""

    pass


def resolve_value(row: dict, ctx: dict | None, col: str) -> Any:
    """Column value: the batch ROW first, then the batch-scalar CTX, else _MISSING.

    `col in row` (not `row.get(col)`) is deliberate: sqft=None is a PRESENT column holding
    NULL, which is a different thing from an absent column. The price floor's whole scope
    turns on that (sqft-NULL mobile homes are out of scope and must stay in the lake)."""
    if col in row:
        return row[col]
    if ctx and col in ctx:
        return ctx[col]
    return _MISSING


# Every op is FALSE on NULL except is_null/not_null — SQL three-valued logic (see module
# docstring). These same names compile to SQL in build_where_sql(); keep the two in step.
WHERE_OPS = {
    "eq": lambda v, t: v is not None and v == t,
    "ne": lambda v, t: v is not None and v != t,
    "in": lambda v, t: v is not None and v in t,
    "not_in": lambda v, t: v is not None and v not in t,
    "lt": lambda v, t: v is not None and v < t,
    "lte": lambda v, t: v is not None and v <= t,
    "gt": lambda v, t: v is not None and v > t,
    "gte": lambda v, t: v is not None and v >= t,
    "not_null": lambda v, t: v is not None,
    "is_null": lambda v, t: v is None,
}


def row_matches_where(row: dict, ctx: dict | None, conds: list[dict] | None) -> bool:
    """True iff the row is IN SCOPE for a contract. All conds AND-ed; empty/None = every row."""
    for cond in conds or []:
        op = cond.get("op")
        fn = WHERE_OPS.get(op)
        if fn is None:
            raise ContractConfigError(f"unknown where op {op!r} (have: {sorted(WHERE_OPS)})")
        col = cond.get("col")
        v = resolve_value(row, ctx, col)
        if v is _MISSING:
            raise ContractConfigError(
                f"where column {col!r} resolves in neither the batch row nor the batch ctx"
            )
        if not fn(v, cond.get("value")):
            return False
    return True


# ── row evaluators (Locus A) — pure: list of rows in, list of violating INDEXES out ──


def range_violations(rows: list[dict], ctx: dict | None, spec: dict) -> list[int]:
    """Indexes of in-scope rows whose `col` falls outside [min, max].

    THE NULL RULE (load-bearing): an in-scope row whose `col` is NULL is a VIOLATION, not a
    pass, unless `allow_null: true`. SQL's `NULL NOT BETWEEN 4 AND 40` is NULL, which silently
    PASSES the row — that is the three-valued-logic hole the market_details band shipped with.
    At least one of min/max is required: a range with neither bound asserts nothing."""
    col = spec.get("col")
    lo, hi = spec.get("min"), spec.get("max")
    if lo is None and hi is None:
        raise ContractConfigError(
            f"range contract {spec.get('name')!r} declares neither min nor max — asserts nothing"
        )
    allow_null = bool(spec.get("allow_null", False))
    where = spec.get("where")
    out: list[int] = []
    for i, row in enumerate(rows):
        if not row_matches_where(row, ctx, where):
            continue
        v = resolve_value(row, ctx, col)
        if v is _MISSING:
            raise ContractConfigError(
                f"range column {col!r} resolves in neither the batch row nor the batch ctx"
            )
        if v is None:
            if not allow_null:
                out.append(i)
            continue
        if (lo is not None and v < lo) or (hi is not None and v > hi):
            out.append(i)
    return out


def enum_violations(rows: list[dict], ctx: dict | None, spec: dict) -> list[int]:
    """Indexes of in-scope rows whose `col` carries a token outside the allowlist.

    The allowlist is the UNION of BOTH writers' code-reachable codomains, never the live
    table's active mix — see quality_registry.yaml's comment on the `residential` trap."""
    col = spec.get("col")
    allowed = spec.get("allowed")
    if not allowed:
        raise ContractConfigError(f"enum contract {spec.get('name')!r} has an empty allowed list")
    allowed_set = set(allowed)
    allow_null = bool(spec.get("allow_null", False))
    where = spec.get("where")
    out: list[int] = []
    for i, row in enumerate(rows):
        if not row_matches_where(row, ctx, where):
            continue
        v = resolve_value(row, ctx, col)
        if v is _MISSING:
            raise ContractConfigError(
                f"enum column {col!r} resolves in neither the batch row nor the batch ctx"
            )
        if v is None:
            if not allow_null:
                out.append(i)
            continue
        if v not in allowed_set:
            out.append(i)
    return out


# `sql_expectation` is DELIBERATELY absent: it is cross-row / cross-table (a median, a JOIN
# against another table) and is not evaluable on a batch of dicts at all. It is Locus-B only,
# and evaluate_batch() skips it by locus, not by accident.
ROW_EVALUATORS = {
    "range": range_violations,
    "enum": enum_violations,
}
