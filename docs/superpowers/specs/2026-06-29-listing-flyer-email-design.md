# Listing to flyer email: scrape facts, transform layout, scraped comps chart

**Date:** 2026-06-29

## Problem

A user pastes a listing URL into the Email Lab and asks: *"Just got this listing. Build
me an email for my clients describing it and show a chart of similar home sale prices."*
What comes back is a generic SWFL market newsletter: one hallucinated sentence about the
property, then New-Construction / Airport-Traffic / Arts-&-Rec / TDT blocks from the
master dossier, and a macro ZHVI index line mislabeled as the "chart of similar sale prices."

Root cause, confirmed by reading `lib/email/build-doc.ts` + `lib/email/og-image.ts`:

1. **The listing is discarded; only the thumbnail survives.** The sole thing that touches
   the pasted URL is `fetchOgImage()` — it pulls `og:image` + `og:title` and nothing else.
   No price, beds, baths, sqft, remarks. So "describe IT" had zero facts and the model wrote
   filler. (The "Hickory Blvd" in the bad email came from the model reading the address out
   of the URL slug — proof the page body was never read.)
2. **The skeleton is a fixed newsletter and the AI is forbidden to change it.** The fill
   prompt says *"Do NOT add, remove, or reorder blocks."* So the master dossier gets poured
   into whatever generic blocks are on the canvas; there is no property/comps structure.
3. **The chart routes to a brain, not to comps.** `buildChartForQuestion()` matches the
   prompt to a chartable brain → ZHVI. There is no comparable-sales data feeding the chart.

## Evidence (crawl4ai research pass, RULE 0.4)

Probed the real page the user used:
`https://www.beach-homes.com/florida/bonita-springs/27804-hickory-blvd-bonita-springs-fl-34134-lhrmls-03646837`

- A **plain server fetch** (no JS — what a production Node fetch can do) returns 308 KB
  of HTML containing every fact in plain text: `$20,895,000 · 5 beds · 7 baths · 7,453 sqft
  · 0.69 ac lot · built 2021 · Single Family · Waterfront`, plus real MLS photo URLs
  (`cdn.beach-homes.com/images/listings/naplesmls/41/225076926-*.jpeg`).
- The **full marketing remarks** are present ("There are homes with views, and then there
  are homes that become the view… designed by Rich Guzman… built by Potter Homes…").
- The only JSON-LD on the page is an `Organization` block (the brokerage) — **no**
  `RealEstateListing` schema. So a JSON-LD-only parser fails; we read the rendered text.
- **No comps on the listing page** (zero hits for similar/nearby/sold/comparable). True
  sold comps need the MLS; pre-MLS we scrape comparable *active* listings from the same
  site's area page.

Conclusion: production needs only a plain `fetch()` (no headless browser for agent IDX
sites — `og-image.ts` already proves the fetch works) plus an LLM extraction over the page
text. crawl4ai was the research tool; it is NOT used in the product runtime.

## Goal

When the ask is about a specific house and a listing URL is present, the Email Lab produces
a **flyer**: the real hero photo, the real address + price + specs, a description written
from the **actual listing remarks**, and a chart built from **real comparable prices** —
every figure cited, nothing invented. When the ask is not about a house, the existing
newsletter path is untouched.

## What we're building

### 1. Listing scrape → real facts — `lib/email/listing-scrape.ts`

`fetchListingFacts(url): Promise<ListingFacts | null>`

- Plain server `fetch(url)` with the browser UA + SSRF guard already in `og-image.ts`
  (reuse `isSafePublicUrl`, the timeout, the byte cap). Best-effort, never throws.
- Strip the HTML to text (tags removed, scripts/styles dropped; the facts survive as text,
  proven above).
- **Deterministic core (numbers in code — Brain Factory rule 2).** A pure
  `parseListingFacts(html, url)` extracts price/beds/baths/sqft/lot/year/type/photos/address
  with regex over the proven text patterns. No LLM, fully unit-testable against a saved
  fixture, zero per-build cost. The marketing **remarks** are lifted deterministically too
  (the longest descriptive paragraph — proven extractable in the probe).
- **Optional LLM polish (prose only).** A best-effort Haiku pass may tighten the remarks
  into client-ready copy; it NEVER touches a number and NEVER invents — if it fails, the
  deterministic remarks stand. Anything absent on the page → omitted (no placeholder number).

```
ListingFacts {
  address?, city?, state?, zip?,
  price?,            // verbatim string, e.g. "$20,895,000"
  beds?, baths?, sqft?, lotSize?, yearBuilt?, propertyType?,
  remarks?,          // the marketing description, verbatim/lightly trimmed
  photos: string[],  // absolute image URLs found on the page
  sourceUrl: string, // = url (the citation)
}
```

- No-invention: the extractor is instructed lane-3 style — only what is on THIS page;
  cite source = the page URL. A missing field is empty, never guessed.

### 2. Comparable active listings → chart data — `lib/email/listing-comps.ts`

`fetchAreaComps(listingUrl, facts): Promise<Comp[]>`

- Derive the area page from the listing URL path (e.g.
  `…/florida/bonita-springs/<slug>` → `…/florida/bonita-springs`). Plain fetch + text
  strip + Haiku extract of a handful of listings (address, price, beds, sqft) in the same
  area, filtered toward the subject's size/price band.
- Returns cited `Comp[]` (price + label + sourceUrl). Best-effort: `[]` on any failure.
- These are **active** comparables (list prices), not sold — labeled as such. The slot
  upgrades to true RESO **sold** comps once the MLS board is connected
  (see `2026-06-25-mls-reso-integration-design.md`); the chart contract is the same.

### 3. Intent detection — is this about a specific house?

`isListingIntent(prompt): boolean` — true when the prompt contains a listing/site URL AND
house-describe language (listing/property/home/house/just listed/just got + describe/feature).
Cheap heuristic, no model call. False → the newsletter path runs exactly as today.

### 4. Layout transform — start from the flyer skeleton

In `buildContentDoc`, when `isListingIntent`:

- Build the base doc from the existing `skeleton-listing-showcase` seed
  (`lib/email/doc/default-docs.ts`) — header → image → hero → stats(Beds/Baths/SqFt) →
  text → agent-card → button → footer — but **preserve the user's `globalStyle`** (brand
  colors/fonts are user-owned and sticky).
