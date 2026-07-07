# SWFL community intelligence — golf, fees, amenities, homes, nearby & distances

**Date:** 2026-07-05
**Slug:** `communities-swfl` · **Check:** `communities_swfl_live_verify`
**Status:** design approved (operator "Go" 07/05/2026); implementation plan pending.

## Problem

We hold no community-grain intelligence. A user asking "is a home in Heritage Bay a better
buy — is golf included, what are the fees, how far to the airport, what's nearby?" gets nothing.
The web has this scattered across realtor marketing pages (no single source — see the 07/05/2026
source-hunt), and none of it is tied to *our* authoritative parcel data. We want every marketed
golf/gated community in Lee + Collier known cold — golf-or-not, fees, amenities, home count,
what's nearby, drive times — usable by the assistant, the email/social lab, and per-community
pages, so it powers "better buy" reasoning and golf/social campaigns.

## Goal

One self-maintaining reporter brain, `communities-swfl`, built on a UNIVERSAL backbone: every home
in Lee + Collier (all property types) is assigned to its actual neighborhood/subdivision, so every
one carries a real neighborhood identity, per-neighborhood stats, and location enrichment — gated or
not. On top of that, the ~200–400 marketed golf/gated communities get the full amenity/golf/fee
profile. Every number cited to its source. Plugs into the existing brain machinery so it reaches all
four consumption surfaces; because the data rarely moves, it rebuilds rarely. Golf-or-not and fees
are first-class, framed for the buy/no-buy question.

## Scope — two tiers (the join serves EVERY home, not just gated)

**Tier 1 — every home (universal backbone).** All residential parcels in Lee (12071) + Collier
(12021) — **~616K homes, ALL types** — spatially joined to their subdivision/neighborhood, each
getting per-neighborhood stats + location enrichment. Not gated-only; a starter neighborhood in Cape
Coral or a condo complex in East Naples gets the same treatment. Real counts from our parcel data
(Lee & Collier tax rolls, ~06/2026):
- **Lee ~395K homes:** single-family 279,044 · condominium 84,874 · mobile home 14,765 ·
  duplex/small-multifamily 11,616 · cooperative 3,482 · misc-residential 1,280 (vacant lots
  excluded — 120,370 vacant residential are not homes).
- **Collier ~221K homes** (FL DOR use codes): single-family (001) 111,129 · condominium (004)
  100,847 · mobile home (002) 3,509 · cooperative (005) 2,478 · duplex/small-multifamily (008)
  1,970 · misc-residential (007) 942.
- **Condos are ~186K combined** — near-parity with single-family in Collier. Property type comes
  from the DOR use code. Collier condos land at **parcel/building grain, not unit grain** — see the
  F2 reversal below; the "per-unit" claim in this bullet does not hold for this source and should
  not be relied on when sizing a condo community's home count.

  > **F2 REVERSED (07/06/2026, live-verified — corrects the 07/06/2026 "F2 CORRECTION" below it,
  > which was itself wrong).** The `169,047` figure was never a per-unit count — it's the FDOR
  > centroid layer's raw, undeduped OBJECTID row count for `DOR_UC='004'`, and this layer duplicates
  > condo rows: one geometry point per unit footprint, but with every non-geometry attribute
  > (owner, sale, value, `S_LEGAL`, even `NO_RES_UNT`) byte-identical across the duplicates — proven
  > live by pulling all ~110 fields for parcel `81750002283` ("Whitaker Woods A Condominium"): 33
  > raw rows, only `OBJECTID`/`ORIG_FID`/geometry differ, nothing else. That's the same DOR roll
  > record stamped onto 33 map points, not 33 distinct folios. Rerunning the corrected ingest
  > (`ingest/pipelines/parcel_subdivision/`, proper `returnIdsOnly`→`objectIds` pagination, merged on
  > `parcel_id` PK) reproduced the ORIGINAL `100,847` distinct-parcel-id condo count exactly — the
  > figure this doc's prior "F2 CORRECTION" told readers to stop citing. **`100,847` is correct;
  > `169,047`/`169,486` was row-count-before-dedup, not a real per-unit count; `289,212` Collier total
  > homes is wrong for the same reason (Collier stays ~221K).** Neither the centroid layer nor the
  > sibling cadastral layer (`collier_parcels` — same 364,827-row FDOR source, confirmed by matching
  > row count) exposes any field that distinguishes individual condo units (no unit number, no
  > per-unit owner/folio) — that's a hard ceiling of this source, not a normalizer bug. True per-unit
  > condo data would need Collier's own assessment-roll data request (flagged already in
  > `docs/data-sources/data-sources-discovery-2026-06-13.md` line 660) or Lee's own LeePA GIS layer,
  > neither pulled yet. The per-community benchmark table in
  > `verification/communities-name-join-accuracy.md` (Heritage Bay etc.) used the same undeduped pull
  > method, so its condo-inclusive home counts are likely inflated by the same artifact and have NOT
  > been re-verified at dedup grain — treat those specific numbers as open, not settled.
