# 07 — Post tracking + engagement poll

| | |
|---|---|
| **Model** | **Sonnet** (clone of the outreach event-ledger architecture) |
| **Stage** | 3 — after 01 AND 03 merge |
| **Runs in parallel with** | 06 |
| **CANNOT run at same time as** | nothing (mostly new files) — but needs 01's tables and 03's platform read APIs |
| **Blocked by** | 01 (`social_posts`/`social_events`/`social_metrics_view`), 03 (platform read endpoints). Real engagement numbers need live posts (post-go-live). |
| **Files** | NEW: `scripts/social/poll-engagement.mts`, `.github/workflows/social-engagement-poll.yml`, `lib/social/engagement.ts` |

## Goal
Measure what we post. **Social metrics are PULL, not push** — there is no webhook for likes/impressions, so we schedule a fetch. Reuse the append-only event-ledger + rollup architecture from outreach.

## Build
1. **Ledger:** populate `social_events` (clone of `docs/sql/20260620_outreach_events.sql`): one row per `(social_post_id, platform_post_id, metric, captured_at)`, metric ∈ `like|comment|share|impression|click`, `source='poll'`, **dedup on provider id + capture window**.
2. **Poller `poll-engagement.mts`:** for recently-published `social_posts` (those with a `platform_post_id`), call each platform's read API (via 03's connectors) and upsert metrics. **Single fan-out cron** (mirror `daily-rebuild`), not one cron per platform. Carries the `ENGINE_ENABLED` job-guard.
3. **Engagement columns nullable / gated:** several platforms only expose metrics for business/creator accounts and often gate impressions — treat missing metrics as Operation Dumbo Drop (empty-tolerant, `source_tag` provenance, never blend blind). Don't fail the poll on a platform that returns nothing.
4. **Rollup:** `social_metrics_view` (clone of `20260620_outreach_metrics_view.sql`) → surface to /ops (the ops board lives in the **swfldatagulf-ops** repo — do not build the ops page here; just expose the view/data).
5. **Dry mode:** dry posts have no `platform_post_id` → the poller naturally skips them. No spend pre-go-live.

## Tests & gates
Dedup test (same metric polled twice → one effective row) · empty-platform-tolerant test · view rollup correctness · poller skips `dry_run` rows. real-tsc 0, eslint, migration verified.

## Done =
A scheduled poll writes deduped engagement rows for live posts into `social_events`, rolled up in `social_metrics_view`, tolerant of platforms that return nothing — ready for the /ops repo to render.
