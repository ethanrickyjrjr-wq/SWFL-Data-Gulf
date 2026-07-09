# Deliverability diagnostic panel — design

**Status:** spec, not built.

## What exists today (probed, not assumed)

- Domain registration + verification is **fully built server-side** —
  `app/api/email/domain-verify/route.ts` registers a domain with Resend,
  polls `resend.domains.get`, and persists `dns_records` (jsonb) +
  `domain_verified` (bool) on `public.email_sender_config`. It reads Resend's
  live `DomainStatus` enum correctly (`not_started | pending | verified |
  partially_verified | partially_failed | failed | temporary_failure`,
  verified live against Resend's docs 2026-07-08).
- **Nobody consumes this.** Grepped `app/` and `components/` — zero files
  read `dns_records` or `domain_verified` for display. The backend exists;
  there is no page.
- Resend's `dns_records` covers **SPF and DKIM only**. DMARC is explicitly
  NOT part of that payload — Resend's own onboarding docs
  (`resend.com/docs/add-a-domain`, step 8) tell the user to add a DMARC
  record themselves *after* verification, as a separate manual step. Our
  panel is the first thing that would actually check whether they did.
- One-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post` headers)
  is **already shipped** — `lib/email/outreach/send.ts` and the blast route
  both send it. This is a static fact to surface, not something to build.
- CAN-SPAM physical address is **already tracked** — `lib/email/CLAUDE.md`:
  the footer's `address` field is populated from the brand profile's
  `business_address`, and the lab already nudges (non-blocking) when it's
  empty. The panel surfaces this as a checklist line, doesn't reinvent it.
- Bounce/complaint events are **already captured** per-event in
  `email_events` / `outreach_events` (`app/api/webhooks/resend/route.ts`,
  `lib/email/outreach/lifecycle.ts` — `mapResendOutbound` maps `email.bounced`
  → `bounced`, `email.complained` → `complained`). Nothing aggregates them
  into a rate today.
- Existing settings-page convention: `app/settings/mls/` and
  `app/settings/mcp/`, each a `page.tsx` + `<name>-settings-client.tsx`. New
  work follows this pattern rather than inventing a new one.

## Current authoritative thresholds (verified live, 2026-07-08)

Per Google's `support.google.com/mail/answer/81126` (updated for the Feb 2024
bulk-sender requirements, still current):

- All senders: SPF or DKIM required; TLS required; valid forward+reverse DNS.
- Bulk senders (5,000+/day to Gmail): SPF **and** DKIM **and** DMARC required,
  plus one-click unsubscribe on marketing mail.
- Spam rate (Postmaster Tools): **keep under 0.10%**, never let it reach
  **0.30%** — 0.30%+ is the hard "your mail gets blocked/spam-foldered" line.
- Google doesn't expose bounce-rate thresholds directly, but industry
  convention (and what this panel uses) treats a **hard bounce rate above 2%**
  as a hygiene problem worth flagging — sustained hard bounces are exactly
  what damages sender reputation with every major mailbox provider.

These are the numbers the panel's red/yellow/green thresholds are built from
— not invented, cited to the source in the UI copy itself (small "per Gmail's
sender guidelines" line, dated).

## Architecture

### New page: `app/settings/deliverability/`

`page.tsx` (server) + `deliverability-settings-client.tsx` (client), matching
the `mls`/`mcp` pattern exactly.

### Data assembly — one new route, `app/api/email/deliverability-status/route.ts`

Read-only aggregator (GET only — this is a status view, not a mutation
surface; registration/polling stays exactly where it is in
`domain-verify/route.ts`, this route only reads):

1. **Domain + DNS** — reads the user's `email_sender_config` row
   (`resend_domain_id`, `domain`, `domain_verified`, `dns_records`) — no new
   Resend call, this is already fresh from the existing poll path. Renders
   each SPF/DKIM record's own `status` field (Resend already reports per-
   record pass/fail, not just an aggregate).
2. **DMARC** — the one genuinely new check. A DNS TXT lookup for
   `_dmarc.<domain>` using Node's built-in `dns/promises.resolveTxt` (no new
   dependency — this is a standard library DNS resolver, appropriate here
   since it's a one-shot read-only diagnostic, not a hot path). Presence +
   a parsed `p=` policy value (`none | quarantine | reject`) is the whole
   check. Absent record → red ("not set up — Gmail requires this for bulk
   senders"). Present with `p=none` → yellow ("set up but not enforcing").
   `p=quarantine`/`p=reject` → green.
3. **Bounce/complaint rate** — aggregates `email_events` for this user's
   sends over a rolling window (last 1,000 sends or last 30 days, whichever
   is smaller — bounded query, no full-table scan). `bounced / delivered` and
   `complained / delivered` against the thresholds above.
4. **Static checklist** (no live check needed, just read the known facts):
   one-click unsubscribe (always true — platform-level, not per-tenant),
   CAN-SPAM address (read `branding.business_address` presence, same field
   the lab already nudges on).

### UI

A simple pass/fail/warn list, not a dashboard — this mirrors the "plain
text, no tables" answer convention already locked for the product's
user-facing surfaces (`feedback_no-blockquotes-tables-plain-text`), applied
here to an internal settings page in the same spirit: a stacked list of
status lines, each with a one-line "why" and, when red, a one-line fix
("Add a DMARC TXT record at `_dmarc.yourdomain.com`" with a copy button —
mirrors how `domain-verify` already hands back copy-paste DNS values).

## Error handling

- No domain registered yet → the page shows one CTA ("Verify your sending
  domain first") instead of five red lines — an unregistered domain isn't a
  failing domain, it's a not-started one.
- DNS lookup for `_dmarc` times out or errors → shown as "couldn't check
  right now" (distinct from "not set up"), never silently treated as absent.
- Zero sends in the window → bounce/complaint rates show "not enough send
  history yet," never a fabricated 0%.

## Testing

- Pure: the threshold-classification function (rate → red/yellow/green) and
  the DMARC TXT parser (`p=` extraction) are unit-tested with fixture
  strings — no live DNS in tests.
- The aggregation query (event counts → rates) is tested against a seeded
  fixture set the same way other `email_events`-reading code in the repo is
  tested.
