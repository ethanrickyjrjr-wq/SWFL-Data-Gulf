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


# ── registry loading ───────────────────────────────────────────────────────────

from pathlib import Path  # noqa: E402

_REGISTRY_PATH = Path(__file__).parent / "quality_registry.yaml"

MERGE_LOCI = ("merge", "both")   # evaluated by evaluate_batch (Locus A)
PROBE_LOCI = ("probe", "both")   # evaluated by check_data_quality (Locus B)


def load_registry(path: str | Path = _REGISTRY_PATH) -> dict:
    import yaml

    with open(path, encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def load_contracts(table: str, registry: dict | None = None) -> list[dict]:
    """The `content_contracts:` list for one physical table — [] if it has none.

    [] is the protection mechanism for data_lake.leepa_parcels: 41,510 of its 528,130
    non-null last_sale_amount values are legitimate $1-9,999 nominal-consideration /
    quitclaim / family transfers. NO price contract is authored for that table, and a
    naive `>= 20000` floor would quarantine 71,388 real deeds."""
    reg = registry if registry is not None else load_registry()
    return ((reg.get("tables") or {}).get(table) or {}).get("content_contracts") or []


# ── evaluate_batch (Locus A) ───────────────────────────────────────────────────


def _abort_check(spec: dict, in_scope: int, violations: int, share_pct: float) -> str | None:
    """The reason string if this contract's abort_if trips, else None.

    abort  <=>  (share_pct > share_pct_gt AND violations >= violations_gte)
            OR  (if_no_clean_rows AND in_scope > 0 AND violations == in_scope)

    BOTH conditions on the first branch, never either. A share-only rule aborts a 7-row
    recovery batch over 1 bad row; a count-only rule aborts a 34k load over noise. The
    second branch closes the inverse hole: a 100%-contaminated batch UNDER the count floor
    would quarantine every row, merge zero, and exit green."""
    cfg = spec.get("abort_if") or {}
    name = spec.get("name")
    share_gt = cfg.get("share_pct_gt")
    count_gte = cfg.get("violations_gte")
    if (share_gt is not None and count_gte is not None
            and share_pct > share_gt and violations >= count_gte):
        return (
            f"[content-contract] {name}: {violations:,} of {in_scope:,} in-scope rows violate "
            f"({share_pct:.3f}% > {share_gt}% AND {violations:,} >= {count_gte:,}) — the feed "
            f"changed shape; aborting rather than merging a bulk leak"
        )
    if cfg.get("if_no_clean_rows") and in_scope > 0 and violations == in_scope:
        return (
            f"[content-contract] {name}: ALL {in_scope:,} in-scope rows violate — no clean rows "
            f"left to merge. A silent 100%-contaminated batch below the count floor would have "
            f"quarantined everything and exited green; aborting instead"
        )
    return None


def evaluate_batch(
    rows: list[dict],
    table: str,
    ctx: dict | None = None,
    registry: dict | None = None,
) -> tuple[list[dict], list[dict], dict]:
    """Evaluate every merge-locus contract for `table` against the candidate batch.

    PURE. Never raises on a violation. Never opens a DB connection. Returns
    (clean, quarantined, stats). The orchestrator decides what to DO:

        clean, quarantined, stats = evaluate_batch(ups, "data_lake.listing_state",
                                                   ctx={"source_name": src_name})
        if stats["abort"]:
            raise ContentContractError(stats["abort_reason"])
        ups = clean

    The raise lives in the caller by design — that keeps this module importable and
    unit-testable with no ingest.lib.guards dependency and no database.

    `ctx` supplies BATCH-SCALAR columns absent from the row dicts. On listing_state that is
    `source_name`: _STATE_COLS (distill.py:77-89) omits it and upsert_state injects it as a
    scalar at merge time (distill.py:200), so without ctx a source_name predicate is
    unevaluable at Locus A."""
    contracts = [c for c in load_contracts(table, registry)
                 if c.get("locus", "both") in MERGE_LOCI]
    stats: dict = {
        "table": table, "rows_in": len(rows), "rows_clean": len(rows),
        "rows_quarantined": 0, "abort": False, "abort_reason": None, "contracts": [],
    }
    drop: set[int] = set()
    abort_reasons: list[str] = []

    for spec in contracts:
        ctype = spec.get("type")
        policy = spec.get("policy", "report")
        base = {
            "name": spec.get("name"), "type": ctype, "policy": policy,
            "severity": spec.get("severity", "warn"),
        }
        evaluator = ROW_EVALUATORS.get(ctype)
        if evaluator is None:
            stats["contracts"].append({
                **base, "in_scope": None, "violations": None, "share_pct": None,
                "status": "SKIP",
                "detail": f"contract type {ctype!r} is not row-evaluable at the merge locus",
            })
            continue
        try:
            where = spec.get("where")
            in_scope_idx = [i for i, r in enumerate(rows) if row_matches_where(r, ctx, where)]
            viol_idx = evaluator(rows, ctx, spec)
        except ContractConfigError as exc:
            # A CONFIG bug. SKIP loudly — never report a pass, never take down the load.
            stats["contracts"].append({
                **base, "in_scope": None, "violations": None, "share_pct": None,
                "status": "SKIP", "detail": str(exc),
            })
            continue

        in_scope, violations = len(in_scope_idx), len(viol_idx)
        share_pct = (100.0 * violations / in_scope) if in_scope else 0.0
        stats["contracts"].append({
            **base, "in_scope": in_scope, "violations": violations,
            "share_pct": round(share_pct, 4),
            "status": "PASS" if violations == 0 else "VIOLATIONS",
            "detail": None,
        })

        if policy == "quarantine":
            drop.update(viol_idx)
        reason = _abort_check(spec, in_scope, violations, share_pct)
        if reason:
            abort_reasons.append(reason)

    clean = [r for i, r in enumerate(rows) if i not in drop]
    quarantined = [r for i, r in enumerate(rows) if i in drop]
    stats["rows_clean"] = len(clean)
    stats["rows_quarantined"] = len(quarantined)
    if abort_reasons:
        stats["abort"] = True
        stats["abort_reason"] = " | ".join(abort_reasons)
    return clean, quarantined, stats
