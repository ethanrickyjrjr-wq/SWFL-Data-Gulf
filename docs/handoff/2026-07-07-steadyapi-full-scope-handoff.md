# HANDOFF — SteadyAPI: we're only seeing ~59% of SWFL's real inventory, and it's an easy fix

**Status:** Two real findings this session, both live-verified (RULE 0.4, crawl4ai + direct probe
calls), neither built yet. This is the todo list — nothing below is done except the property_type fix.

## Why this handoff exists

Operator caught the real question mid-session: I'd verified the property_type fix on only Naples and
Fort Myers and called it done, then got asked "why only Fort Myers? What about Cape, North Fort Myers,
Bonita Springs, Estero, any other Lee or Collier name? Is city-by-city even the right way to search?"
That question led straight to a much bigger finding than the property_type bug. Both are recorded here
so neither gets lost.

## FINDING 1 (the big one): 3 of our 6 in-scope counties aren't ingested by ANY SteadyAPI pipeline

CLAUDE.md's own SCOPE section names 6 counties: Charlotte (12015), Collier (12021), Glades (12043),
Hendry (12051), Lee (12071), Sarasota (12115). Checked all three SteadyAPI-fed ingest pipelines against
that list:

- `ingest/pipelines/listing_lifecycle/constants_api.py` `IN_SCOPE_FIPS` — **Lee, Collier, Hendry only**
- `ingest/pipelines/rentals/constants.py` `COUNTY_LOCATIONS` — **Lee, Collier only**
- `ingest/pipelines/market_aggregates/constants.py` `_IN_SCOPE_COUNTY_FIPS` — **Lee, Collier only**

Charlotte, Glades, and Sarasota are NOT missing by decision — there's no doc, no locked call, no ODD
scaffold parking them. They're just never been added since the original Lee+Collier v1 (Hendry got
added later, 07/02, as a one-off widening; the other two never did). Live-verified real inventory
sizes (`GET /search?location={County}-County_FL`, one call per county, ~30 total calls):

| County | For-sale listings (live, 07/07/2026) | Currently ingested? |
|---|---:|---|
| Lee (12071) | 22,360 | ✅ yes |
| Collier (12021) | 7,986 | ✅ yes |
| Charlotte (12015) | **11,439** | ❌ **no** |
| Glades (12043) | 231 | ❌ no |
| Hendry (12051) | 1,080 | ✅ yes |
| Sarasota (12115) | **10,351** | ❌ **no** |
| **6-county total** | **53,447** | **31,426 captured (59%)** |

Charlotte alone has more listings than Collier. Sarasota alone has more than Collier too. We're missing
**22,021 listings** — more than what we currently hold for Lee. This isn't a rounding error, it's a
structural scope gap that predates this session and applies to inventory, rentals, and market
aggregates alike.

**Property-type breakdown for all 6, captured now while the trial's live** (same 4-filter method as the
property_type fix, run at county grain):

| County | single_family | condos | townhomes | multi_family | land+other (implied) |
|---|---:|---:|---:|---:|---:|
| Lee | 9,825 | 3,104 | 391 | 509 | ~8,531 |
| Collier | 3,664 | 2,822 | 154 | 50 | ~1,296 |
| Charlotte | 3,795 | 665 | 62 | 132 | ~6,785 |
| Glades | 76 | 3 | 0 | 2 | ~150 |
| Hendry | 412 | 2 | 1 | 0 | ~665 |
| Sarasota | 4,847 | 1,828 | 326 | 111 | ~3,239 |
| **6-county total** | **22,619** | **8,424** | **934** | **804** | **~20,666** |

## FINDING 2: city-by-city (`SWFL_CITY_SEED`) was never the only way, and it's not even the most
## complete way — county-level location slugs work directly

Tested `location={County-Name}-County_FL` against `/search` directly. Works for all 6 counties, each
one cleanly scoped to its own `county_fips` (spot-checked 20 rows/county, zero cross-contamination),
**in ONE call instead of N calls per county's city list**. It's also MORE complete than our curated city
list: Lee's county-level total (22,360) is ~872 listings (~4%) higher than the sum of our 8 seeded Lee
cities (21,488) — meaning unincorporated communities or places just not in `SWFL_CITY_SEED` (Alva, Boca
Grande, St. James City, Pine Island, Captiva, etc.) are silently dropped today. Same gap on Collier
(~108 listings, ~1.4%).

