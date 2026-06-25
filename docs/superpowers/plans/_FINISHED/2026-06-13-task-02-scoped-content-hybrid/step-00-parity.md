# Step 00 — Finish the GATE-A parity (trivial; do first)

**Check:** `gate_a_parity_job_ran` (due Jun 13) · **Owner:** Opus/any · **Risk:** none (no code, no push)

## Goal

Fire the already-built `gate-a-parity.yml` once so the 4 zhvi/zori DB-parity assertions actually **execute**
(not `describe.skip`) and go green — proving "green == the parity ran". The infra shipped in `a973e1b`; this is
just the evidence run.

## Preconditions (verified)

- Secret `DESTINATION__POSTGRES__CREDENTIALS` set (2026-06-13 00:29 UTC).
- Workflow registered + active (id 295506377), `workflow_dispatch: {}` enabled.
- The harness reads the env DSN first (`_db-parity-harness.mts` `dbUri()`), so `RUN_DB_PARITY=1` + the secret →
  the 4 files run; a missing secret would fail-loud RED (by design), not silent-green.

## Steps

1. `gh workflow run gate-a-parity.yml -R ethanrickyjrjr-wq/brain-platform`
2. `gh run watch <id>` (or `gh run view <id> --log`). Confirm the **"Run GATE A parity"** step executes all 4
   files: `zhvi-zip-latest-gate-a-parity`, `zori-zip-latest-gate-a-parity`, `zhvi-zip-latest-view-equivalence`,
   `zori-zip-latest-view-equivalence` — and the job is green.
3. On green → `node scripts/check.mjs close gate_a_parity_job_ran "first gated run executed the 4 assertions green (run <id>)"`.

## Done when

- Run is green AND the log shows the 4 files ran (not skipped).
- `gate_a_parity_job_ran` closed in the ledger.

## If it goes RED

- Missing-creds fail-loud → re-confirm the secret name is exactly `DESTINATION__POSTGRES__CREDENTIALS`.
- A real assertion failure → the view ⇆ pack drifted; read the failing assertion, do NOT close the check.
