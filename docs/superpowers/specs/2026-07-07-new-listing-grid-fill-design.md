# New Listing recipe fills its fixed grid from the real listing (photo+price+specs)

**Date:** 2026-07-07
**Check:** `new_listing_grid_fill_live_verify`

## Problem

Typing a listing address into the homepage **New Listing** hero produced an incoherent
email: no property photo, and a hero built from a random nearby comp welded to ZIP
aggregates ("Active listings", "Median list price"). The build named the subject address
"Nearby comp — 16447 Rainbow Meadows Ct" (its own subject leaking into its comp set),
which is the failure `author-doc.ts` already calls "the Rainbow Meadows failure".

Root cause (traced 07/07/2026):

1. The address-only New Listing recipe carries no URL, so `isListingIntent()` is false and
   the rich listing-flyer path (`buildListingFlyer`, in `buildContentDoc`) never fires — it
   is gated on a **pasted URL**.
2. `planArrival` routes the recipe to a **blank** doc + auto-build, which calls
   `authorDoc` → the **free author** (`runAuthorBuild`). That path only knows ZIP market
   figures (`loadMarketFigures`) + nearby **sold comps** (`loadAddressFigures`). It has no
   step that resolves the **subject listing** into a price/spec figure, and its only photo
   source is an og:image from a URL — none present → no photo.
3. The deterministic `new-listing` seed grid (`default-docs.ts`) and the `buildListingFlyer`
   template (the Latitude 26 layout) both already exist — the hero path just drives past
   them into the free author.

## Goal

A typed New Listing address produces the fixed listing flyer — real property **photo**,
**list price**, **beds/baths/sqft** — from the property's own for-sale record, with the AI
writing only the prose paragraph under the existing no-invention lint. Never a photo-less
grab-bag; never an invented number.

## What we're building

**The address lane that pairs with the existing pasted-URL lane — both feed the SAME
`buildListingFlyer`.**

1. **`lib/listings/resolve-subject.ts` (new, pure/DI-testable).**
   `resolveSubjectListing(address) → ListingFacts | null`:
   geocode (Mapbox, reused `geocodeAddress`) → **Lee (12071) / Collier (12021) gate** (the
   SteadyAPI photo footprint) → page the for-sale photo feed (`fetchPhotoListings`, keyed by
   city, `offset` paging, ≤4 pages) → match the subject by **canonicalized street line**
   (`canonStreet`: "16447 Rainbow Meadows Court" ≡ the vendor slug's "…Ct") → build
   `ListingFacts` from that record (photo_url, price, beds, sqft, address). Any miss → `null`.
   Never throws, never invents; the citation stays the SWFL Data Gulf root, never the
   realtor.com permalink.

2. **`build-doc.ts` `authorDoc` — the address-lane branch (early return).**
   When `scope.address` is present AND `isNewListingRecipePrompt(prompt)`
   (`listing-intent.ts`, tight regex: new-listing / just-listed only — NOT coming-soon /
   open-house / just-sold, which carry different framing), resolve the subject and build the
   flyer: mirror the photo through the existing durable-copy root (`mirrorHeroPhoto`),
   `buildListingFlyer(facts, currentDoc)` (keeps the user's brand header/footer/agent-card),
   best-effort ZIP market chart via `buildPromptChart` (a bonus; never blocks). The generic
   free-author path is untouched for every non-listing build.

3. **Miss behavior (operator decision 07/07/2026): ask, don't grab-bag.**
   On a resolve miss (out of footprint, no photo match, no key), return
   `applied:false` + "paste your listing link or add a photo" — NEVER the free author (the
   grab-bag this lane replaces) and NEVER the seed grid's placeholder numbers (that would
   invent). The user pastes a link (→ the existing URL flyer lane in `buildContentDoc`) or
   drops a photo, and the flyer builds with real facts.

4. **Routing:** no revert of `1eb411ed`. `planArrival` still sends the recipe to blank +
   auto-build; we fixed the **destination** (the author path now resolves the subject),
   not the routing.

## Decisions (operator, 07/07/2026)

- On a resolved match → **build immediately**, no confirm step.
- On a miss → **ask the user for a photo OR a website/link**; never ship photo-less.

## Non-goals / v1 limits (honest)

- **Baths & remarks** are absent from the city photo feed → the flyer omits those cells
  (never a zero, never invented). A later enrichment (nearby-values / permalink scrape) can
  add them.
- A listing **not yet syndicated** to realtor.com → miss → the ask. Expected, not a failure.
- Big-city matching pages ≤4×200 then gives up (→ the ask); logged, never silently
  truncated into a wrong house.
- The "See the Listing" CTA links to the SWFL site (no vendor permalink held); editable on
  canvas.

## Verification

- Offline: `lib/listings/resolve-subject.test.ts` — match (Court≡Ct), footprint gate,
  no-match, paging, empty feed, empty input; `isNewListingRecipePrompt` matches new-listing
  but not coming-soon/open-house/just-sold. All deps injected — **no live SteadyAPI call**.
- Live (operator-run, `new_listing_grid_fill_live_verify`): type a real Lee/Collier listing
  address into New Listing → flyer builds with the real photo + price + beds/sqft; an
  out-of-footprint or unsyndicated address → the paste-link/photo ask.