- "How many homes are gated?" is NOT a stored number anywhere — it is an OUTPUT of Tier 1 (count
  parcels whose community carries the gated flag), authoritative once the join runs. Never invented.

**Tier 2 — marketed communities (~200–400).** The gated/golf/amenity communities also get the
scraped golf/fee/amenity profile grafted on. This is the subset with a "community" brand.

**Out (v1):** the other 4 SWFL counties. Extensible (a new attribute is a column + a source).

## The fact set

Every field carries `source_url` + `as_of`.

**Per home / per neighborhood (Tier 1 — every property):**
- **Identity / geo:** parcel id, situs address, property_type (DOR use code), county, city,
  centroid, subdivision/neighborhood slug + aliases[], boundary.
- **Neighborhood stats (authoritative — our parcels, computed by aggregation):** home_count,
  count-by-type, median just-value, value spread, price-per-sqft, homestead ratio, recent-sales
  count/velocity. *Assignment quality is the hypothesis Phase 1 proves — see The Crux.*
- **Access — drive-times (Mapbox):** minutes/miles to RSW airport, nearest Gulf beach, downtown
  (Naples / Fort Myers), nearest hospital — works for ANY address, gated or not.
- **Nearby to-do (Mapbox):** dining / shopping / entertainment — counts + notable named places.

**Per marketed community (Tier 2 — the ~300 branded communities, on top):**
- **Golf (scrape):** golf_structure ∈ {bundled, equity, optional, none}, golf_holes, courses. HEADLINE.
- **Fees (scrape):** hoa_fee_range, cdd_flag. HEADLINE.
- **Inside the gates (scrape):** gated, pool, tennis, pickleball, fitness, clubhouse,
  on_site_dining, boating/marina — structured flags + full amenity list.

## What's proven (07/05/2026, in-session)

Three data engines, each verified live before this spec:

1. **Parcels (authoritative homes).** `data_lake.leepa_parcels` + `data_lake.collier_parcels` hold
   every parcel in both counties, but only by id + values + ZIP today. The **FDOR Statewide
   Cadastral** (our existing Collier feed; statewide, so Lee too on a `CO_NO` filter) exposes per
   parcel: **polygon geometry** (`esriGeometryPolygon`), **situs address** (`PHY_ADDR1`), ZIP, and
   `S_LEGAL`. We just don't pull those fields yet — confirmed via the layer's field list.
2. **Scrape (golf/fee/amenity).** naplesgolfguy detail pages render golf dues, structure, holes,
   acres, gated per community; 55places renders exact home counts + amenities + gated;
   realtyofnaples renders HOA fee ranges. All crawl clean under crawl4ai stealth.
3. **Mapbox (access + nearby).** Proven end-to-end: Heritage Bay → RSW = ~36 min / ~27 mi
   (driving-traffic, via Immokalee Rd → I-75 N); 8 real named restaurants at Founders Square ~2 mi
   out (category_search). Cited to Mapbox, as of 07/05/2026.

## The Crux — parcel → community join (Phase 1 = GO/NO-GO SPIKE)

