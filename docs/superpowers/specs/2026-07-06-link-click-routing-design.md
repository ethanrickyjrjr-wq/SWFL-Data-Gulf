# Link click routing — design

> **BUILT 07/06/2026 — corrections folded in (this note supersedes the design below where they
> differ).** A code probe before building found the original design bound to the wrong system.
> Resolved by targeting the ONE system that exists and sends today: the live cold-outreach drip.
> As-built deltas from the first draft:
> - **Route is `/api/r/<token>`, NOT `/r/<token>`.** `/r/*` is already the report-page namespace
>   (`app/r/[slug]` + zip-report/source/communities/cre/…); a token under `/r/` 404s via the
>   `[slug]` catch-all (`VALID_SLUG` → `notFound()`). The wrapper and the route both use `/api/r/`.
> - **Identity is `rid`/`campaign_id`/`step`, NOT `project_id`/`step_key`/`contact_id`.** The live
>   drip tags `rid` (`outreach_recipients.id`) + `campaign_id` (text) + an integer `step`. The
>   `project_id`/`contact_id` model belongs to the not-yet-built 9-campaign flow-graph system.
> - **Integration is send-side, not compose-time block-walking.** `composeCampaign` renders the drip
>   to HTML from a token template — there is no `EmailDoc` block tree to walk, and `rid`/`campaign_id`
>   aren't joined to a message until the send layer. So a single reusable utility `wrapCampaignLinks`
>   rewrites the CTA URL by exact string match and is called by the drip runner right before
>   `buildBatchMessages` (the same seam that already rewrites the unsubscribe placeholder per recipient).
> - **Unsubscribe is EXCLUDED from the wrap** (reverses decision 2 — see the corrected decision below):
>   it already routes through our own `/api/unsubscribe?rid=` with a one-click `List-Unsubscribe`
>   header; re-wrapping adds a failure hop to the compliance-critical opt-out path.
> - **No new env var:** tokens are HMAC-signed with the existing prod `SDG_COOKIE_SECRET` (the seam
>   `contact-import-token.ts` / `proposal-nonce.ts` already use).
> - **No token TTL:** an email link may be clicked weeks later; a valid-signature link always routes.
> - **`link_events` is justified, not a blind `social_events` mirror:** `outreach_events` already
>   records recipient-grain `sent`/`clicked`; the genuinely new grain is per-link (`button_key`).
>
> As-built files: `lib/email/tracked-links/{token,wrap,redirect}.ts`, `app/api/r/[token]/route.ts`,
> `docs/sql/20260706_link_events.sql` (table LIVE), wired into `scripts/email/outreach-drip-run.mts`.
> Follow-on (one-line each): call `wrapCampaignLinks` in `outreach-demo-run.mts` +
> `outreach-campaign.mts` to extend `sent` inventory to those paths (they already get click capture
> for free once their links are wrapped).

Brainstormed 07/06/2026, following directly from the 9-campaign email/social/MLS flow map
(`docs/superpowers/specs/2026-07-06-email-campaign-playbooks.md` +
`2026-07-06-email-campaign-flow-graph.yaml`). This is sub-project 1 of 3 surfaced that session
(per-link click routing → PLATFORM_ARC auto-advance → attribution windows) — scoped and
brainstormed on its own, per the brainstorming process's decomposition step.

## Problem

