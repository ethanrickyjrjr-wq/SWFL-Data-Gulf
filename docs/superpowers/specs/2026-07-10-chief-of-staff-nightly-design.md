# Nightly chief-of-staff cron: checks-vs-git morning brief

**Date:** 2026-07-10 · **Status:** approved in session (operator), pending spec review
**Build check:** `chief_of_staff_nightly_live_verify`
**Companion (blocked):** spec-estate batch audit — gated on `batch-narrative-bake` landing `wrapBatchesSurface`

## Problem

The reconciliation gap. 200 open checks, 195 specs, 122 plans — and nothing scheduled ever
compares them to reality. Work ships and its check stays open; `*_live_verify` checks hide
never-started builds (known blind spot, memory `project_status-mechanisms-have-blind-spots`);
stale checks sink to position 47 in the kickoff list. The operator ends up re-saying the same
things because the trackers don't reconcile themselves. GHA failure-watching is already solid
(tripwire, heal-cron, incident logger) — this is the missing *success-side* watcher: did the
work that happened actually retire the obligations that tracked it?

## Goal

Every morning, one trustworthy brief: "these checks look shipped (evidence: commit SHAs),
these live_verifies were never started, these are the 3 stalest." Proposes, never executes.
Cheap model, hard spend bounds, zero new infrastructure surfaces.

## Operator decisions (locked in session 07/10/2026)

1. **Brief output:** GitHub issue (label `morning-brief`) + kickoff-block integration. Bot
   cannot push to main (GH013 ruleset — same constraint that moved incident capture off main
   06/28), so a committed file is out.
2. **Model:** Sonnet 4.6 (`claude-sonnet-4-6`, $3/$15 per MTok — claude-api skill, cached
   06/24/2026). Judgment-heavy matching; ~$0.50–1.50/night. Haiku downgrade is a later A/B.
3. **v1 scope:** checks-vs-git + staleness ONLY. No nightly spec/plan/MEMORY drift — that's a
   later build with its own brainstorm.
4. **Batch audit:** waits for `wrapBatchesSurface` (batch-narrative-bake spec, same date) so
   every Batches call is metered through the one seam.

## Evidence (RULE 0.4, verified live 07/10/2026)

- **claude-code-action@v1** (crawl4ai, raw README + docs/usage.md): `prompt` input drives
  automation mode (auto-detected from workflow context — works on `schedule` events; the
  Solutions guide lists "Scheduled Maintenance" as a supported pattern). Model, turn cap, and
  tool restriction go through `claude_args`: `--model`, `--max-turns`, `--allowedTools`.
  Legacy `mode`/`direct_prompt`/`model` inputs are deprecated.
- **Message Batches** (batch-narrative-bake spec crawl, platform.claude.com batch-processing,
  07/10/2026): 50% off all usage, no beta header; `custom_id` regex `^[a-zA-Z0-9_-]{1,64}$`;
  results unordered, keyed by custom_id; 24h expiry, results live 29 days. Haiku 4.5 batch =
  $0.50/$2.50 per MTok.
- **GH cron drift** (github/docs schedule-delay.md, 07/10/2026): jobs at :00 delayed/dropped
  under load; our own rebuild cron ran 2.3–4.1h late this week. Consequence: off-hour minute,
  and a 48h evidence lookback so a drifted/skipped night creates no blind window.
- **Model IDs/pricing** (claude-api skill, cached 06/24/2026): `claude-sonnet-4-6` $3/$15,
  `claude-haiku-4-5` $1/$5. Re-verify IDs at implementation time per Vendor First.

## Approach (chosen from 3)

**Deterministic collector + bounded agent.** Rejected: pure agent (burns 10–15 turns on
mechanical collection nightly); Anthropic Managed Agents scheduled deployment (new credential
surface via vaults, outside tripwire/spend-guard/incident telemetry, an eighth place things
exist).

## What we're building

### 1. Workflow `.github/workflows/chief-of-staff-nightly.yml`

- `schedule: cron: "47 8 * * *"` (08:47 UTC = 4:47 AM ET; off-hour minute per drift evidence;
  nothing chains off it) + `workflow_dispatch`.
- Permissions: `contents: read`, `issues: write` ONLY. No PR, no push — structurally cannot
  touch code.
- Kill switch: repo variable `CHIEF_OF_STAFF_ENABLED` gates the job (`if:`), convention of
  `CRON_HEAL_ENABLED`. `timeout-minutes: 20`.
- Added to `log-cron-incident.yml`'s watched workflows — a red run auto-captures an incident
  issue + check like every other production cron.

