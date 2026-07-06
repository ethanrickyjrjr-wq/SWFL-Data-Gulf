# Link click routing — design

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
2. **Redirect-through-us, universally — including unsubscribe.** Every link-bearing block (button,
   footer/unsubscribe, social-icon link) gets wrapped, for consistent stats and because it's easier
   to keep users if they can see the campaigns working. Unsubscribe is not excluded, but its
   redirect route must not share a failure mode with the rest of the system (see Error handling).
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

One append-only ledger table, `link_events`, mirroring the existing `social_events` pattern
(`docs/sql/20260620_social_schema.sql`) rather than inventing a new shape. Columns: `event_type`
(`'sent'` | `'clicked'`), `project_id`, `step_key`, `button_key`, `contact_id`, `channel`
(`'email'` for now), `destination_url`, `created_at`. Both event types carry the full context
independently — click-through rate is a `GROUP BY` on those columns, no join required.

## Components

Each has one job and a narrow dependency surface:

**`lib/email/tracked-links/token.ts`** — pure. `sign(destination, context) → token`;
`verify(token) → { destination, context } | throws`. HMAC-signed using a server-side secret (env
var). No I/O, no database, no knowledge of email docs or routes.

**`lib/email/tracked-links/wrap.ts`** — pure. `wrapLinks(doc, context) → doc'`. Walks every
link-bearing block (`button`, `footer` social/unsubscribe URLs, `social-icons`) and replaces each
`url` with `${origin}/r/${token}`, using `token.ts` for the signing. Returns a new doc; never
mutates the input (matches the existing pure-transform convention in this codebase, e.g.
`lib/email/sequence/state.ts`'s `transition()`).

**`app/api/r/[token]/route.ts`** — the one adapter. `GET`: verify the token (fail → safe-fallback
redirect to the site homepage, never a raw error page); on success, fire-and-forget insert a
`'clicked'` row (caught, logged, never blocks); 302 to the decoded destination. This route must
have zero database dependency on its success path — the redirect happens whether or not the
logging write succeeds.

**Compose-time integration** — `composeCampaign()` in `lib/email/outreach/campaign.ts` (confirmed
07/06/2026: this is where `ComposedMessage[]` gets built, `.html` populated, before
`scripts/email/outreach-drip-run.mts` and equivalent runners hand messages to Resend). Call
`wrapLinks()` on the doc there, before rendering to HTML, and fire-and-forget insert the matching
`'sent'` rows. Same rule: a failed ledger write never blocks an actual send going out.

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
