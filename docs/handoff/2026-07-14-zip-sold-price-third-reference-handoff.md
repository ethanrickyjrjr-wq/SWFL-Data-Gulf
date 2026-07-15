# Handoff — a real ZIP-grain SOLD price, to settle the list-vs-value gap

**Date:** 2026-07-14
**Trigger:** operator looked at a real `review-reply` build for Cape Coral (33904) and asked why
the median list price ($425,000) sat so far above the ZHVI value figure ($339,699) — a 25% gap,
bigger than a month of index drift explains.
**Nothing built here. This is a state-of-the-world record, verified against code, not memory.**

## The one-paragraph version

The two numbers on the page measure genuinely different things — $339,699 is Zillow's modelled
value index across the whole housing stock; $425,000 is the median ASKING price of only the
homes currently sitting unsold and active (verified straight from `docs/sql/20260712_listing_active_homes_authority.sql`). That's a real, known pattern in a soft market (67-day DOM
here): correctly-priced homes sell and leave the active pool fast, so what's left skews toward
sellers still anchored to stale comps. That's a plausible explanation, not a measured one — the
one number that would actually settle it, a ZIP-grain SOLD median, isn't wired into the figure
feed `review-reply` (and every other recipe) reads from. **It mostly already exists. It just
isn't connected.**

## What's already built and where

`data_lake.leepa_sold_median_by_zip` (`refinery/sources/leepa-sold-median-source.mts`) — Lee
County homes-only SOLD median, PER ZIP, straight from LeePA's recorded-deed sale prices already
live in `data_lake.leepa_parcels`. Homes-only (use_code 01/04, excludes the vacant-land tail that
produced the $35k-at-33972 land-blend elsewhere). Sub-20-sample ZIPs report the county median,
flagged `county_fallback` — never a raw thin-sample ZIP number. Trust tier 2 (county tax roll /
recorded deeds) — arguably a MORE authoritative sold figure than either ZHVI (modelled) or
Redfin's county-level sale price (coarser grain) already in the feed.

`refinery/sources/collier-sold-median-source.mts` exists too — same shape, Collier County. Both
feed `refinery/packs/properties-lee-value.mts` / `properties-collier-value.mts`.

**Neither is wired into `lib/email/market-context.ts`'s `loadMarketFigures`** — the ONE producer
`review-reply.ts`, `sphere-weekly.ts`, `agent-brand-intro.ts` and every other recipe's figures
come from. That function today reads `home_value`/`home_value_yoy` (ZHVI), `median_list`/`dom`/
`active` (the daily listing sweep), and `county_sale`/`county_sold` (Redfin, COUNTY grain only) —
no ZIP-grain sold figure of any kind reaches an email today.

## What NOT to do — the obvious-looking path is broken

Don't build a ZIP-grain sold figure off `data_lake.listing_transitions` (the daily listing
feed's own sold-detection — `to_state='sold'`, `sold_price`, `sold_date` columns all exist and
looked like the natural source). **Check `sales_90d_zip_grain_thin` is already open on exactly
this**: probed 07/12/2026, Lee maxed out at 7 sold/ZIP over 90 days — implausibly low for a ZIP
the size of Cape Coral — and the check says to investigate the sold-detection itself before
trusting any number out of that table. A `zip-listing-activity` concoction already fences the
measure until that's resolved. Building a new figure on top of a table already flagged
under-counting would just import the same bug into a new recipe.

## The scoped next step

Wire `leepa_sold_median_by_zip` (Lee) — and Collier's equivalent once `homes_only_sold_median_live_verify` closes — into `loadMarketFigures` as a new figure key (something like
`zip_sold` / `sold_median`), carrying its own label ("Median sold price — recorded deeds") and
its own `as_of`. That gives `review-reply` a real third point: value (modelled) → sold (what
actually closed, recorded) → list (what's currently being asked). Where sold lands relative to
list and value is the actual, measured answer to "is this gap normal" — not a plausible story.

**First real question to answer before wiring it in:** what's `leepa_sold_median_by_zip`'s own
recency? LeePA deed records post with their own real-world lag (county recording isn't
same-day) — that as-of needs to be read and stated honestly, same as ZHVI's, not assumed fresh
because the underlying parcel ingest happens to run often.

## Open checks already tracking pieces of this — don't duplicate, extend these

- `sales_90d_zip_grain_thin` — the listing-transitions sold-detection bug. Root cause of why
  that path is not the answer here.
- `homes_only_sold_median_live_verify` — Lee built, Collier fast-follow, sitting at live-verify.
  Check its current status before assuming Lee's number is send-ready.
- `market_details_swfl_land_blend_and_dupes` — the land-blend defect `leepa_sold_median_by_zip`'s
  homes-only filter was specifically built to avoid; useful precedent for why the filter matters.

## What this session did

Investigated only, per operator ask ("write a handoff to look into it"). No code touched for
this item. The three PDF rendering fixes and the `askingNow`/inline-citation fixes made earlier
in this session on `review-reply.ts` and `lib/pdf/email-doc-pdf.tsx` are separate, already
shipped locally, and unrelated to this handoff.
