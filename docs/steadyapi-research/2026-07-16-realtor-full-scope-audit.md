# SteadyAPI / realtor.com full-scope audit — 07/16/2026

Operator ask: "realtor.com has a lot of info and tools and data... make sure we are using SteadyAPI in
all the ways possible... figure out how to get Days on Market, Year Built, amenities, everything we
don't have but should." Handed 3 screenshots of a realtor.com listing detail page + a downloaded CSV
(`RDC_Inventory_Core_Metrics_Zip.csv`).

Method (RULE 0.4/0.5): probed our own code first, then crawl4ai'd `docs.steadyapi.com/collection.json`
live (full Postman collection, all 18 real-estate endpoints' documented request/response schemas —
not memory, not the 06/30 catalog doc, which this supersedes/confirms), then live-verified the
screenshot fields against an actual realtor.com listing in a real (non-headless, cookied) Chrome
session, since crawl4ai's headless fetch was hard-blocked by realtor.com's anti-bot wall on both a
search-results page and a detail page (`invalidunblockrequest@realtor.com` block page — Akamai/PerimeterX
class defense). This is the same wall SteadyAPI exists to get around.

## Live-verified ground truth (Chrome, 56 Grey Wing Pt, Naples FL 34113, real listing 07/16/2026)

The screenshot fields ARE real, on-page: `3 beds / 2 baths / 2 cars garage / 1,841 sqft / 7,405 sqft
lot / 1988 year built / $1,902/mo HOA / $171 per sqft`, tags `Open concept living, Beach, Community
golf, Luxury, Water view, Spa or hot tub`, and lower on the page: `8 days on Realtor.com | 2,607 views
| 49 saves`, `Realtor.com checked: a few minutes ago | Listing last updated: Jul 9, 2026 at 6:24 PM
(EDT)`, `Source: Naples, MLS #226024224`. Confirms the screenshots weren't stale — this exact block
still renders live.

## SteadyAPI real-estate — full 18-endpoint field audit (verbatim from vendor docs, live 07/16/2026)

**No endpoint, anywhere, returns:** `year_built`, HOA fee, the actual MLS# (only a board `source.id`
code like "SFCA" — never the number realtor.com displays), or descriptive "tags" like
Waterfront/Den/Beach/Luxury. Confirmed across all 18 endpoints' documented response bodies —
`/search`(v2), `/rentals-search`, `/nearby-rentals`, `/property-urgency`, `/property-estimates`,
`/neighborhood-market-trends`, `/property-tax-history`, `/housing-market-details`,
`/neighborhood-amenities`, `/environment-risk`, `/nearby-home-values`, `/geo-details`,
`/similar-homes`, `/gallery-similar-homes`, `/new-construction`, `/price-histogram`,
`/mortgage-rate`, `/autocomplete`. This is a genuine, permanent vendor gap, not a bug on our side.

**What SteadyAPI DOES have that we don't pull today (all unused — 0 hits across ingest/lib/refinery):**

| Endpoint | Field | Matches screenshot | Grain / cost |
|---|---|---|---|
| `/property-urgency` | `summary.total_views`, `total_saves`, `total_ldp_views` + 6-period trend | **exact match** for "2,607 views \| 49 saves" | per-property, weight 1 — on-demand only |
| `/property-tax-history` | `property_history[].listing.list_date`, `last_status_change_date`, `last_update_date` | `list_date`→ compute DOM; `last_update_date` = **exact match** for "Listing last updated" | per-property, weight 1 — already called for sold-events, but these 3 fields aren't extracted from the same response |
| `/neighborhood-amenities` | schools (rating, distance, assigned), walk/transit scores, nearby POIs | not in screenshots but real, free, per-property | per-property, weight 1 |
| `/geo-details`, `/mortgage-rate`, `/new-construction` | city/ZIP/neighborhood recommender, FL daily mortgage rate, new-construction communities | — | 1 call each, cheap |

`gallery-similar-homes` photos carry a `tags[]` field too, but observed values were generic
(`balcony`/`patio`/`porch`) — not the Waterfront/Den style descriptive tags; unconfirmed whether it
ever emits those on a real SWFL waterfront listing (would need a live probe, not spent here).

**A live `/property-urgency` call to confirm the "2,607/49" match exactly was NOT made** — the vendor
doc schema already answers the question (views+saves fields exist), and per the paid-spend-deliberately
rule this is a first-live-use of that endpoint, flagged here as an approvable next step (one weight-1
call) rather than spent silently.

## What genuinely can't come from SteadyAPI or a scrape — but we ALREADY hold it

`data_lake.parcel_subdivision` (FDOR ingest) already carries `actual_year_built`, `effective_year_built`,
`living_area_sqft`, sale price/date, land value, building/unit counts — confirmed in
`lib/listings/community-lookup.ts`'s 07/15/2026 note (one day before this audit). **Two distinct builds,
not one:**
1. **Neighborhood-typical year built** (rollup into `neighborhood_stats` via `agg.py`) — genuinely a
   one-line SQL addition, per the operator's own note.
