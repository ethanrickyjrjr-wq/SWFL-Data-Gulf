# Batch Narrative Bake + Overnight Cron Replan — Design

**Date:** 07/10/2026 · **Status:** approved in session (operator), pending spec review
**Build check:** `batch_narrative_bake_live_verify`
**Companion build:** `send-window-guidance` (separate spec, same date)

## Problem

The Anthropic console flagged a 76% prompt-cache hit-rate drop. Diagnosis (this session): the
narrative-bake pipeline (shipped 07/09–07/10) added a wave of structurally-uncacheable Sonnet 4.6
calls — shared system prefix ~400 tokens, below Sonnet 4.6's 2,048-token cache floor — diluting the
org-wide ratio. The dollars fix isn't caching; it's the Message Batches API: the bake is
non-latency-sensitive batch work, and batch pricing is 50% of standard on all usage.

While replanning the bake's trigger we found the real scheduling problem: GitHub cron drift
(evidence below). This spec covers both — the batch migration and the overnight cron replan.

## Goal

Halve the bake's token spend, make its timing drift-proof by chaining it to the rebuild, and move
everything we control into the operator's 11 PM–6 AM Eastern overnight window — with the daily
digest landing at the researched engagement peak.

## Evidence (all verified live 07/10/2026)

**Message Batches API** (crawl4ai, platform.claude.com/docs/en/build-with-claude/batch-processing):
- 50% of standard prices on ALL usage (input, output, cache tokens). Sonnet 4.6 batch:
  $1.50/MTok in, $7.50/MTok out.
- Submit via `client.messages.batches.create({requests: [{custom_id, params}]})`;
  `custom_id` must match `^[a-zA-Z0-9_-]{1,64}$` (no slashes — our `surface/key` pairs need a
  generated-id map, not encoding).
- Poll `batches.retrieve(id).processing_status` until `"ended"`. Most batches < 1 hour;
  24-hour expiry ceiling. Results downloadable 29 days, streamed, UNORDERED — key by `custom_id`.
- Per-result types: `succeeded` (carries full message incl. `usage` + resolved `model`),
  `errored` / `canceled` / `expired` (all not billed).
- `stream: true` and `max_tokens: 0` rejected inside batches. Our `max_tokens: 1400` is fine.
- Caching tip (1h TTL for shared context) is moot for us — shared prefix below the cache floor.

**GitHub schedule drift** (raw github/docs source, `data/reusables/actions/schedule-delay.md`):
> "The schedule event can be delayed during periods of high loads of GitHub Actions workflow
> runs. High load times include the start of every hour. If the load is sufficiently high
> enough, some queued jobs may be dropped. To decrease the chance of delay, schedule your
> workflow to run at a different time of the hour."

Our own history confirms severity: daily-rebuild cron 06:00 UTC, actual scheduled starts this
week 08:19–10:08 UTC (2.3–4.1 h late; runs themselves complete in 30 s–7 min; the workflow's
concurrency group cannot cause this). Nearly all our crons sit at minute :00 — the worst slot.
Consequences adopted: off-hour minutes everywhere we touch, and chain dependent jobs on
completion events (`workflow_run`), never on clock gaps.

**Email send times** (crawl4ai, brevo.com/blog/best-time-to-send-email, their sent-mail corpus):
best engagement 10:00 AM local (secondary peak ~3:30 PM), best days Tuesday/Thursday, broad good
band = working hours. Used for the digest slot here and productized in the companion spec.

## What we're building

### 1. Metering seam extension (`refinery/agents/anthropic.mts`)

- `computeCostUsd(model, usage, opts?: {batch?: boolean})` — `batch: true` halves the total
  (50% applies to all token classes).
- `logApiUsage` passes the flag through.
- New `wrapBatchesSurface(real, callType)` mirroring `wrapMessageSurface`:
  - `batches.create` → `await checkSpendGuardAsync()` first (SpendCapError on breach, loud), then
    submit.
  - `batches.results` → wrap the returned async iterator; every `succeeded` result logs its real
    `model` + `usage` to `api_usage_log` at batch rates as it streams past.
- `getAnthropic`'s `messages` Proxy intercepts `batches` and routes through the wrapper — closing
  the current hole where `client.messages.batches` dodges the meter entirely.
- Known softness (same class as the existing documented one at this seam): the gate runs at
  submit against an estimate; actual spend lands at collection. Vendor docs also note batches may
  slightly exceed workspace spend limits.

### 2. Bake script (`scripts/bake-narratives.mts`) — three phases

Cadence gate, delta gate (`inputsHash`), dry-run, and mock behavior are all UNCHANGED. Dry-run
never submits a batch.

**Phase 0 — collect pending.** Read uncollected rows from `narrative_bake_batches`. For each
persisted key: re-run `adapter.assemble`, skip if fresh hash ≠ persisted hash (the key re-bakes
fresh in this same run — nothing stale can land), else `validateNarrative` + `upsertNarrative`
exactly as today. Mark row collected.