- Fill it deterministically from `ListingFacts`, not from the master dossier:
  - hero.value = price (fits the 24-char cap), hero.label = address, hero.kicker = "New Listing"
  - stats = [{beds, "Beds"}, {baths, "Baths"}, {sqft, "Sq Ft"}]
  - text.body = remarks (clamped to the 2000-char text cap)
  - image = real first listing photo via `heroPhotoBlock` / `upsertHeroPhoto`
  - the chart image slot via `upsertChartBlock` (part 5)
- Return the **new doc** with `applied: true` and `replacedLayout: true` so the client swaps
  the canvas (the existing pushDoc + undo path the social-calendar "Load Card" already uses).
- A short market-context footnote (one signal/text block) may remain, clearly secondary —
  the flyer leads with the property, not the market.

### 5. Comps chart — from the scrape, not the brain

When `isListingIntent`, the chart is built from `fetchAreaComps`, NOT
`buildChartForQuestion`:

- A bar `ChartSpec` of the comp list prices with the subject highlighted, rasterized by the
  existing `chartSpecToEmailImage` (`lib/email/spec-to-png.ts`) → hosted PNG → `upsertChartBlock`.
- Caption cites the source ("active listings near 27804 Hickory Blvd, per beach-homes.com,
  as of MM/DD/YYYY") and states active-vs-sold honestly.
- If `fetchAreaComps` returns `[]`: do NOT fabricate and do NOT mislabel a macro index.
  Fall back to a real bar of the subject's price-per-sqft vs the ZIP median we already hold
  (cited), OR omit the chart with a one-line note. Never "can't chart it"; never invented.

### 6. Wiring + client

- `buildContentDoc` gains the listing branch ahead of the newsletter branch; all existing
  guards (no-invention, freshness, re-validate with `EmailDocSchema`) preserved.
- `app/api/email-lab/ai/route.ts` passes through the new `replacedLayout` flag.
- The Email Lab client applies a returned structure-replacing doc with undo (same path as
  the social-calendar Load-Card flow already on `main`).

## Data sourcing & no-invention (RULE 0.7 / moat)

Four lanes, in order, per figure: our data → user upload → named web → user-stated.
Here the named-web lane is the listing page itself (cited by URL) and the area page (cited
by domain). The subject facts and comps are all real, scraped, cited. The ONLY hard block
is an invented number; a gap drops the field or falls to the next lane, never refused.
As-of dates render MM/DD/YYYY, stated once.

## Testing (TDD — write tests first)

- `listing-scrape.test.ts` — run the extractor against a **saved HTML fixture** of the real
  Hickory Blvd page (committed under `__fixtures__`) → asserts price/beds/baths/sqft/remarks
  extracted, no invented fields when a field is absent. Deterministic (no live fetch in CI).
- `listing-comps.test.ts` — area-URL derivation + comp extraction from a saved area fixture.
- `intent.test.ts` — `isListingIntent` true/false table.
- `build-doc` listing-branch test — given fixed `ListingFacts` + comps, asserts the doc is
  the flyer skeleton, stats/hero/text filled from facts, chart + photo blocks present,
  `globalStyle` preserved, `replacedLayout: true`.

## Out of scope / future

- **RESO sold comps** — when the MLS board is connected, the chart slot swaps active→sold
  comps via `lib/reso/` (separate, already-specced work). This build keeps the chart
  contract identical so that swap is a data-source change, not a redesign.
- Portal pages that hard-block bots (Zillow/Realtor) — degrade to the "confirm these facts"
  path later; agent IDX sites (the common case) work now.
- Photo gallery / multi-image carousel — single hero photo for now.

## Open risks

- LLM extraction over arbitrary listing markup varies by site. Mitigation: strict schema +
  no-invention + the fixture test locks the common case; failure degrades to the newsletter
  path, never to garbage.
- Area-page comp scraping is site-shaped. Mitigation: best-effort `[]` → honest chart
  fallback (part 5), never a fabricated or mislabeled chart.
