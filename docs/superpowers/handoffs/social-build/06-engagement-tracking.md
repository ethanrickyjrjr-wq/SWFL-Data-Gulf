# 06 — Engagement tracking (the "we track results" half)

| | |
|---|---|
| **Model** | **Sonnet** (clone of the outreach event-ledger architecture) |
| **Stage** | 3 — after 01 + 03 merge |
| **Runs in parallel with** | 04 |
| **CANNOT run with** | **01, 03** — needs the tables + platform read APIs (does not edit them) |
| **Blocked by** | 01 (`social_posts`/`social_events`/metrics view), 03 (platform read endpoints). Real numbers need live posts (post-go-live). |
| **Files (new)** | `scripts/social/poll-engagement.mts`, `.github/workflows/social-engagement-poll.yml`, `lib/social/engagement.ts` |

## Goal
Measure what we post. **Social metrics are PULL, not push** — no webhook for likes/impressions, so we schedule a fetch. Reuse the append-only event-ledger + rollup architecture from outreach.

## Verified anchors
- `social_events` + `social_schedule_metrics` view (built in 01; mirror `docs/sql/20260620_outreach_events.sql` + `outreach_metrics_view.sql`). Dedup on `(platform_post_id, event)`.
- 03's per-platform read endpoints (metrics fetch) + `retrieveTokens`/`refreshAccessToken`.
- `ENGINE_ENABLED` guard line + the `concurrency.group` pattern from `email-scheduler.yml`.

## Build
1. **`lib/social/engagement.ts`** — pure mappers: each platform's metrics response → `SocialEvent` rows (`like|comment|share|impression|click`, `value`, `source='poll'`).
2. **`scripts/social/poll-engagement.mts`** — for recently-published `social_posts` (those WITH a `platform_post_id`), call each platform's read API (via 03), upsert into `social_events` (dedup). **Single fan-out cron** (mirror `daily-rebuild`), not one per platform. `DRY_RUN`-aware; dry posts have no `platform_post_id` → naturally skipped.
3. **Empty-tolerant (Operation Dumbo Drop posture):** some platforms only expose metrics for business/creator accounts and gate impressions — treat missing metrics as empty, never blend blind, never fail the poll on a silent platform.
4. **`.github/workflows/social-engagement-poll.yml`** — `concurrency.group: social-engagement`, the `ENGINE_ENABLED` guard verbatim, cron paused until go-live.
5. **Rollup:** confirm `social_schedule_metrics` surfaces per-schedule engagement. The ops board lives in **swfldatagulf-ops** — do NOT build an ops page here; just expose the view/data.

## Tests & gates
Dedup test (same metric polled twice → one effective row) · empty-platform-tolerant test · poller skips `dry_run` rows · view rollup correctness. real-tsc 0, eslint, migration verified.

## Done =
A scheduled poll writes deduped engagement rows for live posts into `social_events`, rolled up in `social_schedule_metrics`, tolerant of platforms that return nothing — ready for the ops repo to render.