Every branching edge in the campaign flow map ("click Yes vs click No," "click Refer-a-friend vs
click See-my-value") assumes we can tell WHICH link a recipient clicked. We can't, today.
`lib/email/outreach/lifecycle.ts` already receives Resend's `email.clicked` webhook, but collapses
every click on every link in an email to one signal: status → `"engaged"`. It doesn't know which
of an email's links (if more than one) was clicked, or which campaign step, project, or contact it
belongs to beyond what the existing `rid` tag already carries.

Verified live 07/06/2026: Resend's own `email.clicked` webhook payload already includes
`data.click.link` — "The URL that was clicked" (resend.com/docs/webhooks/emails/clicked). The raw
capability already exists; our own code just discards the field. This is not a build-click-
tracking-from-scratch project — it's making our links distinguishable and reading a field we
already receive.

## Decisions locked during brainstorming

1. **Multi-button transactional emails are allowed.** Every existing AI-authored recipe
   (`agent-intro`, `sphere-weekly`, etc.) keeps its test-enforced one-button rule. New
   transactional/system emails (the ones sketched in the flow map: "Did you make it?," "What did
   you think?") may carry 2-3 distinct links, told apart by which URL was clicked — not by
   breaking the existing recipe convention, which stays untouched.
2. **Redirect-through-us for content links — unsubscribe EXCLUDED (corrected on build).** Content
   links (the CTA today; buttons/social-icons as they appear) get wrapped for consistent stats.
   Unsubscribe is NOT wrapped: on the drip it already routes through our own
   `/api/unsubscribe?rid=` with a one-click `List-Unsubscribe`/`List-Unsubscribe-Post` header
   (`lib/email/outreach/send.ts`), and the real URL only exists at send (compose carries the literal
   `{{{RESEND_UNSUBSCRIBE_URL}}}` placeholder). Re-wrapping an already-owned opt-out endpoint would
   add a failure hop to the exact compliance-critical path — the opposite of protecting it, and it
   risks desync with the RFC 8058 one-click header. So the wrap SKIPS unsubscribe by construction.
   Grounding for why this needed care at all: the FTC's CAN-SPAM compliance guide (fetched live
   07/06/2026, ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) requires
   "any opt-out mechanism... be able to process opt-out requests for at least 30 days after you
   send your message" and that requests be honored "within 10 business days" — an outage isn't a
   one-time bug, it's a compounding compliance gap for every message sent during the outage window.
3. **Self-describing signed token, not a database lookup, on the redirect's critical path** (chosen
   over two other discussed approaches: plain DB-lookup redirect, and no-mint-time-record). The
   redirect route decodes and verifies a signed token and 302s immediately — no database read
   required to know where to send the user. This generalizes the unsubscribe-isolation principle
   to every link instead of special-casing unsubscribe.
4. **A row is also written at send time** (when the link is minted), not only at click time — so
   click-through rate can be computed as clicks ÷ links actually sent, not just a raw click count.
   This is the one piece of the "DB-lookup" approach worth keeping: an inventory, just not on the
   critical path.
5. **Scope boundary: this project stops at capture + redirect + log.** It does NOT include firing
   the next campaign email automatically when a click comes in — that logic is specific to each
   node in the flow graph and belongs to the PLATFORM_ARC auto-advance sub-project (sub-project 2)
   or individual campaign implementations. This project makes "which link, which contact, which
   step was clicked" answerable; it doesn't decide what happens next.
6. **Built as one reusable utility, not a per-recipe migration.** Any block with a `url` field can
   be wrapped by calling the same function — adoption is "does this recipe's button call the
   wrapper," not a phased rollout plan across recipes.
7. **Scope note (assumption, not explicitly confirmed): email links only for this project.**
   `lib/social/engagement.ts` already polls platform-native metrics (like/comment/share/impression/
   click) per post for social — that's a separate, existing mechanism this project doesn't touch.
   If social posts also need outbound-link routing (e.g., a "link in bio" surface), that's a
   follow-on, not part of this spec.

## Architecture

