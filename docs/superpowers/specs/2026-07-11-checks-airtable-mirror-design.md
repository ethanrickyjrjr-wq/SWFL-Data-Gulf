# Read-only Airtable mirror of the checks ledger

**Date:** 2026-07-11

## Problem

Open obligations for this repo live in Supabase `public.checks`, managed via `node scripts/check.mjs`
(open/update/close/reopen). The only ways to see this ledger today are the CLI (`check.mjs list`) or
the SessionStart kickoff dump — both terminal-only. There's no way to browse, filter, or share the
ledger outside a session.

## Goal

A read-only-in-spirit mirror of the open-checks ledger in Airtable, kept in sync automatically, so it's
browsable without a terminal. Supabase stays the sole source of truth and the only write path — nobody
edits the Airtable table directly; it's a passive display surface. `check.mjs` itself is untouched.

## Constraints (researched, not assumed)

- **Airtable Free plan: 1,000 API calls/month, workspace-wide, plus a 5 req/s per-base rate limit.**
  Source: `support.airtable.com/docs/managing-api-call-limits-in-airtable` (verified via crawl4ai
  2026-07-11). Exceeding it grants one 30-day grace period, then calls are blocked until the month
  rolls over.
- **Actual checks-ledger velocity** (queried `public.checks` directly, 2026-07-11): 507 total rows since
  05/31/2026, 229 opened in the trailing 7 days, 45 in the trailing 24 hours. 326 rows currently open,
  176 done, 5 dropped.
- A naive real-time push (one Airtable call per `check.mjs open/update/close`) would cost ~60-100+
  calls/day at this pace — 1,800-3,000+/month, blowing the free-tier cap in ~10-12 days. **Rejected.**
- A naive full-resync-every-run batch (push all currently-open rows each cron tick, even unchanged
  ones) would cost ~33 calls/run at today's 326 open rows (10 records/request batch limit) — even
  hourly that's ~800/day. **Rejected.** The sync must track *what changed* since the last run, not
  resync everything.
- Airtable's `update-multiple-records` endpoint supports upsert via `performUpsert.fieldsToMergeOn`
  (matches on a non-computed text/number/select/date field — no separate lookup call needed to know
  whether a row already exists). Source: `airtable.com/developers/web/api/update-multiple-records`.
- `delete-multiple-records` requires Airtable's own record IDs, not our external key — the design must
  persist the Airtable record ID returned by the upsert so a later delete doesn't need a lookup call.

## What we're building

### Schema change (Supabase)

Two nullable columns added to `public.checks` via an idempotent migration:

- `airtable_record_id text` — the Airtable record ID once a row has been synced, else `NULL`.
- `airtable_synced_at timestamptz` — when this row was last pushed to Airtable, else `NULL`.

### Airtable base (one-time setup)

One base ("Brain Platform — Checks Ledger"), one table ("Open Checks"), created via the `airtable-mcp`
CLI. `baseId`/`tableId` stored in `.dlt/secrets.toml` alongside existing credentials (not secret
values, but kept with the rest of the connection config for one place to look).

Fields mirrored, matching what `check.mjs list` already surfaces plus the two identifying/context
fields useful in a browsable view:

| Airtable field | Type | Source |
|---|---|---|
| `check_key` | Single line text (merge key) | `checks.check_key` |
| `project` | Single line text | `checks.project` |
| `label` | Single line text | `checks.label` |
| `detail` | Long text | `checks.detail` |
| `priority` | Number | `checks.priority` |
| `due_at` | Date (include time) | `checks.due_at` |
| `created_at` | Date (include time) | `checks.created_at` |
| `updated_at` | Date (include time) | `checks.updated_at` |

`resolution`, `signal`, and `proof` are close-mechanics internals, not useful in a browse view — left
out (YAGNI; add later if a real need shows up).

### Sync script

`scripts/airtable-checks-sync.mjs`, standalone (not called from `check.mjs`), supports `--dry-run` per
the pipeline-freshness standard. Each run:

1. Query Supabase (free, no Airtable calls) for two sets:
   - **Dirty opens** — `state = 'open' AND (airtable_record_id IS NULL OR airtable_synced_at < updated_at)`.
   - **Stale closes** — `state != 'open' AND airtable_record_id IS NOT NULL`.
2. Batch-upsert dirty opens to Airtable in groups of ≤10 records
   (`performUpsert.fieldsToMergeOn: ["check_key"]`, `typecast: true`). Read the Airtable record `id`
   back off each response record (matched via the echoed `check_key` field — no extra lookup call), and
   write `airtable_record_id` + `airtable_synced_at = now()` back onto the corresponding Supabase rows.
3. Batch-delete stale closes from Airtable in groups of ≤10, using each row's stored
   `airtable_record_id`. On success, null out `airtable_record_id` on those Supabase rows so they're
   never picked up again.
4. Both batch calls are skipped entirely when their set is empty — an idle run costs 0 Airtable calls.

### Cron wrapper

New GHA workflow, mirroring `.github/workflows/tripwire-hourly.yml`'s shape (schedule + workflow_dispatch,
`continue-on-error` scan step, `AIRTABLE_TOKEN` + Supabase creds from repo secrets). Schedule: **every 2
hours** (`0 */2 * * *`), not hourly — see cost math below.

### Cost math (why 2-hourly stays inside the free tier)

At the observed pace (~33 opens+updates/day, ~15-20 closes/day, spread across 12 runs/day instead of
24), most 2-hour windows contain a handful of dirty/stale rows — well under the 10-record batch size,
so almost every non-idle run costs exactly 1 upsert call + (if any closes landed in that window) 1
delete call. Worst case ~24 calls/day → **~500-700/month**, comfortably under the 1,000/month cap with
headroom for spikier weeks. One-time backfill of the current 326 open rows costs ~33 calls
(326 / 10, batched) on the first run — a one-time cost, not recurring.

Trade-off: Airtable can lag reality by up to 2 hours instead of being instant. Acceptable for a
browsable ledger; not meant to be a live dashboard.

### Error handling

Airtable failures (429, timeout, etc.) are caught, logged, and end the run without touching Supabase
`airtable_record_id`/`airtable_synced_at` for the failed batch — those rows simply stay "dirty" and get
picked up on the next run. The sync is never a hard dependency for `check.mjs`, which doesn't call it at
all.

### Testing / live-verify

Manual live-verify against the already-open check `checks_airtable_mirror_live_verify`: open a check,
run the sync (or wait for the next cron tick), confirm it appears in Airtable; close it, run the sync
again, confirm it disappears. Closes that check once verified live.
