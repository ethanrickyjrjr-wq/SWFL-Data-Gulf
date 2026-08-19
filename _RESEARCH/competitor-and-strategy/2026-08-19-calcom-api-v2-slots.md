# Cal.com API v2 — can we fetch an agent's REAL slots server-side for email buttons? (fetched 08/19/2026 via crawl4ai)

Sources (all crawl4ai, 08/19/2026):
- https://cal.com/docs/api-reference/v2/introduction
- https://cal.com/docs/llms.txt (index — grepped for `slot` and `api key`)
- https://cal.com/docs/api-reference/v2/slots/get-available-time-slots-for-an-event-type.md
- https://cal.com/docs/api-reference/v2/slots/reserve-a-slot.md
- https://cal.com/docs/api-reference/v2/bookings/create-a-booking.md
- https://cal.com/docs/api-reference/v2/access-control.md
- https://cal.com/docs/api-reference/v2/oauth.md
- https://cal.com/pricing
- https://cal.com/docs/enterprise-features/api (redirects to the same intro page — dead link, not a
  separate gated tier page)
- https://github.com/calcom/cal.diy/tree/main/docs/api-reference/v2 (file tree)
- https://raw.githubusercontent.com/calcom/cal.diy/main/docs/api-reference/v2/openapi.json (grepped
  for `/v2/slots` paths)

Builds on `_RESEARCH/competitor-and-strategy/2026-08-19-cal-diy-scheduling-widget-evaluation.md`
(same day, earlier) — that file recommended a static `booking_url` link-out button and explicitly
did NOT investigate fetching real availability. This file is the follow-up: yes, real slots are
fetchable, here's exactly how.

## 1. The endpoint — verbatim from the OpenAPI spec

```
GET /v2/slots
```

Required header: `cal-api-version: 2024-09-04` (omitting it silently falls back to an older
endpoint version — the docs flag this as a common footgun).

Four ways to identify whose slots you want (individual user event types):
1. `?eventTypeId=10&start=2050-09-05&end=2050-09-06&timeZone=Europe/Rome`
2. `?eventTypeSlug=intro&username=bob&start=...&end=...`
3. `?organizationSlug=org-slug&eventTypeSlug=intro&username=bob&start=...&end=...`
4. `?usernames=alice,bob&username=bob&organizationSlug=org-slug&start=...&end=...` (dynamic/group
   event types — 2+ people's combined availability)

Team event types have 3 analogous forms using `teamSlug` instead of `username`. For a **plain free
individual hosted account** the relevant form is #1 or #2 — `eventTypeId` alone is enough once we
know the agent's event type id, or `eventTypeSlug + username` if we only know their public booking
page (`cal.com/<username>/<slug>`).

Required query params: `start`, `end` (ISO 8601, UTC; date-only defaults to start/end of day).
Optional: `timeZone` (defaults UTC), `duration` (for multi-duration event types), `format`
(`time` = default, just start times; `range` = start+end per slot), `bookingUidToReschedule`.

**Response shape** (default `format=time`):
```json
{
  "status": "success",
  "data": {
    "2050-09-05": [
      { "start": "2050-09-05T09:00:00.000+02:00" },
      { "start": "2050-09-05T10:00:00.000+02:00" }
    ],
    "2050-09-06": [ { "start": "2050-09-06T09:00:00.000+02:00" } ]
  }
}
```
With `format=range`, each entry also carries `end`. If nothing's open, `data` is `{}`. This is a
map of real open slots — exactly what's needed to print truthful time buttons instead of guessed
9am/1pm/4pm placeholders.

## 2. Auth — this is the important finding

The OpenAPI spec for `GET /v2/slots` (and for `POST /v2/slots/reservations`, the "reserve a slot"
endpoint) declares **no `Authorization` parameter at all** — contrast with `POST /v2/bookings`
(create a booking), whose spec explicitly lists `Authorization` as `required: false`. Reading the
endpoint descriptions together: slots-lookup is a fully public, unauthenticated GET (it's the same
call the public `cal.com/<username>/<event>` booking page itself makes when a visitor loads it —
no login involved). Reserving a slot and creating a booking are both possible **with or without**
auth (`Authorization: Bearer <token>`, optional); passing a token only unlocks extras (e.g. custom
reservation duration, or attendee details on a "show attendees: false" seated event).

**Practical read: we do not need the agent to hand us anything for the read-only slots call.**
`GET /v2/slots?eventTypeId=<id>&start=...&end=...` against their public event type works
anonymously, same as their own booking page. The one piece of information we need from the agent
is not a credential — it's **which event type** to query: their `username` + `eventTypeSlug` (both
visible on their public Cal.com booking link, e.g. `cal.com/jane-agent/15min`) or the numeric
`eventTypeId` if they give it to us. This is a config value, not a secret.

