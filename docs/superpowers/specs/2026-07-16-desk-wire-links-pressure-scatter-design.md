# Desk wire Zillow links + ZIP pressure scatter

**Date:** 2026-07-16

## Problem

Two gaps on `/desk`, both visible in the 07/16/2026 screenshot review:

1. **The Wire is link-dead except NEWS.** News rows carry `article_url` from the news lake, so
   they render as links. PRICE CUT and CLOSED rows come from our own listing lake
   (`data_lake.listing_state` / `listing_transitions`), which deliberately drops the vendor's
   detail URL (Source B is an incognito source — the host is never committed and never surfaced).
   Result: the two most product-shaped wire items go nowhere.
2. **The Movers card has a large dead area.** THE WIRE (right column) is much taller than
   MOVERS — CORE ZIPS (left column); the two-column grid stretches the movers card to match,
   leaving empty space below the "as of" line.

## Goal

- Every PRICE CUT and CLOSED wire item with a street address links out to the property's page
  on a public portal (operator's explicit pick: Zillow — chosen over the internal ZIP-report
  option with trade-offs on the table).
- The movers dead space becomes one compact, insight-dense chart built entirely from data the
  page already loads.

## Evidence (RULE 0.4 — verified in-session, not memory)

- Zillow address-URL scheme probed live via crawl4ai on 07/16/2026:
  `https://www.zillow.com/homes/4836-SW-29th-Ave-Cape-Coral,-FL_rb/` resolves directly to the
  property detail page (a real CLOSED item from the wire; page showed "Off market", matching).
  Scheme: hyphenated street + city, `,-FL` suffix, `_rb/` terminator. Unofficial contract —
  the slug builder is a single pure function so a format change is a one-file fix.
- `listing_state` columns confirmed in `ingest/pipelines/listing_lifecycle/distill.py`
  (`_STATE_COLS`): street_address, city, zip_code present; **no** listing_url column exists.
- Per-ZIP numeric momentum (price_reduced_share, new_listing_share, active_listing_count,
  county) already loads server-side in `lib/desk/loaders.ts` (`momentum.zips`) — the scatter
  needs zero new queries.

## What we're building

### Part 1 — Wire items link to Zillow

**New pure helper `lib/desk/portal-link.ts`:**

- `zillowAddressUrl(street: string | null, city: string | null, zip?: string | null): string | undefined`
- Returns `undefined` unless both street and city are present (no link → row renders as plain
  text, exactly today's fallback).
- Slugify: strip characters outside `[A-Za-z0-9 ]` (a literal `#` from a unit number would
  truncate the URL path), collapse whitespace, spaces → hyphens.
- Shape: `https://www.zillow.com/homes/{street-slug}-{city-slug},-FL{-zip when held}_rb/`.
  ZIP is appended when we hold it (better disambiguation); street+city alone is the verified
  minimum form.

**Loader wiring (`lib/desk/loaders.ts`):**

- `loadNotableCuts` — already selects street_address/city/zip_code; attach the URL.
- `loadClosings` — add `zip_code` to its `listing_state` join select; attach the URL.

**Provenance seam (`lib/desk/types.ts` + `FlashFeed.tsx` + `FileFlashItem.tsx`):**

- New optional `FlashItem.lookupHref` field — additive, SPEC-B seam untouched.
- `FlashFeed` renders the headline as a link when `href ?? lookupHref` is present; external,
  new tab, same treatment NEWS gets today. `href` (true provenance) wins when both exist.
- `flashNoteText` (the filed-note composer) keeps including **only `href`**. A Zillow lookup
  is a navigation convenience, not the source of the figure — our lake is. Filing a price cut
  must not smuggle a portal URL into a project note that can end up in a client deliverable.
- `sourceLabel` stays "SWFL Data Gulf" on cuts/closings — unchanged.

### Part 2 — ZIP pressure scatter under Movers

**New component `app/desk/_components/ZipPressureScatter.tsx`** (server-rendered SVG, no
client JS, no chart library — matches the hand-rolled house style):

- One dot per core ZIP. X = price-cut share, Y = new-listing share, dot area ∝ active-listing
  count, color distinguishes Lee vs Collier; a null county renders neutral gray (never guessed).
- Same noise guard as the boards above: ZIPs under the movers `minActive` threshold are
  excluded, stated in the caption.
- Hover = SVG `<title>` per dot: ZIP + both shares + active count.
- One code-owned caption line explains the quadrant reading (bottom-right = cuts without fresh
  supply; top-right = churn; top-left = fresh supply without discounting) — descriptive
  association, not a forecast.
- Renders inside the existing `desk-movers` DeskZone below the min-active note, absorbing the
  dead vertical space. Empty-tolerant: fewer than 3 qualifying ZIPs → component returns null.

**Data (`lib/desk/types.ts` + `loaders.ts`):**

- Additive `MoversData.pressure?: Array<{ zip; county; cutShare; newShare; activeCount }>` —
  numeric rows built from the already-loaded `momentum.zips` (both shares non-null, min-active
  filter applied). No new queries, no reshaping of the DeskDatum SPEC-B seam.
- Provenance: same `sourceLabel`/`asOf` the movers zone already states — the scatter adds no
  new figures, only re-plots ones already on the page.

**Design-time gate:** read the `dataviz` skill before writing the chart code (its trigger).

## Testing

- `lib/desk/portal-link.test.ts` (bun): happy path (the live-verified address round-trips to
  the probed URL), unit-number `#B` stripping, missing street/city → undefined, ZIP suffix
  form, whitespace collapse.
- Existing desk render paths are exercised by `bunx next build` (the verify-with-next-build
  rule); no snapshot infra exists for desk components, none added.

## Out of scope (deliberate)

- Movers board ZIP rows / watchlist rows linking anywhere (operator asked about wire items
  only; `/r/zip-report/{zip}` links are an offered follow-up).
- Realtor.com fallback — Zillow's verified form is the single target; the helper isolates the
  contract if that ever changes.
- Any change to news items, the ticker, or filed-note shape beyond the href-only rule above.
