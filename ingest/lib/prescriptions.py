"""Prescription enum — the ONE authority for how a red line is diagnosed (spec §11).

Shared surface: ingest/scripts/doctor.py assigns a SUBSET; the cron incident handler
(Phase 3b, scripts/*.mjs) mirrors the same string literals for its own classification.

A red line NEVER carries an invented diagnosis. It carries a member of this enum, or an
explicit UNKNOWN with the evidence attached. That is the whole contract.

Doctor's four signals (freshness / volume / content / run-status) cannot reach four of
the ten members:
  ACTION_VERSION, SECRET_NOT_WIRED, SCHEMA_NAME_DRIFT — produced by Phase 2's
    ingest/tools/check-registry-identity.mts AT PR TIME. It fails the PR and writes no
    ledger row, so there is nothing for doctor to observe. Doctor never assigns them.
  WAF_BLOCK — requires reading a failed run's LOG for the `FetchHealthError` literal that
    ingest/lib/guards.py:34-45 exists to make greppable. That is the incident handler's
    surface, not doctor's. Doctor never assigns it.
They live here because the handler needs the same literals. DOCTOR_ASSIGNABLE is the
enforced boundary (ingest/scripts/doctor.py::prescribe never returns outside it).
"""
from __future__ import annotations

ACTION_VERSION = "ACTION_VERSION"
SECRET_NOT_WIRED = "SECRET_NOT_WIRED"
SCHEMA_NAME_DRIFT = "SCHEMA_NAME_DRIFT"
TIMEOUT_KILL = "TIMEOUT_KILL"
GAP_SENTINEL = "GAP_SENTINEL"
NEVER_LANDED = "NEVER_LANDED"
ZERO_COVERAGE = "ZERO_COVERAGE"
WAF_BLOCK = "WAF_BLOCK"
TRANSIENT = "TRANSIENT"
UNKNOWN = "UNKNOWN"

ALL: list[str] = [
    ACTION_VERSION,
    SECRET_NOT_WIRED,
    SCHEMA_NAME_DRIFT,
    TIMEOUT_KILL,
    GAP_SENTINEL,
    NEVER_LANDED,
    ZERO_COVERAGE,
    WAF_BLOCK,
    TRANSIENT,
    UNKNOWN,
]

DOCTOR_ASSIGNABLE: frozenset[str] = frozenset(
    {TIMEOUT_KILL, GAP_SENTINEL, NEVER_LANDED, ZERO_COVERAGE, TRANSIENT, UNKNOWN}
)

# TRANSIENT is the ONLY retryable class. TIMEOUT_KILL is explicitly false — the money
# guard: a run that already hit its ceiling re-burns the identical spend on retry (the
# corridor-pulse burn). WAF_BLOCK is false — a retry storm makes an anti-bot block worse.
_SHOULD_RETRY: dict[str, bool] = {TRANSIENT: True}

_FIX_TEMPLATES: dict[str, str] = {
    ACTION_VERSION: (
        "Pinned action version is stale or invalid — edit the `uses:` lines in "
        "`.github/workflows/{workflow}` and resolve against live tags "
        "(`gh api repos/actions/checkout/tags`). NEVER bake a version literal into the checker: "
        "actions/checkout@v6 is valid TODAY and v7 is the latest."
    ),
    SECRET_NOT_WIRED: (
        "Pipeline code reads a secret the workflow never passes — add it to the `env:` block of "
        "`.github/workflows/{workflow}`. `gh secret set` is step 1; wiring it into the workflow "
        "`env:` is step 2, and step 2 is the one that gets skipped."
    ),
    SCHEMA_NAME_DRIFT: (
        "Registry identity string does not match the literal in the pipeline source — reconcile "
        "`ingest/pipelines/{pipeline}/pipeline.py` against its entry in "
        "`ingest/cadence_registry.yaml` (table `{table}`). This is the one-letter class that cost "
        "two weeks of false-RED."
    ),
    TIMEOUT_KILL: (
        "Run hit its ceiling and was killed — raise `timeout-minutes` in "
        "`.github/workflows/{workflow}`, or shrink the batch. DO NOT RE-RUN: should_retry=false. "
        "A retry re-burns the identical spend and hits the identical ceiling."
    ),
    GAP_SENTINEL: (
        "`.github/workflows/{workflow}` ran GREEN and landed no rows — verify the vendor "
        "account/key is alive. A dead key returns an empty 200 and a green run; the pipeline "
        "cannot tell the difference and neither can the cron."
    ),
    NEVER_LANDED: (
        "`ingest/cadence_registry.yaml` claims table `{table}` but the DB has no successful load "
        "for it. Either dispatch `.github/workflows/{workflow}` once and confirm it lands, or "
        "delete the registry entry. A registry entry pointing at a ghost table reads FRESH forever."
    ),
    ZERO_COVERAGE: (
        "Table `{table}` holds real rows but `ingest/cadence_registry.yaml` has no entry for it — "
        "add the entry, or add `coverage_exempt: <reason>` to state the exclusion out loud."
    ),
    WAF_BLOCK: (
        "Source is blocking the fetch — read the failed run of `.github/workflows/{workflow}` for "
        "the `FetchHealthError` raised by `ingest/lib/guards.py`. DO NOT BLIND-RETRY: "
        "should_retry=false; a retry storm makes an anti-bot block worse."
    ),
    TRANSIENT: (
        "Transient failure in `.github/workflows/{workflow}` — retry up to 2x. If it fails a third "
        "time it is NOT transient: escalate and classify it for real."
    ),
    UNKNOWN: (
        "Unknown class for `{subject}` — evidence is attached below; NO diagnosis was invented. "
        "Triage by hand, then add the class to `ingest/lib/prescriptions.py` (and mirror the "
        "literal in the Phase-3b incident handler — the enum is shared)."
    ),
}


def fix_text(
    code: str,
    *,
    workflow: str | None = None,
    table: str | None = None,
    pipeline: str | None = None,
    subject: str | None = None,
) -> str:
    """Render a member's fix text. Missing context is STATED, never silently blank —
    a prescription that fails to name its file is a placeholder, which is the failure
    mode this whole build exists to kill."""
    if code not in _FIX_TEMPLATES:
        raise ValueError(f"unknown prescription code {code!r} — known: {', '.join(ALL)}")
    return _FIX_TEMPLATES[code].format(
        workflow=workflow or "<workflow unknown — registry `workflow:` field is missing>",
        table=table or "<table unresolved — no count_table/freshness_table/dlt_schema_name>",
        pipeline=pipeline or "<pipeline unknown>",
        subject=subject or "<subject unknown>",
    )


def should_retry(code: str) -> bool:
    """Only TRANSIENT retries. Everything else is a real class that a retry cannot fix."""
    if code not in _FIX_TEMPLATES:
        raise ValueError(f"unknown prescription code {code!r} — known: {', '.join(ALL)}")
    return _SHOULD_RETRY.get(code, False)
