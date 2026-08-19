# Booking CTA: project-page book-time card + email time-offer buttons

**Date:** 2026-08-19 · **Build slug:** `booking-time-cta` · **Live-verify check:** `booking_time_cta_live_verify`

## Problem

Agents had a saved booking-link slot (the `booking` button role, 08/03/2026) but no surface
used it beyond a single generic button: nothing on the projects page, and emails could not
offer concrete times. Operator decree: "Set it up… TDD the project page… add to email and
offer different times to click in simple way."

## Goal

One provider-agnostic booking link, three consumers: the cockpit Booking card, the email
time-offer stack (real availability, deep-linked per time), and a zero-provider
add-to-calendar fallback. Self-host-ready by construction: a self-hosted Cal instance is just
another URL.

## What we're building

- `lib/booking/` (new one root): `providers.ts` (host-exact provider detection; documented
  deep-link fidelity per vendor — cal.com/Acuity slot, SavvyCal date, rest page-only),
  `calcom-slots.ts` (public /v2/slots, pinned `cal-api-version: 2024-09-04`, 8s abort),
  `time-buttons.ts` (3–5 slot buttons + "See all available times" fallback, ET-labeled),
  `expand-doc.ts` (booking button → stack; one CTA stays one CTA), `offer-times.ts`
  (send-time enrichment, tomorrow→+8d), `calendar-links.ts` (Google render / Outlook
  compose URLs).
- Blast route: enrichment after overlay, before ladder; PDF renders pre-expansion doc.
- Cockpit `BookingCard` (aside chrome) + `lib/project/booking-card.ts` model.
- Overlay Guard 3 + url-lint refinement allowance: a query-only deep link INTO a saved/allowed
  destination is that destination.

Evidence base: ten crawl4ai files under `_RESEARCH/` dated 2026-08-19 (cal.com params/slots/
embeds/self-host, Calendly, provider landscape, time-slot email patterns, button HTML,
realtor scheduling UX, add-to-calendar).

## Failure modes → guards

- Slot deep links stripped by the brand overlay → Guard 3 `isDestinationRefinement`
  (pinned: `button-destinations-wiring.test.ts`).
- Deep links fail the fake-link url gate → refinement allowance in `url-lint.ts` +
  `savedDestinations` allowlist root (found by second-order audit the day it shipped; pinned:
  `lib/booking/blast-chain.integration.test.ts` crossing expand→ladder→render→lint).
- Hung vendor stalls a send past the route deadline → `AbortSignal.timeout(8000)`.
- A/B CTA label stamps over a time label → expansion skipped when a CTA variant test is active.
- Perishable times frozen into a durable file → PDF renders the pre-expansion doc.
- 20-block schema cap rejects the +3-block expansion → logged fallback to the plain button.
- Second CTA appears (§1.8 violation) → stack REPLACES the booking button, never adds.
- Wrong-hour booking → labels formatted in the display zone with the zone printed; cal.com
  `date`/`month` params use the DISPLAY date, not the UTC date (pinned: `providers.test.ts`).

## Deliberately not done (checks open)

- Scheduled lanes (`booking_time_offer_scheduled_lanes`) — DI thread + campaign-sim proof owed.
- Public /p page parity + keyless inline embed (`booking_public_page_embed`) — operator call.
- claim-and-send excluded by design: a self-send offering the agent their own times is noise.