**Step 1 — collect ($0, deterministic).** `node scripts/chief-of-staff-collect.mjs` →
`evidence.json`:
- last 48h commits: sha, subject, files touched (`git log --since 48h --name-only`)
- all open checks: key, label, project, detail, due, days-untouched (reuses
  `scripts/lib/supabase-creds.mjs`; REST query same as `check.mjs list`)
- `*_live_verify` subset + never-started heuristic (no commit in history mentions the slug)
- stale list (untouched ≥14d), sorted oldest-first

**Step 2 — reconcile (Sonnet 4.6).** `anthropics/claude-code-action@v1`:
- `prompt`: instructions + inlined `evidence.json`
- `claude_args`: `--model claude-sonnet-4-6 --max-turns 30 --allowedTools "Read,Grep,Glob,Bash(git log:*),Bash(git show:*),Bash(git diff:*)"`
- Task: match commits→checks; MAY open files to confirm; MUST NOT close checks or write
  anything except the drafted brief file — posting happens in step 3.
- Brief sections (fixed order): **Close candidates** (check_key → SHA(s) → one-line why →
  confidence HIGH/MEDIUM) · **Never started** live_verifies · **Stale top-3** · **No evidence**
  count ("0 candidates" is a valid, successful brief — silence must always mean "ran, found
  nothing", never "didn't run").
- Trust rules (prompt + lint-enforced): every candidate cites ≥1 SHA present in the evidence
  pack; ≤15 candidates/night ranked by confidence; only HIGH/MEDIUM tiers exist — anything
  weaker goes to the No-evidence count. No invention: a proposal without a citable SHA is
  forbidden (four-lane discipline applied to ops).

**Step 3 — lint + post ($0).** `node scripts/chief-of-staff-lint.mjs` validates the drafted
brief file (SHA-in-pack, cap, sections present); lint failure fails the run loudly and nothing
posts. On pass, this deterministic step posts via `gh issue create` (title
`Morning brief — MM/DD/YYYY`, label `morning-brief`) and closes the previous open
`morning-brief` issue — the agent itself needs no `gh` write access.

### 2. Kickoff integration

`scripts/session-kickoff.mjs`: best-effort fetch of newest open `morning-brief` issue (GitHub
REST, unauthenticated-or-`gh`), print top ~5 Close candidates in the KICKOFF block. Any
failure degrades to current behavior, matching its other fetches.

### 3. Operator loop (proposes, never executes)

Closes stay manual: `node scripts/check.mjs close <key> --evidence "<sha>"`. Week-one grading:
each morning close correct proposals / note false positives. Keep if precision ≥~4/5; else
tighten prompt. Scope expansion = separate future build.

### 4. Companion (BLOCKED): spec-estate batch audit

`scripts/audit-spec-estate.mts`, operator-run once, AFTER batch-narrative-bake lands:
- Reads non-archived `docs/superpowers/specs/*.md` + `docs/superpowers/plans/*.md` (~317).
- One Batches job, `claude-haiku-4-5`, one request/doc: classify LIVE / SHIPPED /
  SUPERSEDED-BY-<file> / DEAD + one-line justification quoting the doc.
- Submits via `wrapBatchesSurface` (metered + spend-guarded at the one seam; no parallel
  metering path). Est. a few dollars at Haiku batch rates.
- Output: `_ASSISTANT/spec-estate-audit.json` + human summary proposing `git mv` into existing
  `_archive/` dirs. Script moves NOTHING; operator reviews and runs the moves.

## Testing

- Unit (`scripts/chief-of-staff.test.mjs`, bun test): evidence-pack shape; SHA-citation
  validation (reject SHA not in pack); 15-cap; staleness math on fixture checks; lint
  section-presence.
- Manual: two `workflow_dispatch` runs against real state; operator reads both briefs and
  judges precision before the schedule goes live.
- `chief_of_staff_nightly_live_verify` closes only when a SCHEDULED run posts a brief AND the
  kickoff block renders it.

## Cost

Nightly: bounded by `--max-turns 30` + 20-min timeout + org daily/monthly caps + hourly
tripwire on top. Estimate ~$0.50–1.50/night at Sonnet 4.6 rates (evidence pack is the bulk of
input; estimate labeled ESTIMATE — graded against `api_usage_log` in week one).
One-time audit: a few dollars at Haiku batch rates.

## Non-goals (v1)

- Auto-closing checks (never — propose-only is the design, not a phase).
- Nightly spec/plan/MEMORY/ontology drift (later build, own brainstorm).
- n8n / Managed Agents / any new orchestration surface (rejected in session — RULE C2).
