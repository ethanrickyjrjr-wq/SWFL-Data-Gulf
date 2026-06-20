# 01 — Scheduling spine + go-live switch

| | |
|---|---|
| **Model** | **Sonnet** (clone-and-rename of the email engine) |
| **Stage** | 1 — start now |
| **Runs in parallel with** | 02 (renderer) |
| **CANNOT run at same time as** | nothing — but it is the **schema + interface owner**; 03/04/05/06/07 all depend on it |
| **Must merge FIRST** | `lib/social/types.ts` + the migration (tiny, fast) — unblocks Stage 2 |
| **Files** | NEW: `lib/social/types.ts`, `lib/social/scheduler.ts`, `scripts/social/run-posts.mts`, `scripts/social.mjs`, `.github/workflows/social-scheduler.yml`, `docs/sql/2026XXXX_social_*.sql` |

## Goal
Stand up the channel-agnostic scheduling backbone + the build-now/flip-to-live switch, cloned from the email spine. Everything downstream codes against the interfaces this build publishes.

## Build
1. **`lib/social/types.ts` (publish this first, merge it, then continue).** The shared contract:
   - `Platform = 'linkedin' | 'bluesky' | 'x'`
   - Row types: `SocialAccount`, `PostSchedule`, `SocialPost`, `SocialEvent`
   - `Scope = { kind: 'zip'|'place'|'county'|'corridor'; value: string|null; topic: string|null }`
   - `GraphicModel` (verbatim data for the renderer), `RenderedAsset = { url: string; ratio: string }`
   - `ComposedPost = { caption: string; media: RenderedAsset[]; linkInFirstComment?: string }`
   - `PostToChannelInput`, `PostResult = { platform_post_id: string } | { dry_run: true }`
   - DI `Deps` for the runner: `{ claimDuePosts, resolveAccount, compose, render, postToChannel, recordPost, log }` — **stub `compose`/`render`/`postToChannel` for now**; 02/03/04 implement them.
2. **Migrations `docs/sql/2026XXXX_social_*.sql`** — `social_accounts`, `post_schedules`, `social_posts`, `social_events` + `social_metrics_view`, all `user_id`-namespaced (Phase-2 multi-tenant invariant), idempotent (`IF NOT EXISTS`). Shapes per spec §4.2. Run them directly (`.dlt/secrets.toml` creds), verify row counts, `GRANT` + `NOTIFY pgrst`.
3. **`claim_due_posts` RPC** — mirror `docs/sql/20260612_email_schedule_claim_fn.sql:35-55` verbatim (`FOR UPDATE SKIP LOCKED` + park-on-claim). The no-double-post crown jewel.
4. **`lib/social/scheduler.ts`** — clone the DI processing core from `lib/email/scheduler.ts:282-446` (`processSchedule`) + `:501-539` (`reapOrphans`). Per fire: claim → **freshness gate** (compare brain `freshness_token` vs last `social_posts.freshness_token` for this schedule; if unmoved and `freshness_gate=true`, skip + re-arm, never post stale) → compose → render → **publish** → record → re-arm `next_run_at` in `finally`. Reuse cadence math `lib/email/schedule-cadence.ts:92-106` and idempotency `lib/email/idempotency.ts:48-84` (key `post:<id>:<date>`).
5. **GO-LIVE SWITCH.** `SOCIAL_PUBLISH_ENABLED` repo var (default `false`). In the publish step: if `false`, write `social_posts.status='dry_run'` with the intended caption/media and **do not call `postToChannel`** (zero platform cost). `scripts/social.mjs go-live|dry|status` mirrors `scripts/engine.mjs` (flip the repo var). Connectors are therefore never called in dry mode.
6. **`scripts/social/run-posts.mts` + `.github/workflows/social-scheduler.yml`** — clone `scripts/email/run-schedules.mts` + `email-scheduler.yml`: `concurrency.group`, crash-orphan reaper, DRY_RUN posture, exit-code semantics, and the **`ENGINE_ENABLED` job-guard** (`if: ${{ vars.ENGINE_ENABLED != 'false' || github.event_name == 'workflow_dispatch' }}`).

## Tests & gates
Cadence-math units · **`claim_due_posts` concurrency test (no double-post)** · idempotency test · **DRY end-to-end test** (`SOCIAL_PUBLISH_ENABLED=false` → writes `dry_run`, never touches a connector). real-tsc 0, eslint, `next build`, migrations verified.

## Done =
A cron-driven runner that claims due `post_schedules`, freshness-gates, runs compose+render via stubs, and writes a `dry_run` `social_posts` row — with a one-command go-live flip. `lib/social/types.ts` merged so Stage 2 can start.