Everything "authoritative" downstream (home counts/values, "better buy" numbers) rests on
correctly assigning ~700K parcels to the right community and reconciling messy subdivision names
against the ~300 scraped community names. This is the one hard, unproven piece — treat Phase 1 as a
spike whose success is a gate, not an assumption.

- **The per-parcel-attribute shortcut is a TRAP (probed live 07/05/2026, do not retry it).** The
  tempting "read a parcel's subdivision field and name-join" does not work: Lee's LeePA
  `ParcelDetails` layer 32 `SUBDIV` holds STRAP *codes*, not names — sampled values are `B4`, `00`
  (408× = unplatted), `P2`, `05`, `01`… — a section-local code, not a community name. Collier's FDOR
  `S_LEGAL` is free-text legal description, not a clean name. Neither is a usable join key. This was
  the crux's hidden failure mode; it is now ruled out.
- **Mechanism = SPATIAL JOIN (primary, not fallback).** Each parcel's centroid (point-in-polygon)
  against the county's **named subdivision boundary polygons** — the authoritative geographic
  definition of a subdivision, so every home inside belongs to it, listed or not. Both counties
  publish the named polygons as open data: Lee "Subdivisions"
  (`leegisopendata2-leegis.opendata.arcgis.com/datasets/subdivisions`), Collier via its GIS Hub
  (`hub-collierbcc.opendata.arcgis.com`). **Runs in-stack:** the ingest island is DuckDB, whose
  `spatial` extension does `ST_Contains` point-in-polygon over ~700K parcels natively — no new infra.
- **Secondary cross-checks (condos + disambiguation), NOT the mechanism:** LeePA `ParcelDetails`
  layer 1 `CondoName` (real condo names — a large share of golf-community homes are condos),
  `AVMNBHD`, `MuniCode`; Collier `SUBDIVISIONCONDONUMBER` code (`ags2.colliercountyfl.gov` parcels
  service) + `S_LEGAL`. Use to fill/verify where a centroid is ambiguous (on a boundary, missing geom).
- **Name reconciliation (the real Phase-1 work).** Subdivision-polygon names → canonical community
  slug + aliases[]. A marketed community is usually the UNION of several platted subdivision polygons
  (e.g. "HERITAGE BAY UNIT n" → Heritage Bay); the alias map (pattern extends
  `refinery/lib/corridor-aliases`) collapses them, and the community boundary = union of its matched
  subdivision polygons (which also feeds the Mapbox centroid).
- **Success criteria (the gate):** ≥ X% of ALL residential parcels assigned to a neighborhood
  (Tier-1 universal coverage, all types incl. condos-per-unit), AND ≥ Y% of the ~300 marketed
  communities matched to a boundary with a plausible home_count (Tier-2). (Set X/Y at plan time from
  the first spike run.)
- **NO-GO fallback (still ships):** if assignment quality is poor, the brain degrades to
  scraped-community aggregate facts only — home counts become lane-3 (55places, cited estimate)
  instead of authoritative. The product still works; only the "ours not estimates" claim waits.

### Why no third party hands us the connection (vendor check, 07/05/2026)

The home→community link is not a number anyone stores, because "marketed community" (Heritage Bay)
is a MARKETING concept, not a records concept — records systems only know platted *subdivisions*.
Checked live:
- **Google Maps / Places:** address + neighborhood/sublocality only; no subdivision/HOA-community
  type. Gives a coordinate, not a community.
- **Zillow:** official API deprecated 2021; replacement is enterprise/partner-only ($500+/mo, weeks
  of approval); scraping violates ToS; subdivision shows only for LISTED homes anyway.
- **Redfin:** public data is market-aggregate (already ingested as `redfin_*`); no clean per-home
  community API.
- **SteadyAPI (ours, realtor.com data):** confirmed from `lib/listings/steadyapi.ts` — returns
  price/beds/sqft/lat-lon/AVM/sold, NO subdivision/community field.
- **Paid property-data APIs (ATTOM / RealEstateAPI / Estated):** the ONE category that ships a
  per-property `subdivision` field for ALL parcels — but it is the same assessor-derived value
  (often coded/null), still needs the platted→marketed grouping (nobody sells that), and costs money
  for data we can derive ourselves.

