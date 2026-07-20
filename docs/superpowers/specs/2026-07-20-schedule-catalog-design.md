# One catalog of everything scheduled (jobs section + Gate 10 + derived schedule view)

**Date:** 2026-07-20
**Operator ask (07/20):** "one catalog would be nice" — one place listing everything that runs on a
schedule, with the constraint that it must not confuse future sessions ("small brained other
claudes"): short entries, and nothing a session has to read or understand to do normal work.

## Problem

"What runs on a schedule" currently lives in four places:

1. `ingest/cadence_registry.yaml` — ingest-source cadences only. 81 `workflow:` references.
2. `.github/workflows/` — 95 files carry a `cron:` line. **24 of them appear nowhere in the
   registry**, and they are the operational core: daily-rebuild, chief-of-staff-nightly,
   email-scheduler, social-scheduler, tripwire-hourly, narrative-bake, freshness-probe-daily
   (the auditor is absent from its own catalog), watch-scan/digest, outreach-drip/demo,
   airtable-checks-sync, build-example-deliverables, data-readiness-cron, data-targets-daily,
   gate-a-parity, graphify-republish, home-values-investor-monthly, lifecycle-nudges-daily,
   notion-sync-weekly, reverify-signals-daily, social-engagement-poll, social-pulse-scan,
   weekly-read.
3. `vercel.json` — a second scheduler entirely: `/api/mls/sync` (daily) and
   `/api/cron/nightly-chain-dispatch` (nightly). The registry doesn't know Vercel exists.
4. Tripwire memory — 3 workflows disabled at the GitHub API (corridor-pulse-weekly,
   dbpr-sirs-monthly, ingest-crexi-listings) are visible only in the tripwire scan.

All counts probed live 07/20/2026 (grep over workflows + registry; `vercel.json` read directly).
`home-values-investor-monthly` is an ingest workflow missing from the registry — a pre-existing
discipline gap this build closes as a side effect.

## Goal

ONE catalog (lookup + enforcement, operator-selected):

- Every scheduled thing — GHA crons, Vercel crons, disabled/parked jobs, any Claude-side scheduled
  routines — has an entry in `ingest/cadence_registry.yaml`.
- A pre-push gate keeps it that way forever: an unregistered cron blocks the push, and the error
  message contains the finished fix (paste-ready snippet), so future sessions never need to read or
  understand the catalog to stay compliant.
- Schedules are derived, never authored: cron expressions are read from the workflow files and
  `vercel.json` at render time. The catalog never duplicates a cron string, so it cannot drift.

## What we're building

### 1. `jobs:` section in `ingest/cadence_registry.yaml`

New top-level section at the bottom of the file (after `not_yet_running:`; file is currently
2,288 lines, this adds ~100). Entry schema — exactly three authored lines, plus two optional:

```yaml
jobs:
  - name: daily-rebuild
    workflow: daily-rebuild.yml
    purpose: Rebuilds stale brains via the refinery DAG (the daily brain rebuild).
  - name: mls-sync
    workflow: vercel.json#/api/mls/sync
    purpose: Daily MLS listing sync endpoint.
    scheduler: vercel          # optional; default gha
  - name: example-parked-job
    workflow: example-parked-job.yml
    purpose: Illustrative only — shows the optional `status:` field's shape (not a real entry;
      the 3 API-disabled workflows are excluded from `jobs:` per the backfill rule below).
    status: disabled           # optional; default live. disabled | parked
```

Rules:
- NO cron strings, lanes, freshness fields, or SLA fields — those remain exclusive to the existing
  ingest entries. The freshness probe ignores `jobs:` entirely (verify its parser tolerates the new
  key before landing).
- `workflow:` is the join key: a GHA filename, or `vercel.json#<path>` for Vercel crons, or
  `claude#<routine-name>` for Claude-side scheduled routines (checked via CronList 07/20 — none
  exist; the paused pulse schedules are GHA workflows already covered).
- Backfill in the same commit: all 24 unregistered GHA cron workflows + 2 Vercel crons. (The 3
  API-disabled workflows — corridor-pulse-weekly, dbpr-sirs-monthly, ingest-crexi-listings —
  already have pipelines:/not_yet_running: entries, verified 07/20; membership is satisfied and
  they get NO duplicate jobs: entries. Tripwire remains the live-state authority.) Purposes
  written from each workflow's own `name:` and run steps — read the file, never guess.
- Tripwire remains the authority on live/disabled state; `status:` records intent
  (deliberately parked vs. live), not observed health.

### 2. Gate 10 — schedule-catalog membership (pre-push)

Extend `.claude/hooks/check-prepush-gate.mjs` with Gate 10 (RULE 3 C2: extend the existing gate
family, no new hook file):

- Trigger: any commit ahead of upstream touches a `.github/workflows/*.yml` containing a `cron:`
  line, or touches `vercel.json` when it contains `crons`.
- Check: the touched workflow's basename (or `vercel.json#<path>`) appears in
  `ingest/cadence_registry.yaml` (anywhere — existing ingest entries already satisfy it via their
  `workflow:` field; `jobs:` covers the rest).
- Fail: block the push and print the exact paste-ready snippet —

```
GATE 10 — unregistered scheduled workflow: foo-bar.yml
Add to ingest/cadence_registry.yaml under `jobs:` (bottom of file):

  - name: foo-bar
    workflow: foo-bar.yml
    purpose: <one line — read the workflow's name: field>

Override (operator-approved only): ALLOW_UNREGISTERED_CRON=1
```

- Scope-guard: gate no-ops outside the brain-platform repo (07/19 lesson — prepush gates crashing
  on foreign-repo pushes).
- Removing a cron line or deleting a workflow does NOT block; a stale `jobs:` entry pointing at a
  workflow with no cron is reported as a warning (not a block) so cleanup is visible but never
  urgent.

### 3. Derived schedule view — `scripts/schedule-catalog.mjs`

Read-only merge, no authored duplication (slug_index lesson: derive what's derivable):

- Inputs: `ingest/cadence_registry.yaml` (both ingest entries and `jobs:`), live `cron:` lines
  parsed from `.github/workflows/*.yml`, `vercel.json` crons.
- Output: one JSON to stdout (or `--out <path>`) — name, purpose, scheduler, cron expression,
  status, source entry type (ingest | job). Nothing committed; consumers run the script.
- Also serves as the gate's shared parser (Gate 10 imports the same workflow-scan function) and as
  the local lookup: `node scripts/schedule-catalog.mjs` answers "what runs when" in one command.

### 4. Ops rendering — deferred, explicitly

The ops site gets one page rendering the derived JSON, but that is the ops repo (operator's call,
separate session). This build ends at the JSON. A `checks` entry records the deferral
(RULE 2.4 — no silent deferrals).

## Not in scope

- No changes to freshness-probe semantics, SLA logic, or any existing registry entry.
- No cron expressions authored into the registry, ever.
- No new CLAUDE.md prose beyond one reference-index line pointing at the `jobs:` section.
- No ops-repo changes in this build.

## Acceptance (schedule_catalog_live_verify)

1. `node scripts/schedule-catalog.mjs --check` exits 0: every workflow with an ACTIVE `- cron:`
   line and every vercel.json cron is registered; zero unregistered.
2. A test push touching a cron workflow absent from the registry is blocked by Gate 10 with the
   paste-ready snippet in the error; the same push passes after adding the printed snippet.
3. Freshness probe and existing gates run green with the `jobs:` section present.
4. Clean tree pushes are unaffected (gate is silent when nothing scheduled was touched).

## Evidence trail

- Registry coverage numbers, unregistered-workflow list, Vercel crons: probed in-session
  07/20/2026 (grep/read, commands in session transcript).
- Disabled workflows: tripwire scan 07/20/2026.
- No vendor surface is involved (all inputs are our own repo files); the only external read is the
  GitHub API disabled-state check, which stays in tripwire, not in this build.
