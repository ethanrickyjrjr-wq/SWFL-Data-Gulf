# 01 — Spine: tables + claim RPC + pure DI cores + go-live switch

| | |
|---|---|
| **Model** | **Sonnet** (clone-and-rename of the email/outreach engine) |
| **Stage** | 1 — start now |
| **Runs in parallel with** | 02 (renderer) |
| **CANNOT run with** | nothing — but it is the **schema + interface owner**; 03/04/05/06 + USER SIDE all depend on it |
| **Merge FIRST** | `lib/social/types.ts` + the migration (small, fast) → unblocks Stage 2 |
| **Files (new)** | `lib/social/types.ts`, `lib/social/{compose,lifecycle,publish,targets,recipients,build-content}.ts`, `scripts/social.mjs`, `docs/sql/2026XXXX_social_*.sql` |

## Goal
Stand up the channel-agnostic backbone by mirroring the email/outreach engine, and the build-now/flip-to-live switch. Everything downstream codes against `lib/social/types.ts`. **Scoped + code-verified** below — these mirror cleanly (the cores are already pure + dependency-injected).

## Build
1. **`lib/social/types.ts` (publish + merge FIRST).** `Platform = 'x'|'facebook'|'instagram'|'linkedin'|'google_business'`; row types `SocialAccount`, `SocialSchedule`, `SocialPost`, `SocialEvent`; `SocialTarget`; `ComposedPost = { caption: string; hashtags: string[]; media: { url: string; ratio: string }[] }`; `SocialPublisher = { post: (batch) => Promise<{ ok: boolean; platform_post_id?: string; error?: string }> }`; the runner DI `Deps`.
2. **Pure DI cores — mirror `lib/email/outreach/*` (verified pure, I/O injected):**
   - `compose.ts` ← `campaign.ts:85-199` (per-target error isolation, never throws past the boundary).
   - `lifecycle.ts` ← `lifecycle.ts` — **drop the drip cursor** (no `step`/`next_send_at`; social is one-shot). Keep `shouldPublish(post, now)` + platform-event mapping.
   - `publish.ts` ← `send.ts:38-98` (`buildSocialBatch` pure + `publishBatches(client, batches)`; inject the real `SocialPublisher` from build 03). **Drop** unsubscribe tokens / CAN-SPAM headers / per-recipient `rid`.
   - `targets.ts`, `recipients.ts`, `build-content.ts` ← same files. `build-content.ts` returns `{ caption, hashtags, freshness, image? }` and keeps the MOAT `.in_scope` gate; **honor place/county/ZIP via `parse-scope` (SCOPE_KINDS already = {zip,place,county})** — do NOT hard-lock to ZIP.
3. **Reuse cadence UNCHANGED:** `import { computeNextRunAt }` from `lib/email/schedule-cadence.ts:92-106` — `computeNextRunAt(spec: CadenceSpec, fromUtc?: Date): Date | null`. Timezone-neutral; drives both engines.
4. **Migrations `docs/sql/2026XXXX_social_*.sql`** (idempotent; run directly via `.dlt/secrets.toml`; verify row counts; `GRANT` + `NOTIFY pgrst`):
   - `social_schedules` (recipe; RLS `auth.uid() = user_id`) — mirror `email_schedules`; cols: platform, cadence/day_of_week/day_of_month/send_hour_et, scope_kind/scope_value, content_template, hashtags, media_kind, next_run_at, last_run_at, status.
   - `social_accounts` (token store; RLS `auth.uid() = user_id`) — schema only here; **03 owns read/refresh**. Cols: platform, platform_account_id, access_token (encrypted), refresh_token (encrypted), token_type, expires_at, scopes[], account_name, status.
   - `social_posts` (published record; service-role) — mirror `outreach_recipients`/`email_sends`: snapshot caption + media_url + platform_post_id + status + posted_at.
   - `social_events` (engagement ledger; service-role) + `social_schedule_metrics` view — mirror `outreach_events` + `outreach_metrics_view`; dedup on `(platform_post_id, event)`.
   - `social_send_ledger` (idempotency; for `claimOnce`) — mirror `email_send_ledger`, UNIQUE(idempotency_key).
   - **`claim_due_social_schedules(p_now, p_limit)` RPC** — mirror `docs/sql/20260612_email_schedule_claim_fn.sql` VERBATIM: `FOR UPDATE SKIP LOCKED`, park-on-claim (`next_run_at = NULL`), returns full rows; service-role only.
5. **GO-LIVE SWITCH.** `SOCIAL_PUBLISH_ENABLED` repo var (default `false`). `scripts/social.mjs go-live|dry|status` mirrors `scripts/engine.mjs` (flip the var). The publish gate itself lives in the worker (04) — this file just ships the switch + status.

## Tests & gates
Cadence reuse smoke · **`claim_due_social_schedules` concurrency test (no double-claim)** · `claimOnce` idempotency test (`lib/email/idempotency.ts:48-84` pattern → `social_send_ledger`) · core unit tests mirrored from `outreach/*.test.ts` · real-tsc 0, eslint, migrations verified.

## Done =
`lib/social/types.ts` merged; the `social_*` tables + claim RPC live; pure cores pass mirrored tests; `node scripts/social.mjs status` reports the switch.