Every source reduces to a coordinate + (maybe) a messy platted-subdivision label. So we build the
connection with the spatial join — that IS the moat (an authoritative home↔community graph the
portals only approximate for listed homes). **Bootstrap trick:** listing feeds (realtor.com/MLS via
SteadyAPI, and the scrape) carry the CLEAN marketed community name for the subset that is listed —
use those clean-name↔coordinate pairs to auto-seed the platted-subdivision → marketed-community
alias map, then apply it to ALL parcels via the spatial join.

## Data model

- `data_lake.community_boundaries` — subdivision/neighborhood polygons (both counties), name,
  county, source.
- Parcel-field expansion: add `PHY_ADDR1` (situs), `S_LEGAL`, geometry/centroid, AND the DOR use
  code / property_type to the parcel ingest (both counties); guard load-bearing columns before any
  `replace` (Gate 4). Property type = single-family / condominium / mobile / duplex-small-multifamily
  / cooperative / misc-residential (vacant + non-residential excluded from home counts).
- `data_lake.parcel_neighborhood` — **EVERY** residential parcel_id → neighborhood/subdivision slug
  (the Tier-1 join output, all ~616K homes), + property_type + per-parcel just-value. Condos joined
  per unit (each folio a row).
- `data_lake.neighborhood_stats` — ONE row per subdivision/neighborhood (thousands), authoritative
  aggregates: home_count, count-by-type, median just-value, price-per-sqft, homestead ratio,
  recent-sales. The universal Tier-1 surface the pages / Lab AI / assistant query per address.
- `data_lake.community_profiles` — ONE row per **marketed** community (~300): the Tier-2 fact set
  (golf/fee/amenity scrape + Mapbox enrichment) merged onto that community's Tier-1 aggregates,
  per-field `source_url` + `as_of`. Brain-first gate satisfied (the brain consumes it).

## The brain — `communities-swfl` (reporter, neutral)

- Leaf reporter (facts, no opinion): `direction: neutral`, low magnitude, `skipSynthesisAgent`
  (deterministic, no LLM synthesis) — same class as `active-listings-swfl` / `storm-history-swfl`.
- **`detail_tables`** carries the **marketed-community** catalog (one row per ~300 branded
  communities, keyed by slug; columns = the Tier-2 fact set). This is the LOOKUP surface a downstream
  Claude answers a specific-community question from. The universal Tier-1 backbone (thousands of
  neighborhoods, ~616K homes) is TOO large for the OUTPUT block — it lives in `neighborhood_stats` /
  `parcel_neighborhood` lake tables, queried per-address by the pages / Lab AI / assistant (same
  pattern as `market-context.ts` reading lake views by scope), not embedded in the dossier.
- **`key_metrics`** = a handful of cited aggregates spanning BOTH tiers: total homes catalogued by
  type (Tier 1), homes-in-gated-communities (the Tier-1 output the operator asked for), community
  count, share bundled vs equity, median HOA-range midpoint (Tier 2).
