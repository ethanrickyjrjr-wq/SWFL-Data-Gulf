# 06 — Publish paywall gate

| | |
|---|---|
| **Model** | **Sonnet** (clone of the email usage-meter / 402 pattern) |
| **Stage** | 3 — after 01 AND 03 merge |
| **Runs in parallel with** | 07 |
| **CANNOT run at same time as** | **01** (edits `run-posts.mts` publish path) and **03** (edits the channel adapter). Both must be merged first. |
| **Blocked by** | 01 (runner + `social_posts`), 03 (adapter) |
| **Files** | EDIT: `lib/social/scheduler.ts` (publish step), `lib/social/channels/index.ts`; NEW: `lib/social/usage.ts` (or extend the shared meter); migration to add a `channel` dimension |

## Goal
Mirror the locked monetization model on the social side: **compose / preview / render / download is FREE** (login capture); **auto-publish is the paywall**. In v1 single-tenant the global `SOCIAL_PUBLISH_ENABLED` flag is the effective gate; this build adds the per-user metered gate so Phase-2 payments work with no new wiring.

## Build
1. **Meter:** clone `lib/email/usage.ts:54-167` + `docs/sql/20260612_email_usage_increment_fn.sql`; add a `channel` dimension (or a `social_publish` product line). Period-keyed, **fails OPEN** (never blocks on a meter error).
2. **Gate sequence (copy exactly):** **402-before-work → record-after-success**, as in `app/api/deliverables/[id]/blast/route.ts:86-93,193`. Insert it in `lib/social/scheduler.ts` immediately before `postToChannel` (and in the MCP one-off publish path), so a publish over quota returns 402 and never spends.
3. **Headroom gate, not a counter:** gate on `sent + projected ≤ limit` (`13-email-funnel.md:15-21`), per `user_id` (multi-tenant isolation — already burned once on the email side).
4. **Watermark stays** on free-tier images (owned by 02; just confirm it's present — don't strip on publish).

## Tests & gates
Over-quota publish → 402, no post, no `social_posts` `published` row · under-quota → publishes once, records once · meter-error → fails open (publish proceeds) · per-`user_id` isolation test. real-tsc 0, eslint, **Gate 5 pack/catalog mirror if any pack touched** (likely none).

## Done =
Publishing is metered per user with the email's exact 402-before / record-after sequence; compose/preview/download remain free; the global go-live flag still governs whether anything publishes at all.