2. **This-listing's year built** (the screenshot's "1988") — needs a per-address parcel join through
   the existing `matchSubdivision` address-key machinery, which inherits its fan-out guard (a condo
   tower sharing one street address across 2+ distinct subdivisions → no match, never a guess). Real
   work, existing code, will not resolve 100% of listings — not "one line."

Either way: **zero scraping, zero new SteadyAPI budget** — this is Lane 1 (our own data), the correct
four-lane answer for year_built specifically.

## Marketing/amenity tags (Waterfront, Den, Beach, Luxury, Spa or hot tub, Community golf) — the real gap

Not in any government parcel layer, not in any SteadyAPI field, and realtor.com itself is anti-bot
blocked to headless/unattended fetch (confirmed live today) — so an ingest-scale sweep across our
~35k `listing_state` rows is not currently buildable without either (a) SteadyAPI adding the field
(vendor-side, not ours to fix) or (b) an unattended scraper built to defeat realtor.com's bot defense,
which is a real ToS/reliability risk, not a quick win. This already has an open check
(`community_profiles_zero_coverage`, `data_lake.community_profiles` still 0 rows) tracking a "Phase 2
scrape" — this audit doesn't change that gap's status, just confirms why it's still open. The ONE
place this data IS already reachable: `lib/email/listing-scrape.ts` + `lib/listings/listing-detail.ts`
already parse community features/golf/pool/gated off IDX broker detail pages (John R. Wood, Sotheby's
— NOT realtor.com itself) for the on-demand Email Lab flyer flow, one listing at a time, user-pasted URL.

## The downloaded CSV is already ingested — a subset, not a new source

`RDC_Inventory_Core_Metrics_Zip.csv` (the file downloaded today) is realtor.com's **current-month-only**
snapshot (28,746 rows, single month `202606`, 44 SWFL ZIPs). We already run `market_heat_swfl`
(`ingest/pipelines/market_heat_swfl/`), a monthly cron pulling the **`_History`** variant of this exact
file family (`RDC_Inventory_Core_Metrics_Zip_History.csv` + the Hotness companion CSV) straight from
realtor.com's public S3 bucket, no key needed, full time series back to ~2019-12, SWFL-filtered,
REPLACE write, feeding `refinery/packs/market-heat-swfl.mts`. The downloaded file is a strict subset of
what we already hold automatically. There IS a real, already-scoped gap in the SAME file, documented in
`ingest/cadence_registry.yaml`'s `market_heat_swfl.source_ceiling` (dated 07/08/2026): Avg Listing
Price, Median List Price Per Sqft, Median Listing Sqft, Pending Listing Count (raw), Price Increase
Count, Total Listing Count, Nielsen HH Rank, plus from the Hotness file: Hotness Rank Change/vs-Prev/
vs-CBSA/vs-County, LDP Unique Viewers Per Property vs US — zero extra fetch cost, pure column-selection
gap in `constants.py`'s `CORE_COLUMNS`/`HOTNESS_COLUMNS`.

## Live blockers on anything NEW that hits SteadyAPI (open checks, unrelated to this audit's findings)

- `steadyapi-429-rate-limited` (4d untouched): current `PHOTOS_API` key authenticates but is
  429-throttled — scans discarded, no data lands.
- `steadyapi_quota_unknown` (1d untouched): no rate-limit headers returned; real monthly cap unconfirmed
  from the account dashboard. Explicitly gates "any bulk call."

These block new **bulk** SteadyAPI wiring from actually landing data — they do NOT block the two
safest wins below, which don't touch SteadyAPI's live-call budget at all.

## Ranked punch list (cheapest/safest first) — none of this is built yet, operator to pick

1. **Parcel year_built join** (Lane 1, our own data, independent of SteadyAPI health) — two separable
   pieces per above: neighborhood-typical (1-line SQL) vs. per-listing (real work, existing
   address-match code, partial coverage).
2. **`market_aggregates_details_dropped_fields`** (already an open check) — parse fields already in a
   response we already pay for. Zero new cost.
3. **`market_heat_swfl` column-gap fill** — same file we already fetch monthly, add the 7+4 documented
   ceiling columns to `CORE_COLUMNS`/`HOTNESS_COLUMNS`. Zero new fetch cost.
4. **`/property-urgency` + `/property-tax-history` list_date/last_update_date wiring** — on-demand,
   per-listing, for single-property deliverables (flyers, property-watch, comp-helper) — NOT for the
   bulk 35k-row sweep. This is the direct answer to "days on market / views / saves," gated on the
   quota check above before any new call volume ships.
5. **`/neighborhood-amenities`, `/geo-details`, `/mortgage-rate`, `/new-construction`** — real, free,
   unused endpoints; lower priority, no screenshot asked for these specifically.
6. **Marketing/amenity tags at ingest scale** — genuinely blocked (no vendor field, anti-bot-blocked
   scrape); stays on `community_profiles_zero_coverage` as a Phase 2 decision, not a quick win.

Nothing here has been built. Next step per RULE 3.5: brainstorm whichever item(s) the operator wants
built first.
