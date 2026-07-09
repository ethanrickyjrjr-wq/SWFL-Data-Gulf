# Engagement-staggered blast sending (warm first, widen +2h)

**Date:** 2026-07-09
**Check:** `engagement_staggered_send_live_verify` (build) · closes `engagement_staggered_send_decision` (decision = BUILD)
**Approval basis:** operator remote-control directive 07/09 ("fix the issues you deemed the most
important" + push authorization), issued after the triage that named this the top candidate.
Brainstorm ran autonomously; approaches + decision recorded here in lieu of the interactive gate.

## Problem

Every blast (`app/api/deliverables/[id]/blast/route.ts`) sends to all selected contacts at once,
in arbitrary order. Both evidence lanes say that's the wrong shape:

- **Google Email Sender Guidelines** (live-pulled 07/09/2026, support.google.com/mail/answer/81126,
  verbatim): "Start with a low sending volume to engaged users, and slowly increase the volume
  over time." and "Send email at a consistent rate. Avoid sending email in bursts."
- **Round-2 social listening** (r/Emailmarketing, 07/09/2026): engagement-staggered sending was the
  poster's #1 tactic — "the single biggest lever, nothing else came close" — for escaping the
  Gmail Promotions tab.

We also cannot compute per-contact engagement today: blast `email_events` rows carry
`resend_email_id`/`did`/`user_id`/`variant` but **no contact linkage** — the batch response ids
are discarded and no tag identifies the recipient.

## Goal

A blast sends to the contacts most likely to engage FIRST (protecting the shared sending domain's
reputation with Gmail), and widens to dormant contacts on a delay — with zero behavior change when
there is no engagement history (new tenants, first sends) and zero new execution infrastructure.

## What we're building

### 1. Contact linkage (prerequisite)

- `blastTags()` gains an optional `contactId` param → appends a `cid` tag (UUIDs survive the
  existing `SAFE` regex; tags ride batch + single sends and return on webhook events — the
  `did`/`variant` pattern already in production).
- `extractBlastAction()` (lib/email/blast-events.ts) reads the `cid` tag → `contactId` on
  `BlastWebhookAction`.
- The webhook blast branch writes `contact_id` to `email_events`.
- Migration `docs/sql/20260709_email_events_contact_id.sql` (idempotent): `contact_id uuid`
  column + `(user_id, contact_id)` index. Run directly via Bun.SQL per RULE 1.
  `database-generated.types.ts` extended by hand in the same style as `variant`/`did`.
- **No backfill is possible** — historical events have no recipient mapping. The corpus accrues
  from the first post-ship blast; the feature ramps with it. Stated honestly, not hidden.

### 2. Partition rule (pure, `lib/email/blast-stagger.ts`)

Per contact, from that tenant's `email_events` rows (`user_id` + `contact_id in (...)`):

- **dormant** := `delivered` events ≥ 2 AND zero `opened`/`clicked` events, ever.
- **wave 1** := everyone else — engaged contacts, brand-new contacts, thin history (< 2
  deliveries). "Unknown" is NOT "cold": a contact we've never emailed goes first. Contacts with a
  `bounced` event are classified wave 2 regardless of delivered count (no reason to lead with a
  known-bouncy address; suppression itself stays out of scope v1).

Cold-start invariant: zero event rows → zero dormant → wave 2 empty → behavior identical to today.

### 3. Send mechanics (blast route)

- **Wave 1**: existing `resend.batch.send` path, unchanged, sends immediately.
- **Wave 2**: per-recipient `resend.emails.send({ ...msg, scheduledAt })` where
  `scheduledAt = now + 2h` (ISO 8601). Vendor facts verified live 07/09/2026: the batch endpoint
  does NOT support `scheduled_at` ("not supported yet" — resend.com/docs/api-reference/emails/
  send-batch-emails; SDK 6.16.0: `CreateBatchEmailOptions = Omit<..., 'scheduledAt'>`,
  index.d.cts:635), single sends DO (`scheduledAt?: string`, index.d.cts:587); team rate limit is
  **5 req/s default** (api-reference/introduction, verbatim). Wave 2 paces at 4/s (250ms spacing).
- **Deadline guard**: wave-2 scheduling stops when the elapsed-time budget runs out (15s before
  the route's `maxDuration`); dormant contacts not yet scheduled are sent immediately in
  wave-1-style batches ("overflow") and reported. Deterministic degrade, no timeout, no
  plan-tier assumption. At 4/s inside the 120s budget the guard only bites above ~380 dormant
  contacts in one blast (max 500 contacts).
- PDF-attachment sends (already per-recipient) keep today's loop for wave 1 and add
  `scheduledAt` for wave 2 — same loop, same pacing.
- Quota: wave-2 sends are committed sends — counted in `recordEmailSent` at request time, same as
  today. Response shape gains `scheduled` (wave-2 count) alongside `sent`/`failed`; activity-log
  detail carries `{ sent, failed, scheduled }`.
- Split-test cohorts (`cohortIndex`) are orthogonal: variant selection stays per-contact and
  identical in either wave.

### 4. Explicitly out of scope (v1)

- No UI beyond the response fields (the send modal lives in files other live sessions hold;
  surfacing "N now, M scheduled" there is a follow-up — tracked as a check if not done here).
- No bounce suppression list, no configurable delay, no multi-step widening (2 waves only), no
  cancel-scheduled-send surface, no cron-carried waves (approach B).

## Approaches considered

- **A. Vendor-scheduled two-wave send (CHOSEN)** — engagement partition + `scheduledAt` single
  sends for the dormant wave. No new execution surface, no idempotency machinery, degrades to
  today's behavior with no data. Cap bounded by rate limit × function budget, handled by the
  deadline guard.
- **B. Cron-carried wave 2** — `email_blasts` wave rows claimed by the schedules runner. Handles
  arbitrary sizes but adds a second execution surface for the same blast (double-send risk on
  retry), delay quantized to cron cadence, and much more code. Revisit only if real blasts
  regularly trip the deadline guard.
- **C. Ordering-only** — engaged-first batch ordering with no time gap. Trivial but does not
  implement the tactic (all batches land within seconds); rejected.

## Testing

- `blast-stagger` partition (bun:test): engaged/new/thin-history → wave 1; ≥2 delivered + no
  opens → wave 2; bounced → wave 2; empty corpus → all wave 1.
- `blast-tags`: `cid` appended, sanitized, absent when no contactId given.
- `blast-events`: `cid` extracted; absent tag → `contactId` undefined; did/variant behavior
  unchanged.
- Route-level: `bunx next build` green (typed client makes the new column a compile-time fact);
  live verify = `engagement_staggered_send_live_verify` (operator-run real blast: wave-2 emails
  visible as scheduled in Resend, land +2h, events carry `cid`).
