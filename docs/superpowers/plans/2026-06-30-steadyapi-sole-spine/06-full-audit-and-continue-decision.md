# SteadyAPI — full audit + continue-after-trial decision

**Date:** 2026-07-07 · Trial: 50,000 requests / 7 days, key `new_steady` in `.env.local` (NOT wired into
`PHOTOS_API` / GHA secrets — that's still the suspended production key; promoting `new_steady` to
production is the operator's call, tied to the decision below). All findings in this doc are **live,
RULE-0.4-verified** (crawl4ai on docs.steadyapi.com + direct probe calls), not memory.

## 0. What triggered this

Testing the `property_type=condo` request filter (422 — wrong enum value) surfaced that
`ingest/pipelines/listing_lifecycle/extract_api.py` `parse_steadyapi` hardcoded **every non-land row to
`single_family`** — every condo, townhouse, multi-family listing in the whole SWFL feed was mislabeled.
Root cause + fix are in section 1. Fixing it required understanding property_type as a filter, which
led to re-examining the whole endpoint catalog and asking "what else does this vendor hold that we're
not using" — hence the rest of this doc.

## 1. The property_type bug — FIXED this session

`/search` returns **no property-type field on any row, on any real-estate endpoint** (re-verified live
07/07/2026 against every endpoint's response schema). `property_type` exists only as a `/search`
**request filter**, one value per call. Verbatim enum (docs.steadyapi.com/collection.json):

```
single_family, condos, condo_townhome_rowhome_coop, condo_townhome, townhomes, duplex_triplex, multi_family
```

Tested all 7 values live across 4 cities (Naples, Fort Myers, Cape Coral, Marco Island — chosen to span
both counties and a condo-heavy market):

| filter | Naples | Fort Myers | Cape Coral | Marco Island |
|---|---|---|---|---|
| single_family | 3,075 | 1,869 | 3,240 | 204 |
| condos | 2,379 | 1,319 | 327 | 339 |
| townhomes | 142 | 235 | 56 | 5 |
| condo_townhome_rowhome_coop | 2,523 | 1,555 | 383 | 344 |
| condo_townhome | 0 | 0 | 0 | 0 |
| duplex_triplex | 0 | 0 | 0 | 0 |
| multi_family | 39 | 69 | 119 | 0 |

Two things fell out of this table that change the fix design from a naive "sweep all 7 filters":

1. `condos + townhomes ≈ condo_townhome_rowhome_coop` almost exactly (off by 0–2 rows per city, a
   negligible rowhome/coop-only remainder) — it's a **superset**, not a distinct bucket. Sweeping it
   too would just double-count the same property_ids for zero new information.
2. `condo_townhome` and `duplex_triplex` returned **zero results on all 4 cities** — dead/non-functional
   filter values, not a real bucket we're missing.

**Fix shipped:** `STEADYAPI_TYPE_FILTERS = [single_family, condos, townhomes, multi_family]` (4 sweeps,
not 7). `scan_county_api` runs the existing unfiltered per-city sweep (unchanged — still the sole
completeness/exhaustion gate) plus a `build_type_lookup()` pass per city that sweeps those 4 filters and
returns `{property_id: filter_value}`; `parse_steadyapi` takes a `type_hint` and resolves it through
`PROPERTY_TYPE_MAP` (now also covers the raw filter strings `single_family`/`multi_family`/
`duplex_triplex`, which were missing and fell to `"other"`). No hint + no beds + a lot_sqft → `"land"`
(unchanged heuristic — land isn't filterable at all). No hint otherwise → `"other"`, honestly, instead
of the old false `"single_family"` default.

Same bug existed in `lib/listings/steadyapi.ts` (`propertyType: "Single Family"` hardcoded for the
email/social photo-search client) — fixed to `"Land"` (same heuristic) / `"Residential"` (honest generic;
this single-page interactive client doesn't sweep 4 extra filter calls per request, so it can't assert
the specific type). `lib/listings/select.ts`'s `RESIDENTIAL` ranking set got `"Residential"` added so
land still correctly loses the ranking bonus it used to falsely get.

**Verified live** (Naples/Fort Myers — the two cities named in this ask):

| | single_family | condo | townhouse | multi_family | land | other | total |
|---|---|---|---|---|---|---|---|
| **Naples** | 3,075 | 2,378 | 142 | 39 | 757 | 328 | 6,719 |
| **Fort Myers** | 1,869 | 1,320 | 236 | 69 | 426 | 273 | 4,193 |

Tests: `ingest/pipelines/listing_lifecycle/test_extract_api.py` (8 cases, pytest), `lib/listings/steadyapi.test.ts`
(3 cases, bun test) — both green, plus the full existing suite (bun 5200/5202 pass — the 2 fails are a
pre-existing, unrelated test-order flake; pytest full listing_lifecycle green).

### Cost impact — read before deciding whether to keep this design at the current cadence

The fix roughly **triples per-city search-call volume** (1 unfiltered + 4 typed vs. 1 unfiltered before).
Measured live: Naples 64 calls (was ~34), Fort Myers 41 (was ~21), Hendry both cities combined 16 (was ~8).
Extrapolating from the measured calls-per-row ratio (~0.0095 calls/row) across each county's full seed-city
list:

- **Lee** (8 cities, 21,488 unfiltered rows): ~250-300 calls/run
- **Collier** (5 cities, 7,878 unfiltered rows): ~90-100 calls/run
- **Hendry** (2 cities, measured): 16 calls/run

At the current cadence (`listing-lifecycle-daily.yml`: Lee/Collier/Hendry each once daily, staggered
3h apart) that's **~360-420 search+type-sweep calls/day ≈ 11,000-12,600/month** — before baths-enrich,
sold-capture (`SOLD_CHECK_CAP=8`/county-run × 3 ≈ 720/month), rentals pipeline, and market-aggregates
pipeline calls are added. **This alone is at or over the $14.95/mo Starter tier's 10,000/month cap** —
the steady-state target this build's README banked on (3,000-4,700/mo) was sized for the OLD
single_family-only-bug design, not the fix. Two ways to bring it back under budget without losing the
type accuracy:

1. **Cache the type lookup.** A property's type basically never changes; the daily unfiltered sweep
   needs to run daily (price/status/flags churn), but the 4 typed sweeps don't — running them
   **weekly** instead of daily (refresh `type_by_pid` once, reuse for 7 days, only re-sweep for
   property_ids the daily sweep hasn't seen before) would cut the typed-sweep share of the bill by ~7x.
   This is the recommended fix — cheap to build, no accuracy loss for a slow-moving signal.
2. **Upgrade tier** if continuing past the trial and the operator wants daily type freshness anyway.

**No check opened for this — it's a same-session, already-diagnosed-with-a-fix-in-hand cost item, not
an open unknown; RULE 2.4 applies to parked findings, this one isn't parked.** Flagging it here because
it's a real decision the operator needs to make before this ships to a schedule beyond the trial window.

## 2. What SteadyAPI actually offers (verified live, not the vendor's marketing copy)

The full Postman collection (`docs.steadyapi.com/collection.json`) has **13 top-level categories**:
Stocks & Options, Crypto, **Real Estate**, Hockey (NHL), Baseball (MLB), Booking.com, Twitter Social,
Amazon, Instagram Social, Reddit, AutoHub API, Aliexpress, ScrapeFlow. Only Real Estate is relevant to
this project (Instagram/Twitter Social are already separately documented in
`docs/vendor-notes/INSTAGRAM-SOCIAL-STEADY.md` for the social-publishing engine — same vendor, different
use case, out of scope here).

### Real Estate — 18 endpoints, 6 wired in, 12 untested until today

| Endpoint | Status before today | Live-tested today | Notes |
|---|---|---|---|
| `/search` | **USED** (listing-lifecycle inventory, photo client) | — | primary spine |
| `/nearby-home-values` | **USED** (batched baths enrich) | — | |
| `/property-tax-history` | **USED** (sold/departure classification) | — | **also carries `building_permits[]`** — see §3 |
| `/rentals-search` | **USED** (rentals pipeline) | — | |
| `/price-histogram` | **USED** (price-distribution brain) | — | |
| `/housing-market-details` | **USED** (market-temperature brain) | — | |
| `/autocomplete` | unknown — not in the old 06/30 catalog at all | ✅ tested | geo entity resolver: `"Fort Myers"` → county FIPS + centroid + canonical slug_id in one call. **Could replace/backstop our own ZIP/place resolver's fuzzy-match cases.** |
| `/nearby-rentals` | unused, undocumented depth | ✅ tested | 25 nearby rentals w/ price range, beds/baths range, photo — point-radius, not city-sweep |
| `/neighborhood-market-trends` | unused | ✅ tested | city + county + **named neighborhood** (e.g. "South Naples") median list/sold/DOM/ppsqft in ONE call off a single propertyId |
| `/neighborhood-amenities` | unused | ✅ tested | 20 amenities + 11 schools + walk/transit-style location scores within a radius, categorized (groceries/food/outdoor/entertainment) |
| `/geo-details` | noted "—" (unused) in 06/30 catalog | ✅ tested | every city/ZIP/neighborhood under a metro + price range/avg — good for building a "what's nearby" index |
| `/similar-homes` | unused | ✅ tested | comps with baths_full/half (fills our one enrich gap), a `community` field (populated for some — see §3), MLS source id |
| `/gallery-similar-homes` | unused | ❌ 422 — param contract unconfirmed | needs a working param combo re-derived (likely `listingId` required, not just `propertyId`); low priority, `similar-homes` already covers the comp use case |
| `/new-construction` | unused | ✅ tested | new-construction communities with a real subdivision **name** (e.g. "Valencia Sky (55+)"), price stats, per-plan listings |
| `/mortgage-rate` | unused | ✅ tested | daily 30yr-fixed by state, 30-day history in one call |
| `/property-urgency` | noted "deferred" | ✅ tested (200, but sparse) | views/saves/LDP-views demand signal — **data coverage is real but thin**: our first test property had zero urgency data recorded. Needs testing across more/higher-traffic listings before judging it useful. |
| `/property-estimates` | **decreed SKIP** ("overlaps ZHVI") 06/30 | not re-tested | decision stands — no new evidence changes this |
| `/environment-risk` | **decreed SKIP** ("overlaps flood-risk brain") 06/30 | ✅ tested — **worth reopening**, see §3 | |

## 3. Two findings that should reopen a "SKIP" decision, plus one new capability

The 06/30 build decreed `property-tax-history`/`environment-risk` as full overlap with what we already
hold (Accela permits, our NFIP-AAL flood-risk brain) and parked them. Today's live tests + the Reddit
pain-point research below (§4) say two of those three deserve a second look — not a reversal, a
re-evaluation with fresh evidence:

- **`environment-risk` is not just flood** — it returns flood **and** wildfire, heat, wind, and air
  quality, each with a severity tier AND a **trend direction** ("this property's flood risk is
  increasing"). Our `env-swfl` brain is a flood-only NFIP Average-Annual-Loss dollar figure with no
  trend language. A live pull on a Naples condo returned `overall_risk_level: "Severe"` (flood 9/10
  extreme + rising, heat 10/10 extreme, wind 10/10 extreme) — genuinely different information, not a
  duplicate. This maps directly to the #3 Reddit finding below (flood risk surfacing too late, with no
  sense of trend).
- **`property-tax-history`'s `building_permits[]` array is real, dated, per-property permit history**
  (permit type, project type, effective date, status) — live-verified on a Cape Coral property
  ("Irrigation residential" issued Jun 2026, "Marine improvement" final Dec 2025). We already parse this
  endpoint for sold-classification but never read `building_permits`. This maps directly to the #2
  Reddit finding (permit history is fragmented per-county and a flip-disclosure fraud vector) — it's a
  **second, independent source** to cross-reference against our own Accela/county-appraiser permit
  pipelines, not a replacement.
- **HOA/condo fee data does NOT appear anywhere in this vendor's schema** — checked `/search` (0 of 200
  Naples condo results carried any hoa/community field), `/similar-homes` (`"community": null` on the
  one sample checked), `/new-construction` (does carry a community **name**, e.g. "Valencia Sky (55+)",
  but never a fee amount). This is the #1 Reddit finding (condo reserve/special-assessment opacity) and
  **SteadyAPI does not solve it** — confirming this gap stays a genuine, unmet need rather than
  something we're failing to wire up.

## 4. Real-world pain points (Reddit + BiggerPockets research, this session)

Full findings from a dedicated research pass are recorded in the session transcript; summary ranked by
strength of match to what this project + SteadyAPI can actually do:

1. **Florida condo/HOA reserve & special-assessment opacity — THE standout finding.** Multiple
   subreddits (r/HOA, r/fuckHOA, r/RealEstate, r/FirstTimeHomeBuyer) describe $100K-$224K surprise
   special assessments post-purchase, tied to the post-Surfside SB 4-D mandatory-reserve law. Repeated
   advice across threads: "you HAVE to ask what they have in reserves" — because no structured public
   source exists. **SteadyAPI does not carry this data (§3)** — this stays a genuine gap; if we ever
   want to address it, it has to come from a different source (state DBPR condo filings — we already
   have `condo-sirs-swfl` for SIRS filings specifically; worth checking whether that pipeline's scope
   could extend to reserve-fund/assessment data, but that's a separate investigation).
2. **Permit/renovation history fragmentation.** "No permit record ever found" and undisclosed flip
   renovations are a recurring, cross-market complaint genre — directly answerable by cross-referencing
   our Accela/county pipelines against SteadyAPI's `building_permits[]` (§3) as a second source.
3. **Flood/insurance risk surfacing too late in the transaction**, with no sense of trend or local
   benchmark — r/AskFlorida explicitly asks "is there a real estate site that lets you filter by flood
   zone?" with no good answer given. `environment-risk`'s trend language (§3) + our existing flood-AAL
   brain, shown earlier in a buyer's search/report flow rather than post-contract, addresses this.
4. **Zestimate/Redfin AVM distrust** — extremely recurring; buyers explicitly want to know **where a
   number came from**. Direct validation of this whole project's four-lane-citation model over any
   single AVM number.
5. **Rental comp trust gap** — investors manually cross-check RentCast/Rentometer/Zillow with no
   consensus; `/nearby-rentals` + our existing rentals pipeline, shown with sourcing, is a plausible
   differentiator.
6. **CMA/comp transparency** — agents want to see the comps and the math, not a black-box adjustment;
   matches the existing `steadyapi_comp_helper` work already speced.
7. Neighborhood/amenity data gaps (`/neighborhood-amenities`, `/geo-details`) — real but the least
   differentiated theme; existing point solutions (GreatSchools, Walk Score) already partially serve it.
   Best used as a supporting layer, not a headline feature.

## 5. Recommendation

**Continue past the trial — but on a paid tier sized for the fixed design, and fix the type-sweep
cadence (§1) before committing to daily.** The vendor's actual data depth (permit history, multi-hazard
trend risk, neighborhood-level medians, mortgage rates, autocomplete) is meaningfully wider than the 6
endpoints currently wired in, and today's live tests confirm real, usable data behind all but one
(`gallery-similar-homes`, param contract still unconfirmed) of the 12 previously-untested endpoints.
The one thing it definitively does NOT solve — condo/HOA reserve transparency — is also the single
strongest pain point found, which is useful to know now rather than assume away later.

**Before the trial expires:**
- Weekly-cache the type-sweep (§1) — this is the one blocking cost item, cheap to build.
- Decide whether to promote `new_steady` to the production `PHOTOS_API` secret, or resolve the billing
  issue on the currently-suspended key (`steadyapi_subscription_suspended` check, opened earlier this
  session) and keep that account instead — operator call, not a code decision.
- If keeping SteadyAPI as more than the minimum spend: `/autocomplete` (geo resolver backstop),
  `/neighborhood-market-trends` (named-neighborhood medians — a genuinely new grain we don't hold
  anywhere), and re-reading `building_permits[]` off the already-called `/property-tax-history` (zero
  new calls, we're already paying for this endpoint) are the three highest-value, lowest-effort adds.

## 6. Remaining open items (not blocking the decision above)

- `/property-urgency`: test across more/higher-traffic listings before judging signal quality — one
  sample had zero data.
- `/gallery-similar-homes`: 422 on `{propertyId, lat, lon, state_code}` — needs the real required param
  set re-derived from docs or trial-and-error before it's usable.
- `/property-estimates` and the flood-only slice of `/environment-risk`: 06/30 SKIP decision stands,
  no new evidence reopens those specifically (only the wildfire/heat/wind/air + trend angle is new).