**We already half-knew this.** `rentals/constants.py` and `market_aggregates/constants.py` both already
use `"Lee County, FL"` / `"Collier County, FL"` as their location strings — county-level search,
already the pattern in two of our three SteadyAPI pipelines. Only `listing_lifecycle` is stuck on the
older city-by-city design (`SWFL_CITY_SEED`, 15 hardcoded city names) — it's not that nobody knew
county-level search existed, it's that this one pipeline predates that pattern and was never migrated.

Autocomplete confirms the exact slug format for every county (tested `Lee County` → returns
`slug_id: "Lee-County_FL"` directly) — no guessing needed for Charlotte/Glades/Sarasota's slugs either.

## Todo — everything to actually do, in priority order

1. **Widen all 3 SteadyAPI pipelines to the real 6-county scope.** Add Charlotte (12015), Glades
   (12043), Sarasota (12115) to `IN_SCOPE_FIPS` (listing_lifecycle), `COUNTY_LOCATIONS` (rentals),
   `_IN_SCOPE_COUNTY_FIPS` (market_aggregates). This is the single highest-value item — it roughly
   doubles real inventory coverage for zero new endpoint work, just scope config + whatever downstream
   brain/cadence wiring a new county touches (check `refinery/packs/*` county-gating, `BRAIN_GEO`
   `covers` lists in `lib/zip-dossier.ts`, and `fixtures/swfl-zip-county.json` — that fixture already
   claims 6-county scope per CLAUDE.md, so it may already be ready).
2. **Migrate `listing_lifecycle` off `SWFL_CITY_SEED` onto county-level `/search` calls**, matching the
   pattern `rentals`/`market_aggregates` already use. One call per county instead of N calls per city —
   cheaper AND catches the ~4% of listings the city list silently drops. This also simplifies the
   property_type fix's `build_type_lookup` (4 type-sweeps per COUNTY instead of per CITY — even less
   call volume than the per-city version shipped this session).
3. **Fix the type-sweep cost cadence** (already flagged in `06-full-audit-and-continue-decision.md`) —
   cache it weekly, don't re-sweep types daily. Doing #2 first changes the exact math (fewer, bigger
   calls instead of many small ones) so re-cost this after the county migration, not before.
4. **Decide the SteadyAPI account**: promote the trial key (`new_steady`) to production `PHOTOS_API`,
   or fix billing on the suspended original key (`steadyapi_subscription_suspended` check, still open).
5. Everything in `06-full-audit-and-continue-decision.md`'s recommendation list (autocomplete as a geo
   resolver backstop, reading `building_permits[]` off the already-called `property-tax-history`,
   re-evaluating `environment-risk` for its wildfire/heat/wind/trend data beyond flood).

## While the trial credits are still live (use them — don't let the window close unused)

- Confirm `gallery-similar-homes`'s real required param set (422'd on `{propertyId, lat, lon,
  state_code}` — docs list `listingId` too, untested combo).
- Test `/property-urgency` against several HIGH-traffic listings (new/price-reduced/hot market) — the
  one property tested had zero urgency data; need to know if that's typical or that property was just
  quiet.
- Check whether `/rentals-search` and `/nearby-rentals` also work at county-level location (same
  question as `/search` — untested this session, likely yes given the shared location-resolution
  system, but not verified).
- Check whether `/price-histogram` and `/housing-market-details` behave the same at county grain for
  Charlotte/Glades/Sarasota as they do for Lee/Collier (confirms the market_aggregates widening in item
  1 above is a pure scope-config change, not a new endpoint-behavior risk).
- Full county-level property_type sweep for the NEW 3 counties' rentals inventory too (parallel to the
  for-sale breakdown captured above) — not yet done, would inform whether rentals coverage is equally
  worth the widening.

## Reference

- `docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/06-full-audit-and-continue-decision.md` —
  property_type fix detail, full 18-endpoint live audit, Reddit/BiggerPockets pain-point research,
  continue-after-trial recommendation.
- `docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/00-foundation-endpoint-catalog.md` — original
  endpoint catalog + budget math (predates both findings above).
