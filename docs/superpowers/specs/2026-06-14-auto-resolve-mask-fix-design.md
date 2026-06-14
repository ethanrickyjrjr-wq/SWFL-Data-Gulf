# Auto-resolve mask fix — design

**Date:** 2026-06-14 · **Status:** approved (operator) · **Scope:** ops/agent behavior, NOT a
materialization gate (RULE 3 C2 clear — extends the existing cron-ledger mechanism, adds no gate).

## Problem

`log-cron-incident.yml` flips an incident `OPEN → RESOLVED (auto)` the instant the next **scheduled**
run of that workflow passes (`flipMostRecentOpenRow`). It does this even when the Root Cause was never
diagnosed (`_auto-captured; pending triage_`). So a workflow that **self-heals on a transient** (a DB
blip, a missing-table-until-first-ingest, a vendor 429) gets stamped "RESOLVED (auto)" identical to a
workflow a human actually fixed. The undiagnosed cause is never found, the failure recurs, and each
recurrence re-auto-resolves. This is the operator's recurring complaint: *"every pipeline breaks every
day and I'm told they're fixed."* Evidence this session: `freshness-probe-daily` failed 2026-06-02 / 05
/ 06 on three different unguarded crashes, each auto-"RESOLVED" with `pending triage`, none diagnosed.

## Goal

Make a self-healed-but-undiagnosed resolution **distinguishable** from a real fix, and make a workflow
that does it **repeatedly** impossible to ignore — without manufacturing a new gate or auto-rewriting
ledger history.

## Design

**Change 1 — Honest relabel.** In the auto-resolve flip, inspect the resolving row's Root Cause cell:

- Root Cause still `_auto-captured; pending triage_` (untriaged) → status `RESOLVED (auto — self-healed, untriaged)`
- Root Cause human-diagnosed (anything else) → status `RESOLVED (auto)` (unchanged)

One glance now separates "we know why" from "it just stopped on its own."

**Change 2 — Chronic-flapper surfacing (read-only derivation, no section rewrite).** A pure function
`chronicFlappers(ledger, threshold=3)` counts, per workflow, incident rows that are **untriaged
self-heals** — Root Cause contains `pending triage` AND status is a `RESOLVED (auto…)` variant (this
catches BOTH the new label and pre-existing `RESOLVED (auto)` rows, so existing flappers surface
immediately). It returns workflows at or above the threshold. The **SessionStart kickoff**
(`scripts/session-kickoff.mjs`) prints this list so the next session — the one the operator *asks* "is
it fixed?" — sees it unmissably. Nothing rewrites the ledger; the data already lives in the rows.

**Clear mechanism.** A workflow drops off the flapper list the moment a human replaces its
`pending triage` Root Cause with a real diagnosis. Triaging it is exactly what silences it — the
incentive points the right way.

## Implementation

- **`.github/scripts/lib/ledger-flap.mjs`** (new, pure + testable): `flipMostRecentOpenRow(ledger, name)`
  (moved here from the logger, now relabel-aware) + `chronicFlappers(ledger, {threshold})`.
- **`.github/scripts/log-cron-incident.mjs`**: import `flipMostRecentOpenRow` from the lib (delete the
  inline copy); update the dry-run log line to reflect the conditional label.
- **`scripts/session-kickoff.mjs`**: import `chronicFlappers`, read `docs/cron-rebuild-failures.md`,
  print a `⚠️ Chronic flappers` line (workflow · count) when any exist; silent + best-effort otherwise
  (never block session start).
- **`.github/scripts/lib/ledger-flap.test.mjs`** (new, `node:test`, matches existing convention): flip
  relabels untriaged vs diagnosed; flip is a no-op when no OPEN row; `chronicFlappers` counts old+new
  untriaged-self-heal labels, respects the threshold, ignores diagnosed rows.

## Non-goals (YAGNI)

- Excluding `freshness-probe-daily` from auto-resolve — instead it surfaces as a flapper and gets
  triaged. Uniform, no special-casing.
- An auto-maintained ledger section / new sentinels — the kickoff derives the list read-only.
- Touching `/ops` (separate repo); it can derive the same list later if wanted.

## Testing / verification

`node --test .github/scripts/lib/ledger-flap.test.mjs` green; manual `node scripts/session-kickoff.mjs`
shows the flapper line against the live ledger (freshness-probe should appear once it has ≥3
untriaged-self-heal rows).
