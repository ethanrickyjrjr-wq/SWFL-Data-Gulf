# Property Watch activation — entry point + live-verify + cron on

**Date:** 2026-07-15
**Check:** `property_watch_live_verify` (already open since 2026-07-07 — no new check; this spec closes it)
**Supersedes nothing** — extends `docs/superpowers/specs/2026-07-07-property-watch-design.md`, which is
the authority for the engine, schema, and Watch-tab UI. This spec covers only what's left to make that
already-built feature live and reachable.

## Problem

Property Watch (nearby comp activity — new listings, price cuts, sales within a radius of a tracked
address, daily digest email) was designed and coded 2026-07-07. Probed 2026-07-15 and confirmed still
true:

- Both GHA workflows (`watch-scan-daily.yml`, `watch-digest-daily.yml`) are dispatch-only, no schedule,
  explicitly parked pending `property_watch_live_verify` — which has never been run.
- The feature works correctly as a tab (`Watch`) inside an existing project's cockpit
  (`lib/project/tool-tabs.ts`, `app/project/[id]/watch/`), but there is no way to START tracking an
  address without first creating a generic project and finding that tab. The project list
  (`app/project/page.tsx`) has quick-create buttons for New Listing, Newsletter, New Listing Socials, and
  Showing Prep (`ShowingPrepButton`) — nothing for "just watch this address."

Operator confirmed (2026-07-15): this is exactly the "track a property with email updates" feature
requested — turn on what's built, do not build subject-listing-status tracking (that's a different,
unbuilt feature and explicitly out of scope here, same as it was out of scope in the original spec).

## Goal

A user can start tracking an address from the project list in one click, and the daily scan + digest
actually run and actually send.

## What we're building

**1. "Track a property" quick-create button** — `app/project/TrackPropertyButton.tsx`, placed in the
same button row as `ShowingPrepButton` on `app/project/page.tsx`. Same shape as `ShowingPrepButton`:
prompts for an address inline, then:
- `POST /api/projects` — `{ kind: "general", title: address, subject_address: address }` (no new `kind`
  value; Property Watch is keyed by the `watch_*` columns on any project, not by `kind`).
- `POST /api/projects/{id}/watch` — `{ mode: "watching" }`. Both the 0.5mi radius and 2% price-cut
  threshold defaults are already applied server-side (`app/api/projects/[id]/watch/route.ts`) when
  `radius_miles`/`price_cut_threshold_pct` are omitted — the button sends neither.
- Routes to `/project/{id}/watch` (not `projectHome()` — a watch-only project should land the user on
  the tab they came here for, not an empty email canvas).
- On failure of either call: leave the form open so the user can retry, same as `ShowingPrepButton`.

No schema changes, no new API routes — both calls already exist and are exercised today by
`WatchClient.tsx`'s own enable flow.

**2. Wire the digest send, then live-verify** (closes `property_watch_live_verify`):

`scripts/project-feed/watch-digest.mts` (lines 85-91, current build) explicitly `throw`s on
`--send WATCH_DIGEST_LIVE=1`: *"the live send seam is not wired in this build — wire it during
property_watch_live_verify."* The 07/07 spec named this deferred work "Resend batch + sender config +
reply token + usage/paywall." This subsection resolves that — every answer below reuses an existing,
already-built pattern (RULE C2: extend, don't invent):

- **Recipient** — `db.auth.admin.getUserById(project.user_id)` → `.user.email`. Same call
  `app/api/webhooks/resend/route.ts`'s `sendAgentAlert` already uses to reach "the agent's REAL inbox
  ... never the newsletter sender_address" (lines 462-470). The digest goes to the project owner, not a
  segment.
- **CAN-SPAM treatment** — full commercial treatment (unsubscribe link + `List-Unsubscribe` /
  `List-Unsubscribe-Post` headers + CAN-SPAM postal address), even though every recipient opted in by
  enabling watch on their own project. Per the FTC's CAN-SPAM compliance guide (verified 2026-07-15,
  ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business): the transactional/
  relationship exemption is content-based, not relationship-based — only 5 narrow categories qualify
  (transaction confirmation, warranty/recall, account-standing change, employment, delivery of
  already-agreed goods), and the guide explicitly warns not to assume an ongoing-relationship message
  qualifies just because the recipient opted in. "New listing near your tracked address" is market
  information, not account status — it doesn't fit any of the 5. Reuse `scripts/email/build-digest.mts`'s
  `DIGEST_SENDER_NAME` / `DIGEST_POSTAL_ADDRESS` / `DIGEST_SENDER_CONTACT` env vars and its
  `List-Unsubscribe` header shape verbatim.
- **Opt-out mechanism** — extend `app/api/unsubscribe/route.ts` (stateless, no-auth, dispatches by
  query param — `id` for contacts, `rid` for outreach, `wid` for weekly-read) with a `pid` branch:
  `unsubscribeWatch(pid)` sets `projects.watch_enabled = false` for that project id. One more branch
  on the existing root, not a new route.
- **Paywall / usage gate** — `lib/email/usage.ts`'s `checkUsageLimit(userId)` (fail-open,
  `billing_subscriptions.tier` → `TIER_LIMITS`) before sending, `recordEmailSent(userId, 1)` after a
  successful send. This is the platform's one existing "send is the paywall" meter (already used by
  `lib/email/scheduler.ts`'s recurring-broadcast lane) — Property Watch's digest is a recurring
  scheduled send of the same shape and gates through the same meter, not a new one.
- **Transport** — `new Resend(process.env.RESEND_API_KEY)` (the sending-access key — safe for a GHA
  cron per `lib/email/marketing-client.ts`'s doc comment; `scripts/email/build-digest.mts` already
  sends this way from a workflow). Add `RESEND_API_KEY` to `watch-digest-daily.yml`'s env block (not
  present today — the file currently declares only `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`).
- **Stamp discipline unchanged from the 07/07 design**: `notified_at` is written only after a 2xx send,
  per-digest, never speculatively.

**Live-verify** (operator-run, real spend, only after the above is built and passes typecheck/tests):
- Enable watch on one real tracked project (via the new button or the existing tab).
- Manually dispatch `watch-scan-daily.yml` — confirm it inserts real `project_events` rows (or zero,
  honestly, if nothing nearby moved) via `insertProjectEvent`, `seed=false` filter applied.
- Manually dispatch `watch-digest-daily.yml` with `send=true` — confirm a real digest email sends for
  that project with accurate, non-fabricated copy (raw facts / direct subtractions only, per the
  original spec's governing constraint), the CAN-SPAM footer renders, the unsubscribe link resolves,
  and `notified_at` stamps correctly on exactly the events included.
- **This is the first live run on this surface — flag to the operator for go-ahead before dispatching,
  per the paid-API-spend rule. Not run silently.**

**3. Flip both GHA workflows to a real schedule** — once #2 passes, replace the "PARKED... dispatch-only,
no schedule" comment + missing `schedule:` trigger in `watch-scan-daily.yml` and `watch-digest-daily.yml`
with a real daily cron (mirroring the `schedule:` shape already used by
`project-feed-change-detection-daily.yml` / `lifecycle-nudges-daily.yml` in the same directory).

## Out of scope

- Subject-listing-status tracking (this specific property going pending/price-cut/sold) — a different,
  unbuilt feature; explicitly ruled out by the operator this session.
- Map visualization, per-event-type radius override — already out of scope per the 07/07 spec.
- Any change to the detection/classification/digest-composition logic — it's already correct.