**Phase 1 — assemble + submit.** Pending keys become batch requests with generated `custom_id`s
(`req-0`, `req-1`, …) and an in-memory map to `{surface, key, inputsHash}`. Pre-submit sizing:
labeled ESTIMATE (prompt chars/4 input + full 1,400-token output ceiling per request, at batch
rates) against `NARRATIVE_BAKE_RUN_CAP_USD`; keys that don't fit are dropped and reported
unprocessed. Submit ONE batch; persist `{batch_id, requests map, submitted_at}` to Supabase
immediately, before any polling.

**Phase 2 — poll + collect.** Poll `processing_status` every 60 s until `ended` or a ~80-minute
in-script deadline. On deadline: exit 0 with a loud handoff note (next run's Phase 0 collects;
results live 29 days). On `ended`: stream results, map `custom_id` back, same
validate + upsert + previous-row-kept semantics as today, mark row collected. Same-run collection
uses the in-memory inputs (no re-assemble).

### 3. Persistence

New table `public.narrative_bake_batches`: `id`, `batch_id` (unique), `requests` jsonb
(custom_id → {surface, key, inputsHash}), `submitted_at`, `collected_at` nullable. Idempotent
migration, run directly via Bun.SQL (psql not installed), row-count verified.

### 4. Workflow changes (the overnight replan)

Window: operator directive — everything we control lands 11 PM–6 AM Eastern. UTC crons don't
observe DST; the band 04:00–10:00 UTC sits inside the window in both EDT and EST.

- `daily-rebuild.yml`: cron `0 6 * * *` → `23 4 * * *` (04:23 UTC = 12:23 AM EDT / 11:23 PM EST).
  Worst-observed drift (+4.1 h) still lands in-window.
- `narrative-bake.yml`: cron trigger replaced by `workflow_run` on Daily Brain Rebuild
  completion (submit immediately; batch typically done within the hour → fresh narratives ~1 h
  post-rebuild, drift-proof) PLUS a fallback cron `23 10 * * *` as a dead-rebuild backstop
  (GitHub says dropped schedules happen; the delta gate makes a redundant firing cost ~$0).
  `timeout-minutes` 30 → 90. Cadence gate + `BAKE_CADENCE` launch flip untouched.
- `daily-email-digest.yml`: `0 10 * * 1-5` → `23 14 * * 1-5` (10:23 AM EDT / 9:23 AM EST) —
  operator chose the engagement-peak slot over the bare-compliance slot. The :23 is our
  anti-congestion minute, NOT a research finding — customer-facing copy never quotes it.
- Minute nudges off :00 (same hour): `gate-a-parity` (07:00 → 07:23), `graphify-republish`
  (07:00 → 07:37), `build-example-deliverables` (08:00 → 08:23), `data-readiness-cron`
  (hourly :00 → :23).

**Explicitly NOT moved:** staggered listing pulls (`active-listings-daily`,
`listing-lifecycle-daily` — deliberate 3 h pacing, intraday data), all vendor-release-pinned
monthly/quarterly ingests (BLS/Census/Redfin/Zillow/etc. — pinned to source publish times),
`email-scheduler.yml` */15 (must run all day; the send window is product code — companion spec),
`freshness-probe` + `data-targets-daily` (audit the day's landings). `news-swfl-ingest` +
`city-pulse-daily`: candidate overnight move parked pending one verification — the workflow
comment references a companion Vercel scoring cron at 07:00 UTC that is not in this repo's
`vercel.json`; locate it before moving either (check opened per RULE 2.4).

### 5. Error handling

- Submit failure → exit 1; nothing persisted, nothing spent.
- `errored` result → failed count + previous row kept (not billed).
- `expired` result → not billed; hash never stored, so the delta gate re-queues the key next run.
- Batch expires uncollected → no-op row; upsert only ever follows fresh validation.
- SpendCapError at submit → loud exit, same as every other metered path.

### 6. Testing

Unit (bun:test, offline): `computeCostUsd` batch flag (full vs half); batches wrapper against a
fake surface (gate invoked on create, per-result logging on results); cap-sizing truncation;
custom_id map round-trip; Phase-0 hash-drift skip. Existing dry-run e2e unchanged.

Live verify (closes `batch_narrative_bake_live_verify`): one `workflow_dispatch` with a single
small key set (`--surface corridor --keys <one> --force`) — batch submits, polls, lands a
narrative row, logs half-rate spend to `api_usage_log`. Plus one observed scheduled overnight
chain: rebuild → workflow_run bake, timestamps inside the window.

### 7. Effects

Bake token spend halves (batch rates above). Narrative freshness moves from a fixed 10:40 UTC
guess to ~1 h post-rebuild, whenever the rebuild actually lands. Console cache-hit ratio stays
diluted (batch input is still uncached input) — cosmetic; the dollars are what this fixes.

## Out of scope

- Converting other call paths to batches (refinery rebuild is a dependency cascade; nothing else
  is batch-shaped today). The seam extension makes any future batch caller metered for free.
- The send-window clamp + best-time guidance → companion spec
  `2026-07-10-send-window-guidance-design.md`.
