# Data Contracts + Doctor — Design (Path A now; Path C gated) — v2, reconciled

**Date:** 2026-07-11 · **Check:** `data_contracts_doctor_live_verify`
**v2 note (same day):** v1 of this spec was written in parallel with — and before reading — the sibling session's scoping work. v2 defers to that work as normative and keeps only what it lacks. No architecture is duplicated here.

## Normative sources (read in this order)

1. `docs/audit/2026-07-11-pipeline-problems/00-DIAGNOSIS.md` — the why (5 root causes, evidence-cited).
2. `docs/audit/2026-07-11-pipeline-problems/05-BUILD-SCOPE.md` — **the architecture and phases being built.** Spine (registry as single config truth) → Phase 1 content contracts (Locus A batch-gate + Locus B at-rest) → Phase 2 config-identity CI cross-check → Phase 3 watcher consolidation + doctor → Phase 4 GHA-native nightly chain. Operator decision recorded there: **A now, on GHA; Dagster rejected; Prefect-vs-Airtable open.**
3. `docs/audit/2026-07-11-pipeline-problems/07-plan-C-orchestrator-migration.md` — Path C is **conditional and gated** (A stable ≥ 60 days + measured structural bottleneck + operator willing to run an always-on service), with invariants that C may never violate (port-don't-reinvent; registry stays config truth; doctor stays the health reporter; Locus B survives).
4. `06-orchestrator-vendor-research.md` — vendor verdicts (live-doc verified 07/11/2026).

## Corrections this v2 accepts from 05 (v1 was wrong on all three)

- **Locus.** The contaminated writers are hand-rolled psycopg merges and `listing_active_stats` is a view with no pipeline — so contracts gate **on the candidate batch before merge** (quarantine/abort policies), not "post-load in dlt"; views get the at-rest tripwire only. v1's `enforce_contracts()`-after-`pipeline.run()` shape is superseded.
- **Version checks resolve live.** `actions/checkout@v6` became valid between diagnosis and scope — a baked-in allowlist is the same rot class we're fixing. Per 05, resolve against maintained/live tags.
- **A→C bridge is not Dagster-shaped.** v1's bridge table assumed Dagster; per 05/07 the only bridge A maintains is discipline: registry stays diffable YAML, `contracts.py` stays pure/DB-free/unit-tested, `doctor` reads run-status as one input. That keeps every C option (or no C at all) open.

## Already shipped before this spec (do not re-plan)

Commit `c9748a6c` (07/11/2026, sibling session): homes-only `listing_active_stats` migration applied to prod (ZIP 33972 median $35,000 → $359,000; 33974 $31,360 → $325,000), tripwire should-be-dark list corrected (6-day false RED ended), `MaterialRow` stale test fixed. Remaining act-today items live in 05 §Act-today: SteadyAPI **new-key** live test, CI fully green on main, plus the structural tripwire fix in Phase 3a.

## What this spec adds (the delta — nothing else is normative here)

### 1. Acceptance criteria per 05-phase (close = live evidence, never dev attestation)

- **Spine:** every `pipelines:` entry carries `workflow:`; a deliberately wrong filename fails the Phase-2 static check. Zero freeform `# Cron:` comments remain load-bearing.
- **Phase 1:** (a) the pre-fix contaminated listings batch (the 91 rental-priced "sale" rows + land blend), replayed as a fixture, is **quarantined** by `evaluate_batch()` with correct counts; (b) both known false-positive traps pass clean (523 legit sub-$20k land lots; 41,510 LeePA nominal-consideration transfers — no leepa price contract exists); (c) a synthetic >threshold contamination share **aborts** the run loud, and the incident logger captures it.
- **Phase 2:** static mode red on each seeded drift fixture (bad workflow ref, `dlt_schema_name` absent from pipeline source, secret read but not in `env:`, missing `timeout-minutes`, `source_tag` mismatch); live mode, run against the 07/11 snapshot, flags exactly the two real-world cases (`redfin_city_swfl` never landed; `dbpr_re_licensees` 0 rows) — they are the fixtures until fixed.
- **Phase 3:** manifest codegen — a new scheduled workflow added in a test branch fails the drift-test until regenerated; `classifyTermination` labels the leepa 4/4-cancelled history UNKNOWN-CANCEL and corridor-pulse's timeout kill TIMEOUT with `should_retry=false` (the money guard).
- **Phase 4:** `assert_landed.py` report-only run names any stale nightly source; after cutover, master's freshness token dates today after the chain, and the email preflight refuses a stale token in a forced test.
- **Doctor:** one run on live state produces one line per dataset + one per watcher, and every red line carries a prescription or an explicit "unknown class — evidence attached" (never an invented diagnosis).

### 2. Testing regime

- `contracts.py` is pure and DB-free: unit tests per contract type (`enum`, `range` WHERE-scoped, `sql_expectation`) plus the quarantine/abort policy math at the thresholds.
- Deliberate-failure proofs stay in the repo: `leepa.last_sale_amount` (existing not_null proof), pre-fix listings batch (Phase-1 proof), seeded drift fixtures (Phase-2 proof), synthetic cancelled run (Phase-3 proof).
- Read-only integration: `doctor --dry-run` < 2 min against live, correct on the two real broken tables.
- Existing gates untouched: `bunx next build`, `pytest ingest/`, Gate 2/4/5 hooks, vocab coverage.

### 3. Prescriptions enum (doctor + incident handler share it)

`ACTION_VERSION · SECRET_NOT_WIRED · SCHEMA_NAME_DRIFT · TIMEOUT_KILL (should_retry=false) · GAP_SENTINEL (verify vendor account — dead key = green run) · NEVER_LANDED (registry claims, DB lacks) · ZERO_COVERAGE (DB has, registry lacks) · WAF_BLOCK · TRANSIENT (retry ≤ 2, then escalate) · UNKNOWN (print evidence, say so)`. Seeded from `docs/cron-rebuild-failures.md` Recurring Patterns; every enum member has a test asserting its fix-text names the file/workflow it applies to.

### 4. Check linkage & tracking

- `data_contracts_doctor_live_verify` closes only on: Phase 1–3 acceptance above green **live** + doctor's first real run archived in `verification/`.
- Phase 4 (nightly chain) and its ask-first cron rewires get their own check at execution time (per 05 §sequencing flags).
- Related checks already open: `empty_brain_content_detector` (not in 05's scope — stays open), `tier_divergence_dag_orphan` (Phase-2 live mode will surface it; closing requires the ship-or-delete decision), `caveat_expiry_rebuild` (tracked by 05 Phase 3e; check stays open as its tracker).

## Out of scope

Everything 05 lists, plus: no Dagster/Prefect adoption inside A (07 gates it); no ops-page work (ops repo); no `BrainOutput` type-lift for caveats (05 3e chose render-TTL for exactly that reason).