One append-only ledger table, `link_events` (`docs/sql/20260706_link_events.sql`, LIVE) — the
link-grain sibling of the recipient-grain `outreach_events`. As-built columns: `event_type`
(`'sent'` | `'clicked'`), `recipient_id` (→ `outreach_recipients.id`, the `rid`), `campaign_id`
(text), `step` (smallint), `button_key` (`'cta'` today), `destination_url`, `channel`
(`'email'`), `at`. (NOT `project_id`/`step_key`/`contact_id` — the original draft's columns were
the flow-graph model, which doesn't exist.) Both event types carry the full context independently —
click-through rate is a `GROUP BY` on those columns, no join required. Why a new table rather than
extending `outreach_events`: that ledger already records `sent`/`clicked` at RECIPIENT grain (for
suppression); the click there stays the drip's suppress trigger. `link_events` adds the per-LINK
grain (`button_key`) it structurally lacks, so the two never double-count.

## Components

Each has one job and a narrow dependency surface:

**`lib/email/tracked-links/token.ts`** — pure. `signLinkToken(dest, ctx) → token | null`;
`verifyLinkToken(token) → { ok, dest, ctx } | { ok:false, reason }`. HMAC-SHA256 keyed on the
existing prod `SDG_COOKIE_SECRET` (no new env var), domain-separated `tracked-link:v1`, integrity
via `crypto.timingSafeEqual` BEFORE any payload parse — mirrors `contact-import-token.ts`. No I/O,
no database. No TTL (a stale-but-valid link must still route). No secret → `sign` returns null and
wrapping degrades to shipping the raw untracked link.

**`lib/email/tracked-links/wrap.ts`** — pure. `wrapTrackedLink(html, dest, ctx, origin)` rewrites a
known URL to `${origin}/api/r/${token}` by exact string match (raw + `&amp;`-escaped forms), and
`wrapCampaignLinks(messages, opts) → { messages, minted }` — the single reusable adoption seam
(decision 6): wraps each ready message's CTA and returns the `sent` inventory. NOT a block-walk (the
drip has no `EmailDoc` block tree); NOT unsubscribe (left untouched — see decision 2). Returns new
strings; never mutates input.

**`lib/email/tracked-links/redirect.ts`** — pure decision core. `resolveTrackedRedirect(token,
{siteOrigin}) → { location, log }`: valid → `{ location: dest, log }`; invalid → `{ location:
siteOrigin, log: null }` (fail-closed to homepage).

**`app/api/r/[token]/route.ts`** — the one adapter. `GET`: `resolveTrackedRedirect` → best-effort
`clicked` insert (caught, logged, never blocks) → 302. Zero database READ on the success path (the
token carries everything); the redirect happens whether or not the logging write succeeds.

**Send-side integration** — the drip runner `scripts/email/outreach-drip-run.mts` calls
`wrapCampaignLinks()` on its ready messages right before `buildBatchMessages` (the seam where `rid`,
`campaign_id`, and `step` are already joined to each message — `composeCampaign` doesn't have them),
then fire-and-forget inserts the returned `minted` rows as `link_events` `'sent'`. A failed ledger
write never blocks the send. (`composeCampaign` was the original draft's integration point but is
the wrong seam: it renders HTML with no block tree and no per-recipient id.) The Resend webhook is
UNCHANGED — `email.clicked` still flips status → `engaged` (`lifecycle.ts`); per-link click truth
comes from the redirect route, so the two never double-count.

## Error handling

- Tampered or expired token → safe-fallback redirect (site homepage), not a 400/404 page. An old
  or corrupted link should never dead-end a recipient.
- Both `'sent'`-at-compose and `'clicked'`-at-redirect ledger writes are fire-and-forget: caught,
  logged, and never allowed to fail the primary action (sending the email; redirecting the click).
- The redirect route's only failure mode that matters is signature verification — and that fails
  closed to the safe fallback, never to an error the recipient can't act on.

## Testing

- `token.ts`: pure round-trip test (sign→verify returns the original destination + context);
  tamper test (a flipped byte in the token fails verification cleanly, no throw leaking internals).
- `wrap.ts`: pure test asserting every link-bearing block in a fixture doc gets rewritten and
  every non-link field is untouched (snapshot-style).
- `app/api/r/[token]/route.ts`: request-level tests for the three paths — valid token → 302 to the
  right destination + a `clicked` row appears; tampered token → safe-fallback redirect, no row
  written; malformed token → same safe-fallback path.
- Compose-integration test: mock the ledger insert to throw, assert the email still sends
  (the `ComposedMessage.html` still gets produced and handed off) — the send path must survive a
  broken analytics write.

## Explicitly out of scope

- Auto-firing the next campaign email based on a click (sub-project 2's territory).
- Attribution windows / revenue crediting (sub-project 3 — depends on this project existing first).
- Social post outbound-link routing (assumption in decision 7 — flag if wrong).
- Any UI surface for viewing the resulting stats (the "command center" idea from an earlier
  conversation this session) — this project only makes the data exist; showing it is separate.
