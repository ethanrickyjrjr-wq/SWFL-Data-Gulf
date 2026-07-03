# Weekly-read free taste (Lane D)

**Date:** 2026-07-03
**Status:** DRAFT — provisional defaults chosen where the operator didn't respond to clarifying questions (AFK); flagged inline as `[PROVISIONAL]`. Confirm on review.
**Parent decision:** `docs/superpowers/specs/2026-07-02-commercial-spine-design.md` D3 + Lane D brief. D3 is APPROVED; this doc is Lane D's own build spec, per that doc's instruction that each lane specs itself.
**Research basis:** crawl4ai pull 07/03/2026 of `resend.com/docs/api-reference/emails/send-batch-emails` (batch cap confirmed: "up to 100 emails in a single API call" — matches this repo's existing `CHUNK = 100` in `lib/email/outreach/send.ts`, still current) and `resend.com/docs/api-reference/rate-limit`.

---

## Problem

D3 (`2026-07-02-commercial-spine-design.md`) decided the free taste is a recurring weekly market read, not a one-shot report, and named it as replacing `components/landing/Waitlist.tsx`. Code probe on 07/03/2026 confirms **none of the product exists**:

- `components/landing/Waitlist.tsx` is still live on the homepage (`app/page.tsx:4,25`) — untouched, old launch-notify copy ("Join the Waitlist").
- `DigestSubscribe.tsx` was wired onto the zip-report page by Lane C (commit `3a51f292`) with copy that says **"Subscribe to {zip}'s weekly read"** — but it POSTs to `/api/email/subscribe`, which is the pre-existing **Phase 2 daily digest**: adds the contact to one generic Resend Segment, mirrors to `public.email_subscribers`, and gets swept up in `daily-email-digest.yml`'s single non-personalized broadcast. It reads `scope.zip` for nothing. The label promises "weekly" and "your ZIP"; the backend delivers neither.
- No enrollment→build→send loop exists anywhere for a public opt-in.
- `lib/email/outreach/*` (`demo-cadence.ts`, `lifecycle.ts`, `send.ts`) is real, live, tested cadence + send machinery — but it's shaped for cold B2B prospect outreach (`outreach_recipients`, states `cold_t1→t4→trial_active→converted`, campaign-scoped). Wrong semantics for a public double-opt-in newsletter; good *pattern* to imitate, wrong table to write into.

So: fix the mislabeled zip-report CTA, and build the actual weekly-read product it was promising.

## Goal

Email + ZIP → enrolled → a short, personalized, cited weekly market read for that ZIP, built and sent by our own engine, every week, until they unsubscribe. Every issue ends in "build your own version of this" (the funnel purpose D3 names it for). CAN-SPAM-compliant. Coexists with — does not touch — the existing Phase 2 daily digest.

## What we're building

### Architecture decision

**New, isolated module + table, imitating the shape of `demo-cadence.ts`/`send.ts` without touching `lib/email/outreach/*`.** Two alternatives considered and rejected:

1. **Bend `outreach_recipients` + `demo-cadence.ts` to carry weekly-read subscribers too.** Rejected: `outreach_recipients.campaign_id` is `NOT NULL` (built for prospecting campaigns), and `demo-cadence.ts`'s states model a cold-touch-then-earn-a-trial funnel that has no meaning for someone who already double-opted in. Forcing it in would either add nullable/nonsense columns to a live table or overload states — and it would put weekly-read's rows inside the same table outreach's own conversion metrics/checks already report against, muddying both.
2. **Route every subscriber through the full deliverable engine (`lib/deliverable/build.ts`)** — literally build them a "project" every week. Rejected for v1: that pipeline (brand-theme resolution, narrative-lint, gate-narrative) is built for an authenticated user editing their own project, not for driving thousands of anonymous public rows through it on a cron. D3 explicitly foreshadows this as a later "Both" upgrade once the light version is proven — build the light version first.
3. **(Chosen) New table, new pure cadence module, new send module — reusing only what already fits.** `jitterDays`/date-math from `demo-cadence.ts` are pure and generic (no outreach coupling) — copy the technique, don't import outreach's types. `send.ts`'s batch-build shape (chunk 100, per-recipient unsubscribe URL, `List-Unsubscribe` headers) is proven and CAN-SPAM-correct — reuse the *shape* in a new file scoped to weekly-read, same reason: don't couple to `ComposedMessage`/outreach's campaign types for an unrelated product.

This also narrows the "Lane D has exclusive lock on outreach surfaces" note from the parent spec: this design **does not edit `lib/email/outreach/*` at all**. The only shared-surface touch is `app/api/unsubscribe/route.ts` (adding a third branch) and the Resend account (a new, separate Segment/tag namespace) — both low-conflict. `[PROVISIONAL]` — keep the lock anyway as a safety default since it's still touching the shared unsubscribe endpoint and Resend account other outreach work also touches; relax it once this ships without incident.

### Data model

New table `weekly_read_subscribers` (migration via `Bun.SQL`, per `[[reference_run-migrations-via-bun-sql]]`):

| column | type | notes |
|---|---|---|
| `id` | uuid, default `gen_random_uuid()` | PK |
| `email` | text, not null | normalized lowercase, same helper as `/api/email/subscribe` (`normalizeEmail`) |
| `zip` | text, not null | 5-digit, must pass `resolveZip(zip).in_scope` at insert — same moat gate as the daily-digest endpoint |
| `status` | text, not null, default `'active'` | `'active' \| 'unsubscribed' \| 'bounced'` |
| `next_send_at` | timestamptz, nullable | null = due on the next cron tick (first issue) |
| `issues_sent` | int, not null, default 0 | counter — feeds the eventual "you've had N issues, build your own" nudge and churn metrics |
| `source` | text, nullable | `'homepage' \| 'zip-report'` etc., same pattern as `email_subscribers.source` |
| `consent_text` | text, nullable | canonical wording, server-set only (same pattern as `/api/email/subscribe`) |
| `consent_at` | timestamptz, nullable | |
| `created_at` / `updated_at` | timestamptz | |

Unique constraint on `email` (one active weekly-read subscription per address; re-subscribing with a new ZIP updates the existing row rather than duplicating — same "idempotent upsert" pattern the daily digest already uses).

### Cadence engine — `lib/email/weekly-read/cadence.ts` (pure, no I/O)

Deliberately smaller than `demo-cadence.ts` — no touch sequence, no trial funnel, just "send weekly, forever, until they leave":

```
type WeeklyReadStatus = "active" | "unsubscribed" | "bounced";

shouldSend(subscriber, now): boolean
  // status === "active" && (next_send_at == null || next_send_at <= now)

afterSend(subscriberId, now): { next_send_at: string }
  // now + 6..8 days, jittered per-recipient (reuse the jitterDays technique from
  // demo-cadence.ts — copied, not imported) so a growing subscriber base doesn't
  // all land on the exact same weekly instant and trip Resend's per-second rate limit

onEvent(status, event: "bounced" | "unsubscribed" | "complained"): "bounced" | "unsubscribed" | null
  // any of the three → terminal, no more sends
```

### Content — v1 grain `[PROVISIONAL]`

Reuse the same 3-stat ZIP data already live on the zip-report hero (Home Value / Market Activity / Flood Risk, verified live 07/03/2026 per Lane B's ruling) rather than a full deliverable-engine build. Simplest v1: no new brain wiring, and it's literally what the subscriber saw on the page where they signed up. The email closes with the same "build your own" CTA pattern as `OpenProjectCta` (open a pre-seeded project for their ZIP) — this is the funnel touch D3 names as the point of the whole feature.

### Send mechanics

New `lib/email/weekly-read/send.ts`, same shape as `lib/email/outreach/send.ts`: `resend.batch.send`, chunked at 100 (Resend's hard cap, crawl4ai-confirmed current 07/03/2026), one `to: [email]` per message so content is genuinely personalized per ZIP (not a Segment broadcast — the current daily-digest mechanism is a broadcast and is *why* it can't personalize; that's the concrete reason to route weekly-read through the batch endpoint instead), per-recipient unsubscribe URL substituted into an `{{{RESEND_UNSUBSCRIBE_URL}}}`-style token, `List-Unsubscribe` + `List-Unsubscribe-Post` headers set (Gmail/Outlook one-click, same CAN-SPAM-safe pattern already proven live).

### Cron — `.github/workflows/weekly-read.yml`

Modeled on the existing `outreach-demo.yml` precedent (preview-first, gate-enforced, approval-locked): builds and previews the week's batch, runs the same mechanical pre-send gates outreach already has (unsubscribe token present, sender configured), then **requires manual approval before the actual send** for v1. `[PROVISIONAL — recommended, operator didn't confirm]`: the content pipeline is new and unproven; a human reviewing the first several weeks' output before it reaches real subscribers is cheap insurance against a bad issue going out to everyone at once. Move to auto-send once a few weeks have shipped clean.

### Capture + unsubscribe wiring

- **Fix the existing mislabel**: `app/r/zip-report/[zip]/page.tsx`'s `DigestSubscribe` call (currently posts to `/api/email/subscribe`) gets a new endpoint `/api/weekly-read/subscribe`, or `DigestSubscribe` grows a `product` prop (`"digest" | "weekly-read"`) that switches the POST target — reuse the component, not the backend.
- New `/api/weekly-read/subscribe` route: same shape as `/api/email/subscribe` (normalize email, `resolveZip().in_scope` gate, canonical consent text stored server-side, upsert-on-email), writes to `weekly_read_subscribers` instead of `email_subscribers` + Resend Segment.
- `app/api/unsubscribe/route.ts` grows a third branch (`?wid=<weekly_read_subscribers.id>`) flipping `status` to `'unsubscribed'`, same best-effort/no-auth pattern as the existing `id`/`rid` branches.
- Homepage swap (`Waitlist.tsx` → weekly-read capture) stays Lane B's task per the parent spec's lane map — this build just makes the capture endpoint + component variant available for Lane B to point at.

### Out of scope for v1

- The daily digest (Phase 2) — untouched, coexists as a separate product.
- Full deliverable-engine content (D3's later "Both" upgrade).
- Auto-send without approval (revisit after a clean run).
- Homepage placement (Lane B's job).

## What this gates / depends on

Depends on nothing else in the commercial-spine lane map — independent of D1/D2, and of Lane A/B/C's own files. Must not run parallel with other sessions touching `lib/email/outreach/*` or `app/api/unsubscribe/route.ts` `[PROVISIONAL — kept as a safety default per the note above]`.

Closes toward check `weekly_read_live_verify` (opened 07/03/2026 via `node scripts/new-build.mjs weekly-read`) — live-verify bar: a real email+ZIP submitted through the zip-report CTA lands in `weekly_read_subscribers`, and a manually-approved cron run sends a real, personalized, unsubscribe-working issue.
