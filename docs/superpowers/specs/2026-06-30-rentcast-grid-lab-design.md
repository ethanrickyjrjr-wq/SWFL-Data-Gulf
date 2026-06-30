# RentCast listings into the email + social grid lab (build-time)

**Date:** 2026-06-30
**Build slug:** `rentcast-grid-lab` · check `rentcast_grid_lab_live_verify`
**Sibling (parked):** `docs/superpowers/handoffs/2026-06-30-rentcast-lake-source-handoff.md` (the "our data" lake lane — later).

## Problem

RentCast (delivered 2026-06-30) hands us real, current SWFL for-sale inventory — price, beds/baths,
square footage, lot size, year built, **days-on-market**, full date-keyed listing/price history, lat/lon,
ZIP, county, MLS name/number — verified live this session. The social grid lab and email lab generate
market content but cannot cite an individual *current* listing, and have no property visual.

Two things RentCast does **not** give us, both verified live this session (RULE 0.4):
1. **No photos.** The delivered `api-schema.json` hallucinated a `photos[]` field; the live API has none.
   Confirmed again 2026-06-30: no aggregator (RentCast, realtor.com RapidAPI scrapers, Street View) gives
   *licensed* photos. The only licensed photo paths are the agent's own upload or their own MLS/IDX feed.
2. **No since-cursor** (matters for the lake build, not here — this build is build-time, a few calls).

## Goal

Wire RentCast into **both** labs at BUILD TIME — no lake table, no daily ingest — so a generated post or
email can cite real, current listings (the four-lane "named source" lane) and feature one listing with a
**Mapbox satellite aerial** as the licensed-now photo answer. One RentCast call per generation; graceful
degrade to today's behavior when the key is missing or the monthly quota (free tier = 50/mo) is hit.

## What we're building

**`lib/listings/` — reusable module (the lake build inherits the client + types later):**
- `rentcast.ts` — `Listing` type (no agent/office PII), pure `normalizeListing(raw)`, and
  `fetchSaleListings({city, state?, status?, limit?})`. Reads `RENTCAST_API_KEY`; header `X-Api-Key`;
  `GET https://api.rentcast.io/v1/listings/sale`; hour-cached; **never throws** — no key / non-200 / 429 → `[]`.
- `aerial.ts` — pure `aerialUrl({lat, lon, ...})` → Mapbox Static Images URL
  (`styles/v1/mapbox/satellite-streets-v12/static/pin-l+e11d48(lon,lat)/lon,lat,16/600x360@2x`), a pinned
  lot aerial. Reads `MAPBOX_TOKEN` (public `pk.`, `styles:tiles` scope); no token / bad coords → `null`.
  URL format pinned against docs.mapbox.com/api/maps/static-images this session.
- `select.ts` — pure: `scopeCity(scope)` (county→anchor city, zip→county→anchor via the Census-verified
  `fixtures/swfl-zip-county.json`, default Cape Coral), `rankListings`, `pickFeatured`,
  `listingsToFigures(listings, asOf, city)` (one aggregate `MarketFigure` + up to 4 concrete, reusing the
  email lab's `MarketFigure` shape + `figuresToPromptBlock`), `featuredContextLine`, `renderListingsBlock`,
  pure `attachFeaturedAerial(card, listing)` (code-set hero photo); plus the impure orchestrator
  `loadListingContext(scope, today)`.

**Wiring:**
- `lib/email/social-calendar/build-week.ts` — `buildWeek` loads listing context once, appends the listings
  block to the shared `lakeContext`, and rotates a featured listing across the weekday posts; each post's
  caption may feature its listing and its card gets that lot's aerial (code-set).
- `lib/email/build-doc.ts` — `buildContentDoc` appends the same listings block to its context, and (only
  when no og:image photo resolved and the build is scoped) sets a featured aerial as the hero.

## Moat / honesty invariants

- Listings are **cited `MarketFigure`s** (source `RentCast (MLS …)`, as-of = `lastSeenDate`). The AI quotes
  them verbatim; the existing "ONLY block: an invented number" prompt rule is unchanged.
- The aerial is **code-set**, never AI-set (the social prompt already forbids the model from setting
  photos), and captioned "Aerial view · {address}" — a satellite image, never implied to be a listing photo.
- `as_of` is `lastSeenDate` formatted MM/DD/YYYY; the SWFL-…-YYYYMMDD token never appears.

## Cost / security

- **Free-tier-safe:** exactly one `listings/sale` call per generation, `revalidate: 3600`. Quota hit (429)
  → `[]`, build proceeds without listings.
- **Key hygiene:** `RENTCAST_API_KEY` lives in `.env.local` for build-time use. It is the vendor-shared key
  flagged in the lake handoff — **rotate at app.rentcast.io and store as a gh secret before any CI/cron use**;
  never commit it. `MAPBOX_TOKEN` is already in `.env.local`.

## Out of scope (fast-follows)

- Precise zip→city (v1 broadens a zip scope to its county's anchor city; listings are still labeled by
  their true address/city, so citations stay truthful).
- The "our data" lake lane (parked handoff) and the BYO MLS/IDX feed = the real-photos upgrade.
