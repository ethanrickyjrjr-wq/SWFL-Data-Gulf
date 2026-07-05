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

One self-maintaining reporter brain, `communities-swfl`, that catalogs the ~200–400 marketed
golf/gated communities across Lee + Collier, each carrying a full fact set (below), every number
cited to its source. It plugs into the existing brain machinery so it reaches all four consumption
surfaces for free-ish, and — because the data rarely moves — it rebuilds rarely. Golf-or-not and
fees are first-class, framed for the buy/no-buy question.

## Scope

- **In:** marketed golf / gated / amenity communities in Lee (12071) + Collier (12021). ~200–400.
- **Out (v1):** every platted subdivision with no amenity profile; the other 4 SWFL counties.
  Extensible later (a new community is a row; a new attribute is a column + a source).

## The fact set (per community)

Locked, grouped, extensible. Every field carries `source_url` + `as_of`.

- **Identity / geo:** name, canonical slug, aliases[], county, city, centroid (lat/lon), boundary.
- **Homes (authoritative — our parcels):** home_count, median just-value, value spread, homestead
  ratio, recent-sales count. *These are the hypothesis Phase 1 proves — see The Crux.*
- **Golf (scrape):** golf_structure ∈ {bundled, equity, optional, none}, golf_holes, courses. HEADLINE.
- **Fees (scrape):** hoa_fee_range, cdd_flag. HEADLINE.
- **Inside the gates (scrape):** gated, pool, tennis, pickleball, fitness, clubhouse,
  on_site_dining, boating/marina — structured flags + full amenity list.
- **Access — drive-times (Mapbox):** minutes/miles to RSW airport, nearest Gulf beach,
  downtown (Naples / Fort Myers), nearest hospital.
- **Nearby to-do (Mapbox):** dining / shopping / entertainment — counts + notable named places
  within a short drive.

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

- **Mechanism = spatial join.** Parcel polygon/centroid ∩ **subdivision boundary polygons**. Both
  counties publish these as open data — Lee "Subdivisions"
  (`leegisopendata2-leegis.opendata.arcgis.com/datasets/subdivisions`), Collier via its GIS Hub
  (`hub-collierbcc.opendata.arcgis.com`). `S_LEGAL` is a secondary cross-check only, NOT the
  mechanism (its query surface was flaky in-session; the spatial join does not depend on it).
- **Name reconciliation.** Subdivision-layer names → canonical community slug + aliases[]. A
  marketed community can span multiple platted subdivisions (e.g. "HERITAGE BAY UNIT n" → Heritage
  Bay); the alias map (pattern extends `refinery/lib/corridor-aliases`) collapses them.
- **Success criteria (the gate):** ≥ X% of parcels in the target communities assigned to a
  boundary, and ≥ Y% of the ~300 scraped communities matched to a boundary with a plausible
  home_count. (Set X/Y at plan time from the first spike run.)
- **NO-GO fallback (still ships):** if assignment quality is poor, the brain degrades to
  scraped-community aggregate facts only — home counts become lane-3 (55places, cited estimate)
  instead of authoritative. The product still works; only the "ours not estimates" claim waits.

## Data model

- `data_lake.community_boundaries` — subdivision polygons (both counties), name, county, source.
- Parcel-field expansion: add `PHY_ADDR1`, `S_LEGAL`, geometry/centroid to the FDOR ingest (both
  counties); guard load-bearing columns before any `replace` (Gate 4).
- `data_lake.community_parcels` — parcel_id → community slug (the join output), + per-parcel value.
- `data_lake.community_profiles` — ONE row per community: the full fact set above, merged from
  authoritative (parcel-derived) + scraped + Mapbox lanes, per-field `source_url` + `as_of`.
  This is what the brain and the Lab AI read. Brain-first gate satisfied (the brain consumes it).

## The brain — `communities-swfl` (reporter, neutral)

- Leaf reporter (facts, no opinion): `direction: neutral`, low magnitude, `skipSynthesisAgent`
  (deterministic, no LLM synthesis) — same class as `active-listings-swfl` / `storm-history-swfl`.
- **`detail_tables`** carries the per-community catalog (one row per community, keyed by slug;
  columns = the fact set). This is the LOOKUP surface a downstream Claude answers a specific-
  community question from.
- **`key_metrics`** = a handful of cited aggregates (community count, share bundled vs equity,
  count gated, total homes catalogued, median HOA-range midpoint).
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
2. **Chat assistant.** Community-name detection (off the brain's row labels + aliases) → inject that
   community's cited facts block at the existing grounding append-seam in
   `lib/assistant/conversation-path.ts` (twin of `sourcedFiguresBlockForZip`).
3. **Per-community pages.** A drill route `app/r/communities-swfl/[community]` renders each community
   from `detail_tables` (prose + cited structured panel), pattern-matched to `cre-swfl/[corridor]`;
   `GatedResidenceCommunity` JSON-LD (verified schema.org type) via `lib/jsonld.ts`.
4. **Region read** routes to it via `grain_boundary.routes` (no vote impact).

## Provenance & no-invention

- Four-lane at community grain: authoritative parcel-derived numbers (lane 1), scraped named-web
  facts (lane 3, cited + as-of), Mapbox-computed access/nearby (lane 1, cited to Mapbox). No
  invented number ever.
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
- **Mapbox** enrichment is a bounded one-time compute (~400 communities × a few targets/searches),
  cached, refreshed rarely — not an LLM cost.

## Phases (independently shippable; join first)

1. **Backbone spike (GO/NO-GO):** parcel-field ingest + `community_boundaries` + spatial join →
   `community_parcels` + authoritative per-community counts/values. Gate on success criteria above.
2. **Profile:** scrape golf/fee/amenity → merge into `community_profiles` (keyed to the backbone,
   or to scraped-only communities under the NO-GO fallback).
3. **Enrichment:** Mapbox drive-times + nearby-to-do → `community_profiles`.
4. **Brain + pages:** `communities-swfl` pack (detail_tables + aggregates) + drill route + master wiring.
5. **Surfaces:** Lab AI (`market-context`) + chat grounding.

## Open questions (resolve at plan time)

- Exact Lee/Collier subdivision-boundary REST endpoints (discover from the opendata hubs in P1 T1).
- X/Y assignment-quality thresholds (set from the first spike run).
- Community boundary for the *marketed* community when it spans multiple plat subdivisions — union
  the matched subdivision polygons vs. draw from the scraped footprint.

## Success / live-verify

`communities_swfl_live_verify`: on prod, a named community (e.g. Heritage Bay) returns — via the
assistant AND an email build — its golf structure, fee range, authoritative-or-cited home count,
and a cited drive-time, every number carrying a source; the per-community page renders the same.
