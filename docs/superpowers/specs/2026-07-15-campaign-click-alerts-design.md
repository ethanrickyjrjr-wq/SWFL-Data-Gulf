# Click-triggered agent alerts for listing campaign emails

**Date:** 2026-07-15
**Check:** `campaign_click_alerts_live_verify`

## Problem

The listing-campaign arc (`lib/email/sequence/*`, `ArcStrip`) already logs every click on a
milestone email (Resend tracks it), but nothing DOES anything with that signal — no alert, no
record an agent can see. The click-triggered follow-up system was already researched and designed
in detail on 07/06/2026 (`docs/superpowers/specs/2026-07-06-email-campaign-playbooks.md` +
`2026-07-06-email-campaign-flow-graph.yaml`, both crawl4ai-cited against Follow Up Boss,
ActivePipe, RealScout, Pivota Marketing) — that doc's own Open Items flagged the actual wiring as
"a real feature, not a doc," never built. This spec is that wiring, v1-scoped.

We already ship an agent-alert precedent for a different signal: the Buyer-Intent Reply Sensor
(`lib/email/process-inbound.ts` → `lib/email/agent-alert.ts` → agent's real inbox + `/alerts`
page, keyed on `buyer_intent_events`). This is the same pattern, second trigger.

## What's already true (verified in code + live Resend docs, not memory)

- Milestone sends (`app/api/projects/[id]/sequence/fire/route.ts`) go out as **Resend Broadcasts
  to a Segment** (`POST /api/email/broadcast` → `resend.broadcasts.create`), not the tagged
  `did`/`rid` lanes the outreach and one-off-blast systems use. Verified live
  (`resend.com/docs/api-reference/broadcasts/create-broadcast`, 07/15/2026): `broadcasts.create`
  takes no `tags` param — the `rid`/`did`/`wid` tag-correlation trick those other lanes use does
  not apply here.
- It doesn't need to. Verified live (`resend.com/docs/webhooks/emails/clicked`, 07/15/2026): the
  `email.clicked` webhook payload for a broadcast send already carries `data.broadcast_id`,
  `data.to` (the recipient's address), and `data.click.link` (the exact URL clicked) — no tag
  required.
- `public.email_sends` (`docs/sql/20260613_email_sends.sql`) already persists one row per
  broadcast fire: `user_id`, `schedule_id`, `broadcast_id`. Built for the reply sensor, but
  `broadcast_id` is the exact join key a click event needs too.
- `email_schedules.project_id` exists (`lib/email/schedule-upsert.ts`), so
  `broadcast_id → email_sends → schedule_id → email_schedules.project_id` reaches the project.
- `email_contacts` resolves `data.to[0]` (the clicking address) to a name, scoped to the same
  `user_id`.

Net: every piece needed to turn a real click into a real alert already exists except the wire
between them.

## Goal

When a recipient clicks ANY link in a listing-campaign milestone email, the agent gets a real
email alert — same inbox, same pattern as the reply sensor — within the same webhook round-trip.
No new send lane, no broadcast tagging workaround, no change to the compliance-sensitive broadcast
path itself.

## v1 scope (ship now)

- **Trigger:** any `email.clicked` event whose `data.broadcast_id` matches an `email_sends` row.
  Not restricted to a specific button/link — per the operator's framing, a click IS the interest
  signal; which link was clicked (`data.click.link`) is recorded for future filtering, not gated
  on now.
- **Dedup:** one alert per (contact email, schedule) per calendar day — a recipient clicking the
  same email five times in an afternoon is one alert, not five. Enforced by a DB unique index +
  `ON CONFLICT DO NOTHING` (insert-then-check, not a read-then-write race).
- **Delivery:** reuses the exact `sendAgentAlert` shape already live in
  `app/api/webhooks/resend/route.ts` — agent's real `auth.users.email`, `SWFL Data Gulf Alerts`
  sender, plain-text.
- **Record:** new table `campaign_click_events` (this spec) — the durable row the alert send
  reads and dedups against. `/alerts` page UI unification is a fast-follow, not v1 (the current
  page's copy/columns are reply-shaped; bolting click rows on top is its own small design, not
  worth blocking this on).

## Out of scope for v1 (explicitly deferred, not silently dropped)

- Per-button intent tiers ("Schedule a private showing" = highest-intent vs. a soft link) — the
  data (`click.link`) is captured now so this is a pure filtering change later, no new plumbing.
- The other 7 campaigns in the 07/06 flow-graph (auto-advancing sequences on a click, calendar
  OAuth, social retargeting pixels) — that doc's own Open Items already staged these out; this
  spec is Campaign 8's missing half (the notify edge), nothing more.
- Surfacing click alerts on `/alerts` or a project "Watch" tab — text-email alert only for v1.
