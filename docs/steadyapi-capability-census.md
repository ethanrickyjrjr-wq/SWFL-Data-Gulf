# SteadyAPI capability census — everything we can grab, what we do get, what we should also get

As-of **07/16/2026**. Operator-requested (same session as the 50k-quota read). Every claim below
names its evidence; nothing is from memory. Companion docs:
`docs/handoff/2026-07-16-failed-calls-findings.md` (burn + limits),
`docs/superpowers/plans/2026-06-30-steadyapi-sole-spine/06-full-audit-and-continue-decision.md`
(the 07/07 live 18-endpoint audit this census consolidates),
`docs/handoff/2026-07-07-steadyapi-full-scope-handoff.md` (county-scope decree + inventory sizes).

SteadyAPI is the ACCESS LAYER — never surfaced in a citation/source_tag/prose. Provenance shown
to users = realtor.com / "SWFL Data Gulf".

## 0. Account reality (operator dashboard, 07/16/2026)

- **Quota: 50,000 requests/month.** 10,795 used this cycle at the read (10,739 ok / 56 failed,
  ~22% utilization). The "10k Starter" cap that shaped every prior sizing decision was an
  uncited guess — it was never real.
- **Rate limit: UNVERIFIED, evidence spans 1–15 req/s.** Docs claim 15 req/s global; the
  dashboard's failed-request log shows a 1 req/s rejection exists on the account (`retry_after:
  1` — that entry's params look like steadyapi.com's own site demo box, not our clients); a
  live 9-call probe (3-concurrent bursts × spoofed/plain/bare header shapes) passed 100% clean
  on 07/16. Sustained un-paced page walks DID 429 on 07/07. All four call surfaces pace
  **~1 req/s** since commit `10078873` — safe under every hypothesis. A deliberate
  sustained-rate probe could pin the real limit if a bulk job ever needs >1 req/s.
- **All real-estate endpoints are weight 1** (docs crawl 07/16) — requests ≈ quota units.
- **No rate/quota headers on any response** — the dashboard is the only usage authority.
- Still unread from the dashboard: cycle reset date, per-API split (real-estate vs social keys).

## 1. What we pull today (5 surfaces)

| Surface | Endpoints | Cadence | ~Calls/mo | What lands |
|---|---|---|---|---|
| listing_lifecycle scans | `/search` (county walks + 4 type sweeps), `/nearby-home-values` (baths enrich), `/property-tax-history` (sold probes) | nightly chain, per county | ~8.6–10.3k | `listing_state` + `listing_transitions`: address/price/beds/sqft/lot/lat-lon/county/photo/status/property_type, 7 status flags, reduced_amount; state machine (new/active/price-cut/holding/relist); sold_price+sold_date on probed departures |
| sold probes (raised 07/16) | `/property-tax-history` | 40/county-run (was 8) | ~3.6k | closes the dep=8/336 drop — see §3.1 |
| rentals | `/rentals-search` | weekly (Mon 12:00 UTC) | ~2k | `rental_listings_swfl` (~7.2k rows/run) |
| market_aggregates | `/price-histogram`, `/housing-market-details` | weekly/monthly | small | price bands + market-temperature metrics per county/ZIP |
| user-facing comps/photos | `/search`, `/nearby-home-values`, `/property-tax-history` | on-demand, hour-cached, ≤3/ask | small | chat comp lane + email/social photo enrich |

**Total current burn ≈ 13–16k/mo ≈ 26–32% of quota.** Headroom ≈ 34–37k/mo.
County scope: **Lee + Collier + Hendry ONLY** (operator decree 07/07 — see §5).

## 2. The 18 real-estate endpoints — full census

Live-verified 07/07/2026 (each row's evidence: §2 of the 06-full-audit doc) unless noted.

| Endpoint | Used? | What it holds |
|---|---|---|
| `/search` | ✅ spine | for-sale inventory; `property_type` is a REQUEST FILTER only (4 useful values), never a response field |
| `/nearby-home-values` | ✅ | batched baths (+values) by lat/lon cluster, ~25–100 properties/call |
| `/property-tax-history` | ✅ partially | sold classification today — **also carries `building_permits[]` we never read** (§3.2) |
| `/rentals-search` | ✅ | active rental inventory (20/page) |
| `/price-histogram` | ✅ | $50k price bands per location |
| `/housing-market-details` | ✅ | market-temperature metrics incl. aggregate median_days_on_market |
| `/similar-homes` | ✅ (comps lane) | comps w/ baths_full/half, `community` field (often null), MLS source id |
| `/autocomplete` | ❌ | geo entity resolver: name → county FIPS + centroid + canonical slug in one call — backstop for our fuzzy place-matching |
| `/nearby-rentals` | ❌ | 25 nearby rentals w/ price+beds/baths range + photo, point-radius |
| `/neighborhood-market-trends` | ❌ | city + county + NAMED-NEIGHBORHOOD median list/sold/DOM/ppsqft off one propertyId — a grain we hold nowhere |
| `/neighborhood-amenities` | ❌ | 20 amenities + 11 schools + location scores in a radius, categorized |
| `/geo-details` | ❌ | every city/ZIP/neighborhood under a metro + price stats |
| `/new-construction` | ❌ | new-construction communities w/ real subdivision names, price stats, per-plan listings |
| `/mortgage-rate` | ❌ | daily 30yr-fixed by state + 30-day history in one call |
| `/property-urgency` | ❌ | views/saves demand signal — 200s but THIN data (one sample had zero); retest before trusting |
| `/environment-risk` | ❌ (SKIP under re-review) | flood AND wildfire/heat/wind/air, each with severity + TREND — wider than our flood-only env-swfl brain |
| `/gallery-similar-homes` | ❌ blocked | 422 on every tried param combo; contract unconfirmed; `/similar-homes` covers the use case |
| `/property-estimates` | ❌ SKIP stands | AVM overlap with ZHVI — decreed 06/30, no new evidence |

## 3. Should-get list, ranked (cost · value · status)

1. **Sold-probe capture at 40/county-run — SHIPPED 07/16** (`a23c7b26`). At cap 8 we resolved
   ~2% of available sold outcomes (Lee `dep=8/336`, run 29198998185). ~3.6k calls/mo. Watch via
   `steadyapi_failed_calls_post_deploy`; `listing_lifecycle_sold_sampling_bias` closes when
   probed≈available.
2. **`building_permits[]` off `/property-tax-history` — ZERO new calls.** Real per-property
   permit history (type, project, effective date, status; live-verified 07/07) inside responses
   we already pay for on every sold probe. Second source to cross-check Accela/county permits —
   the #2 Reddit pain point (undisclosed flips). Just parse + persist what's already in hand.
3. **Persist `listed_date` — ZERO new calls** (check `steadyapi_persist_listed_date`, opened
   07/16, operator-approved). Confirmed-live field we read for sold-window math but never store.
   Unlocks true per-listing days-on-market — the vendor only sells the aggregate.
4. **Community amenity pre-cache** (check `steadyapi_community_amenity_precache`, opened 07/16,
   operator-approved): `/neighborhood-amenities` across 3,349 communities, one-time ~3.4k calls
   + refresh cadence TBD. At ~1 req/s pacing this is ~1h of wall-clock — needs GHA chunking
   (15-min job timeouts). Brainstorm first: brain-first gate needs the consuming brain in the
   same PR.
5. **`/neighborhood-market-trends`** — named-neighborhood medians are a genuinely new grain
   (finer than ZIP, matches how buyers actually talk: "South Naples"). Costed per-propertyId
   call; design question is which spine rows trigger it.
6. **`/autocomplete` as geo-resolver backstop** — one call resolves fuzzy place names to
   FIPS + centroid + canonical slug; cheap, bounded, improves the chat routing edge cases.
7. **`/environment-risk` re-evaluation** — multi-hazard + trend ("flood risk increasing") is
   NOT redundant with env-swfl's flood-only NFIP AAL dollar figure. Maps to Reddit pain #3
   (risk surfacing too late, no trend). The 06/30 SKIP was decided on the flood slice only.
8. **`/mortgage-rate`** — trivial cost (1 call/day), rate context for deliverables; needs a
   consuming brain per the brain-first gate.
9. **`/new-construction` + `/geo-details`** — supporting layers (community names feed the
   communities-swfl name-join; geo-details could seed a "what's nearby" index). Lower priority.
10. **Retest `/property-urgency`** across high-traffic listings before judging; **re-derive
    `/gallery-similar-homes` params** — both parked pending evidence, low value.

Budget at full build-out (items 1–8 shipped): current ~13–16k + amenity ~3.4k first month +
trends/autocomplete/mortgage (~1–2k) ≈ **~18–21k/mo ≈ 40% of quota** — comfortable.

## 4. Vendor ceilings — what SteadyAPI cannot give us (stop looking here for these)

- **HOA/condo fees, reserves, special assessments** — nowhere in the schema (checked /search,
  /similar-homes, /new-construction live 07/07). This is also the #1 researched buyer pain
  point (SB 4-D reserve opacity, $100k+ surprise assessments) — if we ever address it, it comes
  from state DBPR/SIRS filings (`condo-sirs-swfl`), not this vendor.
- **Agent/brokerage/office fields** — zero across all 18 endpoints (grepped 07/08).
- **Per-listing days-on-market** — aggregate `median_days_on_market` only; our fix is
  persisting `listed_date` + our own observation spine (§3.3).
- **Property type as data** — filter-only; manufactured/mobile not filterable at all
  ('other' bucket is honest, not a backfill gap).
- **1 req/s pacing assumption** until a sustained-rate probe says otherwise (§0).

## 5. Locked decisions — do not re-propose

- **Scope stays Lee + Collier + Hendry** for listing/rental/market data (operator decree
  07/07/2026). Charlotte (11,439 live listings) and Sarasota (10,351) are known, sized, and
  deliberately out.
- `/property-estimates` SKIP stands (AVM overlap with ZHVI).
- `condo_townhome` + `duplex_triplex` filter values are dead (0 results everywhere);
  `condo_townhome_rowhome_coop` is a superset of condos+townhomes — the 4-filter sweep is
  already the complete set.
- Weekly type-sweep caching (the old ~3.2k/mo savings item) is **deprioritized** — it was an
  artifact of the phantom 10k cap; daily sweeps are affordable at 50k.