- **Master wiring:** add to master `input_brains[]` (plain, non-critical, `input`) AND `sources[]`
  (mirror — the documented HOLD landmine), commit `brains/communities-swfl.md` in the same push.
  Neutral/magnitude-0 → cannot skew the market vote; master's `grain_boundary.routes` can offer a
  drill into it (route-don't-guess).

## Consumption surfaces (all four)

1. **Lab AI — emails + social (the operator's priority).** Extend `lib/email/market-context.ts`:
   a `communityFigures()` loader reads `community_profiles` and emits cited `MarketFigure[]` (golf
   structure, fee range, home count, gated, drive-to-airport, nearby-dining count) into the
   **DATA MENU** (`figuresToPromptBlock`) the fill-AI states numbers from, plus a community
   **dossier** (prose context for "better buy" judgment; numbers only from the menu). These figures
   already "ride into every builder (email lab + social)", so one seam feeds both.
   The SAME loader serves Tier 1 for ANY address (neighborhood stats + nearby/drive-times), so a
   non-gated home still gets a cited "here's your neighborhood + what's around you" build.
2. **Chat assistant.** Community-name detection (off the brain's row labels + aliases) → inject that
   community's cited facts block at the existing grounding append-seam in
   `lib/assistant/conversation-path.ts` (twin of `sourcedFiguresBlockForZip`). An address/neighborhood
   that isn't a marketed community still resolves to its `neighborhood_stats` row — no dead ends.
3. **Pages.** A drill route `app/r/communities-swfl/[community]` renders each marketed community from
   `detail_tables` (prose + cited panel, `GatedResidenceCommunity` JSON-LD via `lib/jsonld.ts`),
   pattern-matched to `cre-swfl/[corridor]`; a lighter neighborhood view renders any Tier-1
   subdivision from `neighborhood_stats`.
4. **Region read** routes to it via `grain_boundary.routes` (no vote impact).

## Provenance & no-invention

- Four-lane at ANY grain (home / neighborhood / community): authoritative parcel-derived numbers
  (lane 1), scraped named-web facts (lane 3, cited + as-of), Mapbox-computed access/nearby (lane 1,
  cited to Mapbox). No invented number ever.
- When two sources disagree on a community, keep both / flag (discrepancy rule); the customer
  artifact shows one source per metric (`singleSourcePerMetric` already does this in market-context).

## Cadence (split — "set and forget" without stale values)

- Golf / fees / amenities / holes / nearby / drive-times: rarely change → long TTL, manual/rare
  rebuild.
- Parcel **values + sales**: refresh with the annual FDOR tax roll → annual refresh of the
  authoritative-homes columns only. Cadence registry entries reflect both (ODD-parked where the
  scrape can't cron cleanly).

## Guardrails (honored in the build)

- **No paid `web_search` in the pipeline** (locked 07/05/2026). Scrape = crawl4ai fetch (free). Any
  fact-extraction from scraped HTML = one small **Haiku** distill per community WITH matched
  content, wired to `ingest.lib.api_usage.RunBudget` ($1/run cap) + daily-ceiling preflight.
- **Vocab + pack same commit** (orphan-lint gate); atomic type shape; probe-before-ingest; Gate 4
  non-null guard before any parcel `replace`; TDD; `--target-only` rebuilds.
- **Mapbox** enrichment is computed at **neighborhood grain** (per subdivision centroid — thousands,
  not per-home) and reused by every home in it; a specific address gets an on-demand computation.
  Bounded, cached, refreshed rarely — not an LLM cost, and never 616K calls.

## Phases (independently shippable; universal join first)

1. **Universal backbone spike (GO/NO-GO):** parcel-field ingest (situs, geometry, DOR type) +
   `community_boundaries` + spatial join → `parcel_neighborhood` for ALL ~616K homes (condos per
   unit) + `neighborhood_stats` aggregates by type. Gate on assignment-quality criteria above. This
   alone is shippable value: every home has a neighborhood + real stats.
2. **Marketed profile:** scrape golf/fee/amenity → `community_profiles`, keyed onto the Tier-1
   backbone (or scraped-only under the NO-GO fallback).
3. **Enrichment:** Mapbox drive-times + nearby-to-do at neighborhood grain → stats/profiles.
4. **Brain + pages:** `communities-swfl` pack (marketed catalog in detail_tables + both-tier
   aggregates) + drill route + neighborhood view + master wiring.
5. **Surfaces:** Lab AI (`market-context`, Tier-1 any-address + Tier-2 community) + chat grounding.

## Open questions (resolve at plan time)

- Exact Lee/Collier subdivision-boundary REST endpoints (discover from the opendata hubs in P1 T1).
- X/Y assignment-quality thresholds (set from the first spike run).
- Community boundary for the *marketed* community when it spans multiple plat subdivisions — union
  the matched subdivision polygons vs. draw from the scraped footprint.

## Success / live-verify

`communities_swfl_live_verify`: on prod, a named community (e.g. Heritage Bay) returns — via the
assistant AND an email build — its golf structure, fee range, authoritative-or-cited home count,
and a cited drive-time, every number carrying a source; the per-community page renders the same.
