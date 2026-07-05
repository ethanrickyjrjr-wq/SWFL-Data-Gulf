# Daily spend tripwire + advisor verdict

**Date:** 2026-07-05
**Check:** `spend_tripwire_live_verify`
**Operator ask (verbatim intent):** "How do we find out that something is fucked? We need an advisor sonnet called on the situation or something. A sonnet with some morals."

## Problem

Every guard shipped on 07/05/2026 PREVENTS (dispatch hook, key quarantine, paid-surface
push gate, push lock, RunBudget caps). Nothing DETECTS and tells the operator. The credit
drain was caught by the operator staring at the console — the system never raised a hand.

## Principle

Detection is CODE, judgment is the MODEL. The watchman must be deterministic — free to
run, impossible to sweet-talk, runnable by any session or the operator at any moment. A
model only enters after evidence exists, to explain it, and that call is itself
budget-capped through the metered client. The model cannot be the watchman because the
model is what is being watched.

## Goal

One command answers "is anything fucked?" from evidence, in seconds, for $0. Any RED is
loud and machine-actionable (exit 1 → cron opens an issue in Phase 2).

## What we're building

### Phase 1 (this build) — `scripts/tripwire-scan.mjs`, zero-cost, run anywhere

```
node scripts/tripwire-scan.mjs
```

Checks (every number from a real source — the ledger, GitHub's API, the repo):

1. **SPEND** — sum `cost_usd` from `public.api_usage_log` (PostgREST, service key) for
   the current UTC day. RED at ≥ $5.00 (the locked INGEST_DAILY_CEILING_USD).
   Per-`call_type` breakdown printed.
2. **PULSE DARK** — `corridor-pulse-weekly.yml` + `city-pulse-daily.yml` must report
   `disabled_*`. RED if either is active before `pulse_crawl4ai_retrofit_live_verify`
   closes.
3. **MANUAL PAID DISPATCH** — any `workflow_dispatch` run of a paid workflow (file
   references ANTHROPIC_API_KEY) in the last 24h. RED on any: sessions cannot fire these
   (hook), so a dispatch means either the operator did it (they'll recognize it) or a
   bypass (the finding).
4. **GUARD INTEGRITY** — the four guard hooks + paid-run valve must exist on disk AND be
   registered in `.claude/settings.json`; quarantined key names must still be locked in
   `.env.local`. RED on any missing/unregistered/unlocked. Guard-file commits in the
   last 24h listed as YELLOW.
5. **VALVE AUDIT** — `verification/paid-runs.log` entries in the last 24h (YELLOW list;
   each should match an approval the operator remembers giving).
6. **PAID-RUN FAILURES** — failed runs of paid workflows in the last 24h (YELLOW; a
   "credit balance is too low" failure is the drain signature).

### Phase 2 — cron + the advisor with morals (separate PR, gated)

- GHA cron (daily, after rebuild) runs the scan; any RED opens/updates a GitHub issue
  (reuse the log-cron-incident pattern).
- THEN one Sonnet call (metered client, RunBudget $1) reads the evidence bundle and
  writes the verdict: what happened, what triggered it, does it match anything the
  operator authorized, severity, recommended action — posted to the issue. LLM never
  writes code, never closes findings.
- Ships with `--dry-run` + cron wrapper in the same PR (pipeline-freshness). The
  workflow env line referencing the key is NEW PAID SURFACE — pushes with
  `ALLOW_PAID_SURFACE=1` per the push-gate covenant.

## Out of scope

- No auto-remediation. The tripwire reports; humans and decrees act.
- Claude Code dev-session spend + console-side fees stay console-export-only (invisible
  to the ledger — documented limitation, restated in the scan output).
