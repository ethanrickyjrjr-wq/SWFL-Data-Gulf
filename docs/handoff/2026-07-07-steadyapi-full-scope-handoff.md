# HANDOFF — SteadyAPI: county-level search fixes a real gap; 6-county widening is NOT wanted

**Status:** Two real findings this session, both live-verified (RULE 0.4, crawl4ai + direct probe
calls). **Operator decision (07/07/2026, same session): SteadyAPI listing/rental/market scope is
Lee + Collier + Hendry ONLY — do not widen to Charlotte/Glades/Sarasota.** Finding 1 below is corrected
to reflect that; Finding 2 (county-level search) still stands and is the real actionable item.

## Why this handoff exists

Operator caught the real question mid-session: I'd verified the property_type fix on only Naples and
Fort Myers and called it done, then got asked "why only Fort Myers? What about Cape, North Fort Myers,
Bonita Springs, Estero, any other Lee or Collier name? Is city-by-city even the right way to search?"
That question led straight to a much bigger finding than the property_type bug. Both are recorded here
so neither gets lost.

## FINDING 1 — RESOLVED: SteadyAPI listing/rental/market scope is Lee + Collier + Hendry ONLY, confirmed

I initially flagged this as a gap because CLAUDE.md's platform-wide SCOPE section names 6 counties
(Charlotte 12015, Collier 12021, Glades 12043, Hendry 12051, Lee 12071, Sarasota 12115). Checked all
three SteadyAPI-fed ingest pipelines against that list and found none of them cover Charlotte/Glades/
Sarasota:

- `ingest/pipelines/listing_lifecycle/constants_api.py` `IN_SCOPE_FIPS` — **Lee, Collier, Hendry only**
- `ingest/pipelines/rentals/constants.py` `COUNTY_LOCATIONS` — **Lee, Collier only**
- `ingest/pipelines/market_aggregates/constants.py` `_IN_SCOPE_COUNTY_FIPS` — **Lee, Collier only**

**Operator correction, same session: this is intentional. SteadyAPI listing/rental/market data stays
Lee + Collier + Hendry only — do NOT widen to Charlotte/Glades/Sarasota.** Do not re-propose this.

That leaves an open, unresolved discrepancy worth a separate decision: CLAUDE.md's SCOPE section
declares a platform-wide 6-county footprint used by several OTHER brains (`env-swfl`, `hurricane-tracks-fl`,
`news-swfl`, `storm-history-swfl`, etc. all use the 6-county or 5-county `SIX_COUNTY`/subset lists in
`lib/zip-dossier.ts`). Whether that broader 6-county platform scope should also narrow, or whether it's
correct as-is and only the *SteadyAPI listing/rental/market* data is meant to stay 3-county, is a
separate question I have NOT assumed an answer to — flagged for the operator, not touched.

Live-verified real inventory sizes for all 6 counties are kept below for reference (captured while the
trial was live) — useful context even though only the first 3 rows are in scope:

| County | For-sale listings (live, 07/07/2026) | Currently ingested? |
|---|---:|---|
| Lee (12071) | 22,360 | ✅ yes |
| Collier (12021) | 7,986 | ✅ yes |
| Charlotte (12015) | **11,439** | ❌ **no** |
| Glades (12043) | 231 | ❌ no |
| Hendry (12051) | 1,080 | ✅ yes |
| Sarasota (12115) | **10,351** | ❌ **no** |
| **6-county total** | **53,447** | **31,426 in-scope (Lee+Collier+Hendry)** |

**Property-type breakdown for all 6, captured for reference while the trial's live** (same 4-filter method as the
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

1. **Migrate `listing_lifecycle` off `SWFL_CITY_SEED` onto county-level `/search` calls**, matching the
   pattern `rentals`/`market_aggregates` already use — still Lee/Collier/Hendry only, just 3 calls
   instead of 15 city calls. Cheaper AND catches the ~4% of listings the city list silently drops
   (unincorporated places like Alva/Pine Island/Captiva). This also simplifies the property_type fix's
   `build_type_lookup` (4 type-sweeps per COUNTY instead of per CITY — even less call volume than the
   per-city version shipped this session).
2. **Fix the type-sweep cost cadence** (already flagged in `06-full-audit-and-continue-decision.md`) —
   cache it weekly, don't re-sweep types daily. Doing #1 first changes the exact math (fewer, bigger
   calls instead of many small ones) so re-cost this after the county migration, not before.
3. **Decide the SteadyAPI account**: promote the trial key (`new_steady`) to production `PHOTOS_API`,
   or fix billing on the suspended original key (`steadyapi_subscription_suspended` check, still open).
4. Everything in `06-full-audit-and-continue-decision.md`'s recommendation list (autocomplete as a geo
   resolver backstop, reading `building_permits[]` off the already-called `property-tax-history`,
   re-evaluating `environment-risk` for its wildfire/heat/wind/trend data beyond flood).
5. **Separate, not-yet-decided question:** does CLAUDE.md's platform-wide 6-county SCOPE declaration
   need narrowing too, or does it correctly stay wider than the SteadyAPI listing/rental/market data
   scope? Not assumed either way — needs an explicit operator call before touching CLAUDE.md.

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
  Hendry as they already do for Lee/Collier (confirms item 1's county-level migration is a pure
  mechanical change for all 3 in-scope counties, not just the 2 already using that pattern).

## Reference

- `docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/06-full-audit-and-continue-decision.md` —
  property_type fix detail, full 18-endpoint live audit, Reddit/BiggerPockets pain-point research,
  continue-after-trial recommendation.
- `docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/00-foundation-endpoint-catalog.md` — original
  endpoint catalog + budget math (predates both findings above).
