# Foundation — verified SteadyAPI endpoint surface (live 06/30/2026)

Base: `https://api.steadyapi.com/v1/real-estate` · auth `Authorization: Bearer ${PHOTOS_API}` ·
Cloudflare-fronted (browser User-Agent + `Origin`/`Referer` = `steadyapi.com` required).

**Every endpoint below returned HTTP 200 on our key for SWFL inputs — none tier-gated on Starter.**
(The earlier "only 3 endpoints" was a probe error: guessed non-existent names and mis-read the 404s.)

## Endpoint catalog

| Endpoint | Key params | Returns | Grain | Notes |
|---|---|---|---|---|
| `/search` | location, offset, property_type, beds, baths, min/max_price, show_price_reduced, days_since_reduced, new_construction | property_id, price{amount,reduced_amount}, status, photo_url, source_type, beds/sqft/lot, lat/lon, county_fips, flags{pending,contingent,coming_soon,foreclosure,new_construction,price_reduced,new_listing} | per-listing, **200/page** | **for-sale only** — `status=sold` silently ignored |
| `/rentals-search` | location, offset | rental rows: price{min,max}, beds/baths/sqft ranges, address | per-rental, **20/page** | new asset class |
| `/nearby-rentals` | location | 25 rentals near a point | per-rental | — |
| `/property-tax-history` | propertyId | **list_date**, dated price/sold history, board source_name, 18yr tax_history, building_permits, statistics{price_appreciation} | per-property | source of legacy list_date + sold price/date |
| `/similar-homes` | propertyId, limit | comps: baths_full/baths_half, beds/sqft, AVM estimate, clean address, listing_id, source | per-property | neighbors' baths, not subject |
| `/gallery-similar-homes` | propertyId, listingId, lat, lon, list_price_min/max | comps with photos[] + last_price_change_amount | per-property | — |
| `/housing-market-details` | **zipcode** | median sold/listing/rent, DOM, ppsqft, hotness, list_to_sold_ratio, sold_to_rent_ratio, market_strength | **per-ZIP, 1 call** | feeds market-temperature brain |
| `/price-histogram` | location, status | listing count per $50k band (40 bands) + total_listings | **per-county, 1 call** | feeds price-distribution brain; `status=sold` → 422 |
| `/geo-details` | city_state, limit | all ZIPs + neighborhoods w/ median_listing_price, listing_count | **per-city, 1 call** | — |
| `/neighborhood-market-trends` | propertyId | city + county + neighborhood medians | per-property→geo, 1 call | — |
| `/property-estimates` | propertyId, ranges | AVM (Quantarium + Cotality + Collateral) historical + forecast | per-property | **SKIP — overlaps ZHVI** |
| `/nearby-home-values` | lat, lon, radius, status | stats + properties[] w/ **baths** + estimates + status (sold/off_market/for_sale) | per-radius, **~25/call** | **baths batch + sold comps** |
| `/environment-risk` | propertyId | flood/wildfire/heat/wind/air scores | per-property | **SKIP — overlaps flood-risk brain** |
| `/neighborhood-amenities` | propertyId, radius | schools, amenities, walk/transit scores | per-property | — |
| `/mortgage-rate` | state | daily 30yr fixed (30 rows) | per-state, **1 call** | FL latest 6.396% (06/29/2026) |
| `/property-urgency` | propertyId, listingId | views/saves/ldp_views over 6 periods | per-property | demand signal, deferred |
| `/new-construction` | propertyId, limit | new-construction communities + plans | per-property | — |

## Real SWFL values captured (provenance = realtor.com, as-of 06/30/2026 — SteadyAPI is the access layer, never a surfaced citation)

- **ZIP 33901 (Fort Myers):** median sold $320,000 · median list $339,900 · median rent $1,350 · DOM 87 ·
  ppsqft $225 · list-to-sold 94.15% · market "warm" — one call.
- **Lee County:** median list $399,000 · median sold $355,000 · DOM 87 · ppsqft $240 — one call.
- **Lee price-histogram:** 22,892 listings, 40 bands (bottom $0–50k band = 4,663, i.e. land/lots) — one call.

## Match analysis — "can anything match better?"

**Join by ADDRESS, corroborated by LAT/LON.** No endpoint exposes the local MLS number — SteadyAPI
identifies properties only by realtor.com `property_id` / `listing_id` / M-code / board `source_name`.
So "scrape our MLS# to match SteadyAPI later" buys nothing; the match is address (+ lat/lon, which our seed
already carries). `address_key.py` must be hardened first (directionals, suffixes, unit-smush — see phase 1).
After the one-time match we stamp `property_id` onto our rows → identity is permanent (no re-matching daily).

## Efficiency analysis — "more data for less?"

Two distinct data needs; splitting them is the win:

- **Layer A — per-listing inventory** (the `listing_state` machine): `/search` at 200/page is the densest
  listing feed and already carries property_id + photo + price + status + beds + sqft + lat/lon + flags. The
  only missing field is **baths**, and the cheapest source is `/nearby-home-values` (~25 properties' baths
  per call) — so baths enrich in batches, not one-call-per-property.
- **Layer B — market aggregates**: SteadyAPI already aggregates per-ZIP / per-county / per-city and serves
  it in **one call** (`/housing-market-details`, `/price-histogram`, `/geo-details`,
  `/neighborhood-market-trends`, `/mortgage-rate`). This is the operator decree "aggregate at source —
  never haul raw rows" and satisfies data-protocol rule 4 "read rates as written" — SteadyAPI's published
  median is the source-faithful figure; a median we compute from hauled rows would diverge and be invented.

## Sold & off-market

No bulk sold-search exists (`/search` is for-sale only; `/price-histogram?status=sold` → 422). Sold is
reachable only **per-property / per-radius** — which is the right shape for comps. See `phase-2`.

## Operational constraints (audit's crawl4ai pass on docs.steadyapi.com, 06/30 — validate before relying)

- **Rate limit: 15 req/sec hard cap.** Add a throttle constant to the SteadyAPI client. (Not yet
  independently re-probed — treat as the audit reported it.)
- **Every real-estate endpoint is weight 1** — no hidden per-call multiplier, so the flat-rate budget math holds.
- **No webhooks, no ETag / since-cursor / delta** anywhere → polling is the only option (as assumed).
- **`/search` has a `sort_type` param** not in the table above: `relevant | newest | open-house |
  price_high | price_low | price-reduced`. Opens a real saver: `sort_type=newest` + **early-stop at the
  first already-known property_id** catches new listings in a few pages instead of a full county sweep;
  a cheap `sort_type=price-reduced` pass catches price drops. Status changes (pending/sold/withdrawn)
  still need a full sweep (no "what changed" filter), but that full sweep could then drop to **weekly**.
  ⚠️ **Unproven:** newest-ordering stability for early-stop has NOT been verified — costs 1 test call.
  Do not wire early-stop until that probe confirms a stable, monotonic newest order.