If we ever want an API key anyway — e.g. to enumerate someone's event types by ID instead of
scraping their booking link — the intro page (`/docs/api-reference/v2/introduction`) says API keys
are self-serve: "You can view and manage your API keys in your settings page under the security
tab" (Settings > Security), with test-mode keys prefixed `cal_` and live-mode `cal_live_`. No
plan-gating language appears on that page. **UNVERIFIED against the pricing page's "Custom APIs"
bullet**, which is listed only under the paid Teams tier (`cal.com/pricing`) — that bullet's exact
scope is ambiguous in the marketing copy (it may mean a different feature, e.g. custom API-triggered
webhooks/workflows, not the base API-key-issuance we found gated nowhere in the docs). The
`/docs/enterprise-features/api` link cited from the pricing footer 404-redirects to the same
ungated intro page, which weakens the case that there's a real "Enterprise API" tier distinct from
what's documented. Net: getting an API key from a free individual account is very likely possible
but not confirmed by crawling docs alone — would need an actual free signup to settle.

Three auth methods total, per the intro page:
1. **OAuth client** ("Continue with Cal.com") — must be created at
   `app.cal.com/settings/developer/oauth`, then is reviewed by a Cal.com admin before activation
   ("An admin from Cal.com will then review your OAuth client and you will receive an email if it
   was accepted or rejected") — not instant, not needed for our read-only use case.
2. **API key** — self-serve, `Authorization: Bearer <key>` header. Not required for the slots GET.
3. **Platform (managed users / Platform OAuth client credentials)** — **DEPRECATED for new
   signups as of 15 Dec 2025**, per the intro page verbatim: "we're currently undergoing a
   restructuring of our 'Platform'-offering... no longer offer new signups for any 'Platform'
   plan." Existing customers get maintenance-only support. This kills the "managed users" idea as
   a forward path for onboarding new agents — it's a closed door, not a design option.

## 3. Rate limits (verbatim, `/docs/api-reference/v2/introduction`)

- API Key: **120 requests/minute**, negotiable up to ~200/min on request, higher (e.g. 800/min)
  possible "with extra charges" via support contact.
- **No authentication provided: default rate limit is also 120 requests/minute** — confirms the
  slots endpoint is meant to be hit anonymously at real volume (this is literally the public
  booking-page traffic pattern).

For our use case (fetch slots once per email build, per agent, per send) 120/min anonymous is not
a constraint at any plausible scale.

## 4. Booking creation — could we one-click-confirm from our side?

`POST /v2/bookings`, header `cal-api-version: 2026-02-25`. `Authorization` is `required: false` —
same public/anonymous pattern as slots. Body needs `start` (UTC ISO), `attendee` object, and either
`eventTypeId` or `eventTypeSlug` + `username`/`teamSlug`. Mechanically we CAN fire a booking POST
straight from an email-click landing page without ever holding the agent's credentials — same as
any anonymous visitor booking through their public page.

**Should we?** Not recommended as a first move:
- It writes to the agent's calendar irreversibly-ish (creates a real meeting, sends real calendar
  invites/notifications) from a single unauthenticated click — no human confirmation step, no CSRF
  protection inherent to a GET-triggered or bare-link flow, and email-link-triggered POSTs are
  exactly the shape prefetch/link-scanners (corporate email security, Outlook Safe Links) are known
  to auto-click, which would silently double-book or spam-book the agent's calendar. UNVERIFIED
  against Cal.com's own idempotency/anti-scanner guidance — no page fetched addressed this
  specifically.
- The safer shape already matches this doc's §1 finding: our email button is a **link to a
  confirmation page we own** (or straight to the agent's Cal.com booking page pre-filled with the
  chosen slot via query params) rather than an in-email POST. Cal.com's own booking pages already
  handle the write step with proper UI confirmation.

## 5. Self-hosted cal.diy — same API surface confirmed

`raw.githubusercontent.com/calcom/cal.diy/main/docs/api-reference/v2/openapi.json` (the exact spec
file shipped in the self-hosted community fork's repo) contains the identical slots paths:
`/v2/slots`, `/v2/slots/reservations`, `/v2/slots/reservations/{uid}`. So the API contract is the
same whether an agent uses hosted cal.com or (per the prior research file) a self-hosted cal.diy
instance — not that we'd point anyone at cal.diy per that file's "do not self-host" verdict.

## Bottom line

**Yes** — `GET /v2/slots?eventTypeId=<id>&start=<date>&end=<date>&timeZone=<tz>` (with header
`cal-api-version: 2024-09-04`) returns an agent's real open slots, works against a plain free
hosted cal.com account, and needs **no credential from the agent at all** for the read — only their
public event type identifier (`username` + `eventTypeSlug`, or numeric `eventTypeId`), which is
config, not a secret, and slots directly into the `booking_url`-style field the prior research
already recommended adding to the brand-profile registry. API keys exist and appear self-serve if
we ever want them for a richer integration (UNVERIFIED against the "Custom APIs" Teams-only pricing
bullet); Platform/managed-user OAuth is a dead end for new builds (deprecated 12/15/2025). One-click
booking-write from the email itself is mechanically possible (auth-optional `POST /v2/bookings`)
but not advised without a human-confirmation landing step, given link-scanner auto-click risk.

Status: research only, nothing built. A build (adding this fetch into the deliverable build path)
would go through `superpowers:brainstorming` + `node scripts/new-build.mjs` per RULE 3.5, and
through the email-build-playbook's field-sourcing ladder (RULE 0.7a) since this is a live third-
party call, not baked prose.
