# Send-safety floor: blast suppression + CAN-SPAM postal address

**Date:** 2026-07-12

## Problem

The blast lane (`app/api/deliverables/[id]/blast/route.ts`) is where money is (send is the
paywall) and where the domain can burn. Three verified gaps before anyone real gets blasted:

1. **Re-blasting known-bad addresses.** Recipients are filtered ONLY on
   `contacts.unsubscribed` (route line ~175). The webhook (`app/api/webhooks/resend/route.ts`,
   blast branch) logs bounce/complaint events to `email_events` but — by design
   (`lib/email/blast-events.ts`: "never a status flip") — nothing consults them at send time.
   A contact who hard-bounced or hit "report spam" gets re-blasted on the next send.
2. **CAN-SPAM floor not met.** The injected footer hardcodes
   `SWFL Data Gulf · Fort Myers, FL` — not a valid physical postal address. The
   `business_address` machinery exists (`user_brand_profiles.business_address`, 07/03
   migration; `branding-to-tokens.ts` maps it to the ADDRESS token) but does not ride this
   injected footer.
3. **One human, four unsubscribe ledgers, no cross-talk.** `contacts.unsubscribed`,
   `email_subscribers.status`, `weekly_read_subscribers.status`, `outreach_recipients.status`
   each suppress only their own lane. A human who unsubscribed/bounced/complained on any
   platform lane is still blastable via an agent's contact list — all from the same From:
   domain.

## Research (verified in-session via crawl4ai, 07/12/2026)

- Resend `email.bounced` fires only when the mail server **permanently rejected** the email
  (temporary issues are `email.delivery_delayed`, which we don't log). Every `bounced` row in
  `email_events` is therefore a hard bounce — suppress on any bounce, no subtype logic.
  Source: resend.com/docs/webhooks/event-types.
- Resend maintains an **account-level suppression list**: a hard bounce or spam complaint
  puts the address on it, and future sends are suppressed at the transport layer.
  Source: resend.com/docs/knowledge-base/why-are-my-emails-landing-on-the-suppression-list.
  This is a backstop, not a substitute: a Resend-suppressed send still consumes the user's
  paid quota and counts as "sent" in our stats, addresses are manually removable from that
  list, and **unsubscribes in our other ledgers never reach it** (transactional lane has no
  unsubscribe suppression — that exists only for Broadcast audiences).
- CAN-SPAM physical-postal-address requirement previously verified 07/03/2026 (crawl4ai,
  FTC-sourced guide) — recorded in `docs/sql/20260703_user_brand_business_address.sql` and
  `lib/email/CLAUDE.md`. Not re-verified (one verification pass).

## Approaches considered

- **A (chosen): send-time suppression union, events stay append-only.** One authority module
  reads the four ledgers + blast event history at blast time and filters recipients.
  Bounce/complaint stay durable evidence in `email_events`; consent semantics of
  `contacts.unsubscribed` stay clean; cross-ledger coverage by construction.
- **B: webhook flips `contacts.unsubscribed` on bounce/complaint.** Rejected: conflates a
  deliverability fact with a consent choice, loses the append-only evidence property
  blast-events deliberately has, and covers only the blast ledger (no cross-lane reach).
- **C: rely on Resend's account-level suppression.** Rejected as sole guard — see research;
  quota/stats lie to the sender and unsubscribes aren't covered at all.

## What we're building

### 1. `lib/email/suppression.ts` — THE suppression authority (new, one root)

Pure decision core + thin DB wrapper, mirroring the codebase's extract/decide pattern.

- `decideSuppressions(contacts, rows) → Map<contactId, reason>` — pure.
  Suppress a candidate contact when ANY of:
  - `email_events` row with its `contact_id` and `event ∈ {bounced, complained}` (own blast
    history);
  - `outreach_recipients` row with its email and `status ∈ {bounced, unsubscribed}`
    (outreach maps complaint → `unsubscribed`; `engaged` is a positive signal, NOT
    suppression);
  - `weekly_read_subscribers` row with its email and `status ∈ {bounced, unsubscribed}`;
  - `email_subscribers` row with its email and `status ∈ {bounced, complained,
    unsubscribed}`.
  Email matching is case-insensitive (lower/trim both sides). Reason precedence for
  reporting: `complained` > `bounced` > `unsubscribed`.
- `getSuppressedContacts(db, contacts)` — service-role wrapper; four queries, chunked ≤100
  ids/emails per `.in()` (same pattern as the blast route's engagement lookup), `.in()` uses
  the union of raw + lowercased emails. Fail-open per source (a lookup error means "no rows
  from that ledger"), matching the engagement lookup's posture — Resend's account-level
  suppression remains the transport backstop.

### 2. Blast route wiring

- After the contacts fetch: `getSuppressedContacts` → split sendable vs suppressed.
- All suppressed → `400 { error: "no sendable contacts", suppressed }`.
- `email_blasts.contact_ids` records only the contacts actually attempted.
- Response gains `suppressed: [{ id, reason }]` so the send UI can say "N excluded".
- Wave partition/quota/stats operate on the sendable set only.

### 3. CAN-SPAM postal address in the injected footer

- `lib/email/postal-address.ts`: `resolvePostalAddress(branding, profileAddress)` — the
  deliverable's own `branding.business_address` wins (it's what the doc was built with),
  else the account-level `user_brand_profiles.business_address`, else null.
- Blast route preflight (fail fast, before quota/rendering): resolves the address; null →
  `422 { error: "postal_address_missing", message: "…add your business address in Brand
  settings." }`. Builds stay free and ungated — this gates only the SEND, which is already
  the paywall, and the address is the sender's own (lane-4 figure), never invented.
- `withFooter` renders `{senderName} · {postal address}` (HTML-escaped) instead of the
  hardcoded `SWFL Data Gulf · Fort Myers, FL`.

## Out of scope (deliberate)

- **Platform cron lanes adopting the authority** (weekly-read runner, outreach drip runner
  consulting the union in their `shouldSend`) — check opened.
- **`app/api/lab/claim-and-send` footer's postal line** — that lane's sender is the
  PLATFORM; its real postal address is an operator-owned fact we cannot invent — folded into
  the existing operator env check (see checks).
- **Logging Resend's `email.suppressed` webhook events** into `email_events` — would make
  transport-suppressed sends visible in stats; noted, not built (vocabulary change touches
  three lanes).
- **email_contacts vs contacts table reconciliation + vCard parser dedupe** — the union
  authority bridges the LEDGERS at send time; the two-contact-table reconciliation remains
  its own open check.

## Tests

- `lib/email/suppression.test.ts` — pure core: each ledger suppresses; `engaged`/`active` do
  not; case-insensitive email match; unknown contacts pass; reason precedence.
- `lib/email/postal-address.test.ts` — branding wins; profile fallback; whitespace/empty →
  null.
- Route-level behavior verified via `bunx next build` + existing route tests (blast route
  has no test harness today; the new logic lives in the tested pure modules).
