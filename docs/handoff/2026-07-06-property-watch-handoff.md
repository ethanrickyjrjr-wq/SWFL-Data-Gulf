# HANDOFF — Property Watch (radius-based nearby-market tracking)

Not started. Raised by the operator mid-brainstorm on 2026-07-06 while spec'ing PLATFORM_ARC
auto-advance nudges (`docs/superpowers/specs/2026-07-06-platform-arc-auto-advance-nudges-design.md`).
Deliberately kept OUT of that spec — different subsystem, different data model, bigger scope. This
file exists so the next session can brainstorm it properly (per RULE 3.5) instead of re-deriving
context from scratch.

## What the operator described (verbatim intent, lightly cleaned up)

A "your properties" section where ANY address in a user's account — not just one running the
5-step sell campaign — can be tracked for nearby market movement. Example the operator gave:

> A new listing goes up a mile away, or there's a price cut on a nearby address — say its price
> per square foot is now $22, lower than your property's, but that home has 4 bedrooms. We've
> seen homes with pools sell at a higher rate, so being $3 higher per square foot is close to
> where you want to be. An update email with a pool photo would be worth sending now, since your
> listing has been on the market 30+ days.

Then the explicit correction that matters most: **"we don't analyze it, we just send updates on
movement."** That constrains the whole feature — every comparative line has to be a REAL computed
number from held data (a real price/sqft split, a real bed/bath count, a real days-on-market
figure), never a general market claim we can't source ("homes with pools sell higher" is only
sendable if it's an actual computed aggregate from the lake, not an inserted truism). This is the
same four-lane no-invention rule the rest of the platform runs on — just applied to a new surface.

## Two tracking modes (operator's explicit split)

1. **Selling — full marketing updates.** Ties into this session's PLATFORM_ARC nudges (an armed
   `email_sequences` row already gets appeared/holding/sold/time-elapsed nudges).
2. **Just watching — limited updates on price move or sale only.** No campaign, no arc, possibly
   not even the user's own listing (could be a home they're not selling, just curious about the
   neighborhood). Lighter-weight signal, no marketing framing.

## What's already in the codebase that this can build on

- `data_lake.listing_state` carries `lat`/`lon` for every tracked listing (`lib/listings/select.ts`
  already reads this schema via `createServiceRoleClientUntyped()`) — the raw material for a
  radius query exists; nothing computes "what's within N miles of point X" today.
- `lib/listings/select.ts` computes single-listing cited figures (`listingToFigure`,
  `listingsToFigures`) but nothing computes a property-vs-property DELTA (price/sqft difference,
  bed/bath diff) — that's new ground.
- The four-lane sourcing rule (`CLAUDE.md` non-negotiable rule 1) governs what's even sendable
  here: our data → user's upload → named web source → user-stated figure, in that order, never an
  invented number.
- `lib/project/lifecycle-nudge.ts` + `lifecycle_nudges` (this session's build, see the sibling
  plan `docs/superpowers/plans/2026-07-06-platform-arc-auto-advance-nudges.md`) is the address-key
  + lake-join pattern to reuse, NOT the same table — Property Watch needs its own tracked-address
  entity, independent of `email_sequences`.

## Real open questions for the next brainstorm

- **Default radius** — 0.5mi? 1mi? configurable per tracked address?
- **The tracked property's own specs.** If it's not itself an active listing in
  `data_lake.listing_state`, we don't hold its price/sqft/beds/baths at all — a genuine gap. Likely
  needs the user to type these in directly (four-lane "user writes it in" lane), which means a new
  small form/UI, not just a read from the lake.
- **What counts as "nearby-worthy" movement** — every new listing within radius, every price cut,
  every sale? All three? A threshold (e.g., only price cuts over X%)?
- **Send/notification frequency and dedup** — a busy corridor could generate several "nearby"
  events a week; needs the same idempotent dedup-key discipline as `lifecycle_nudges`, but also a
  digest-vs-per-event decision (the existing "daily/per-event digest, not a ping per node firing"
  product decision from `docs/handoff/2026-07-06-campaign-automation-followups.md` likely applies
  here too).
- **Where this lives in the UI** — a new tab/section on `/project/[id]` (command center pattern
  already recommended in the campaign-automation handoff), or its own top-level page.
- **Comparative-claim boundary** — precisely which comparisons are honestly computable today
  (price/sqft, beds/baths, days-on-market against a real held number) vs. which require new
  aggregation work (e.g., "homes with pools sell at a premium" needs a real has_pool column and a
  real computed split — confirm whether the lake even carries a pool flag before promising that
  framing).

## Next step

Brainstorm this properly (superpowers:brainstorming) before writing any spec — this file is
context, not a design.
