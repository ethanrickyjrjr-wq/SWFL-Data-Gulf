# 04 — Cron worker + GHA (the auto-post engine)

| | |
|---|---|
| **Model** | **Sonnet** (clone of `scripts/email/run-schedules.mts`) |
| **Stage** | 3 — after 01 + 02 + 03 merge |
| **Runs in parallel with** | 06 |
| **CANNOT run with** | **01, 02, 03** — the worker calls their code; needs them present (does not edit them) |
| **Blocked by** | 01 (claim RPC + cores), 02 (`renderSocialImage`), 03 (`postToChannel` + token refresh) |
| **Files (new)** | `scripts/social/run-schedules.mts`, `.github/workflows/social-scheduler.yml` |

## Goal
The "connect once → auto-run on schedule" engine. Mirror the proven email worker exactly; each run reads the client's stored, auto-refreshed token and posts on their behalf — **DRY until the go-live flip.**

## Verified anchors
- `scripts/email/run-schedules.mts` — the loop: `reapCrashOrphans()` (stale parked >1h, re-arm) → `claimDue()` (RPC, real) / read-only SELECT (DRY) → process per-row → **re-arm `next_run_at` in `finally`**. `DRY_RUN = process.env.DRY_RUN === "true"`; exit 0 on clean (incl. zero due), 1 on top-level fatal; per-row errors never change exit.
- `.github/workflows/email-scheduler.yml` — `concurrency.group`, `workflow_dispatch`, env block, and the guard (VERBATIM): `if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}`.
- `claim_due_social_schedules` (01), `claimOnce` (`lib/email/idempotency.ts:48-84` → `social_send_ledger`), `computeNextRunAt` (`schedule-cadence.ts:92-106`).

## Build
1. **`scripts/social/run-schedules.mts`** — clone the email worker. Per claimed schedule:
   - **freshness gate** — compare the brain `freshness_token` for the scope vs the last `social_posts.freshness_token` for this schedule; if unmoved, skip + re-arm (never post stale numbers).
   - `claimOnce(db, "social:" + scheduleId + ":" + yyyy_mm_dd, ...)` (at-most-once).
   - `refreshAccessToken(...)` (03) → `compose` core (01) → `renderSocialImage` (02) → **publish gate**: if `SOCIAL_PUBLISH_ENABLED !== 'true'` write `social_posts.status='dry_run'` and DO NOT call `postToChannel`; else `postToChannel` (03) and record `platform_post_id`.
   - log `social_posts` / `social_events`, re-arm `next_run_at` in `finally`.
   - per-row try/catch (one bad account never breaks the batch); DRY_RUN read-only.
2. **`.github/workflows/social-scheduler.yml`** — mirror `email-scheduler.yml`: own `concurrency.group: social-scheduler`, the `ENGINE_ENABLED` guard verbatim, `workflow_dispatch` for manual DRY runs, env (`SUPABASE_*`, `SDG_CRYPTO_KEY`, platform secrets, `SOCIAL_PUBLISH_ENABLED`). **Cron stays paused (commented) until go-live**; manual dispatch works meanwhile.

## Tests & gates
DRY end-to-end (claims, composes, renders, writes `dry_run`, never calls a connector) · reaper re-arm test · freshness-skip test · exit-code contract test. real-tsc 0, eslint.

## Done =
A DRY-gated cron worker that claims due social schedules, refreshes the client token, composes + renders, and writes `dry_run` posts — flips to live posting on `SOCIAL_PUBLISH_ENABLED=true`, no code change.
