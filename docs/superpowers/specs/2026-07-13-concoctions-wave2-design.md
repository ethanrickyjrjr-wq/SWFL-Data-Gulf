# Concoctions wave 2 — Market Profile defs + compose recipe

**Date:** 2026-07-13 · **Check:** `concoctions_wave2_live_verify` · **Status:** approved design (operator, this session)

## Problem

The concoction registry shipped 07/12 with four starter defs (corridor profiles, ZIP listing activity, NFIP storm years, asking-price trend), but the richest deliverable-ready data we hold is still invisible to the builder: the desk's proven zones (KPI row, daily pulse, price bands, movers board) each sit behind a bespoke loader in `lib/desk/loaders.ts`, and `market_details_swfl_latest` — a single table holding the entire market-profile stat set per ZIP — feeds only a hotness gauge. A user or the author engine building a market-update email today can pull listing activity and corridor rents, but not the one composition every agent-facing report in the market is built from: snapshot stats + place profile + motion + ranked list.

## Goal

Six new registry defs (10 total) that make "one place, whole email" real: any ZIP or county becomes a complete market-update canvas — email and PDF both, since the grid canvas already renders to PDF — plus one digit-free compose recipe so the author engine stacks them from a single prompt ("build me a Cape Coral market email"). No engine changes; wave 2 is pure registry content on the locked 07/12 architecture.

## Decisions locked (operator, 07/13/2026)

1. **Slate: the Market Profile wave — 6 defs** (over flagship-only and 8-def breadth options): `zip-market-profile`, `market-snapshot`, `daily-market-pulse`, `price-bands`, `zip-movers`, `home-values-rents`.
2. **Compose recipe ships in-wave** (over defs-only): an advisory, digit-free stack hint riding the existing author `datasetsSection` lane — this is what turns six defs into the one-prompt payoff.
3. Design approved as presented: shared-helper extraction only where copy #2 triggers; degenerate fixtures mandatory per def; no desk migration.

## Evidence

### Outside (crawl4ai, 07/13/2026)

- **Altos Research** (altosresearch.com + /market_reports): the incumbent agent-report product is a weekly, ZIP-grain, agent-branded report whose flagship "Real-Time Market Profile" block set is: median list price, price per sqft, days on market, price-decreased %, price-increased %, relisted %, inventory, median rent, most/least expensive, and a proprietary Market Action Index ("buyer's or seller's market") — "written, readable, ready to use," CRM-delivered on the agent's behalf. Their stated edges: timely (weekly vs monthly-lagged), precise (ZIP + price quartiles), actionable (index visualizations). We hold every column in that block set and scan daily.
- **FollowUpBoss real-estate newsletter guide** (followupboss.com/blog/real-estate-newsletters): the market-update newsletter module = "homes sold, market recaps, average prices" *with a digestible takeaway*, balanced against non-listing content (local news, neighborhood guides); pure listing blasts drive unsubscribes. Validates snapshot + takeaway prose + one motion module as the composition, and validates a demographics/neighborhood def as a future wave.
- Prior-session evidence (07/12 spec) still governs the architecture: Evidence.dev optional-first binding, Cube-style curated registry, Notion turn-into semantics, Unlayer synced blocks, Google/Airtable freshness composition.

### Held-data probes (lake MCP, live 07/13/2026)

- `market_details_swfl_latest`: 54 ZIPs; days-on-market 68–172 (31 distinct), price/sqft $125–$1,196 (49 distinct), median rent non-null 49/54, hotness 49 distinct, list-to-sold 51/54 non-null, latest capture 07/04/2026. Columns: zip_code, county, median_sold_price, median_listing_price, median_rent_price, median_days_on_market, median_price_per_sqft, local_hotness_score, list_to_sold_ratio_pct, market_strength, sold_to_rent_ratio, is_competitive, captured_date, source_tag.
- `zhvi_zip_latest`: 109 ZIPs with home_value_latest + value_yoy_pct/value_mom_pct. `zori_zip_latest`: 94 ZIPs with rent_index_latest + rent_yoy_pct/rent_mom_pct. Join key zip_code; both carry county_name/city.
- `census_acs_zcta`: 95 ZIPs with income/age/owner-occupancy — viable, parked for a future wave (operator picked 6-def slate).
- `leepa_sold_median_by_zip`: 38 true-ZIP rows (non-fallback) — parked, future wave.
- `lee_building_permits`: 289 issued in trailing 180d (corridor-scoped ingest, thin) — parked.
- Desk traps inherited as law: `listing_active_stats` carries a stray duplicate county rollup (observed Lee row with listing_count=1 beside the real ~20.7k — keep-max-count rule in `loadActiveStats`); `listing_pulse_daily` needs partial-scan detection (`detectPartialScans` in `lib/desk/mappers`); movers need the `MOVERS_MIN_ACTIVE` floor; hotness reads filter through `isCoreScope`.

## What we're building

### 1. `zip-market-profile` — flagship

- **Source:** `data_lake.market_details_swfl_latest`, filtered `isCoreScope(zip_code)`.
- **Params:** `{ zip?: string, county?: enum[Lee, Collier] }` — zip = spotlight, county = comparison, neither = all core ZIPs.
- **Columns:** dimensions zip_code, county, market_strength; measures median_listing_price (currency), median_sold_price (currency), median_rent_price (currency, null-share ceiling ~0.15), median_days_on_market (number), median_price_per_sqft (currency), local_hotness_score (number), list_to_sold_ratio_pct (percent). Guard values pinned from the probe above; every measure has real spread today.
- **asOf:** max `captured_date`. **sourceLine:** resolved from the table's `source_tag` at build time (never asserted from memory); citation surface follows the existing citation root rules.
- **defaultLayout:** hero (median listing price) + stats (DOM, $/sqft, median rent) + image/chart (top-10 by hotness when county/all grain; degrades per guard law) + list + sources.

### 2. `market-snapshot` — the opener

- **Sources (first multi-table def, all in one `load()`):** `listing_active_stats` (region + county rollups: median_list_price, listing_count — with the keep-max-count dedupe baked), `listing_momentum_stats` (region/county price_reduced_share, new_listing_share), `daily_truth` (latest `mortgage_30yr_fixed` reading + its source_title).
- **Params:** `{ county?: enum }` — absent = SWFL region rollup.
- **Columns:** measures median asking price (currency), active listings (number), price-cut share (percent), 30-yr mortgage (percent, 2dp) — the mortgage column is national; its label says so (desk `national: true` convention).
- **asOf:** per-feed vintages differ — block-level as-of follows each feed (the desk's "blended stamp is a lie" rule); the def's asOf = latest spine scrape.
- **defaultLayout:** stats row (the four KPIs as metric cards) + sources. Small by design — it's the composition's top block.

### 3. `daily-market-pulse`

- **Source:** `data_lake.listing_pulse_daily` (day × new_listings, price_cuts, price_increases, returned, departures, sold, withdrawn, total_events).
- **Params:** `{ window?: enum[7d, 14d, 30d] }`, default 14d.
- **Copy-#2 extraction:** `detectPartialScans` / `flagCarryoverDays` move from `lib/desk/mappers` to `lib/listings/scan-quality.ts`; desk and def both import it. The partial-scan caveat must ride into materialized block text — a partial scan can never present as a quiet low day.
- **defaultLayout:** image/chart (new listings by day trend) + stats (latest-scan new/cuts/sold, caveated when partial) + sources.

### 4. `price-bands`

- **Source:** `data_lake.listing_price_bands`, region rows (`county IS NULL`) or county rows per param, ordered by band_order.
- **Params:** `{ county?: enum }`.
- **Freshness stance (differs from desk deliberately):** the desk hides the zone past 7 days; a concoction loads whatever exists — staleness surfaces through the as-of chip and the draft Update-chip machinery, never a refusal, never a silent stale render.
- **defaultLayout:** image/chart (band × listing_count bar) + hero (total actives across bands) + sources.

### 5. `zip-movers`

- **Source:** `listing_momentum_stats` per-ZIP joined in-load to `listing_active_stats` ZIP medians (the desk does this join in memory; here it's one def, one place).
- **Params:** `{ metric: enum[price_cuts, new_listings], county?: enum }`.
- **Baked exclusion:** the `MOVERS_MIN_ACTIVE` floor (import the desk constant, don't copy the number) so small-sample ZIPs can't top the board.
- **defaultLayout:** list (ranked ZIPs: share %, active count, median ask) + image/chart (top-10 bar) + sources.

### 6. `home-values-rents`

- **Source:** `zhvi_zip_latest` LEFT JOIN `zori_zip_latest` on zip_code (in-load merge; value side is the spine — 109 ZIPs, rent attaches where held).
- **Params:** `{ county?: enum, zip?: string }`.
- **Columns:** home value (currency) + value YoY (percent) + rent index (currency) + rent YoY (percent); rent columns carry a null-share guard (94/109 coverage).
- **sourceLine:** names both indexes (Zillow Home Value Index / Zillow Observed Rent Index).
- **defaultLayout:** stats + image/chart (value YoY by ZIP, topN) + list + sources.

### 7. Compose recipe (author wiring)

One advisory, digit-free addition in the `author-section` lane (the existing `datasetsSection` pattern): for market-update / farming / "how's the market in X" intents, the stack is snapshot on top → place profile (`zip-market-profile`) → motion (`daily-market-pulse` or `zip-movers`) → ranked detail (`zip-listing-activity`); investor intent swaps in `home-values-rents`. Selection and slicing stay the model's job; every number still bakes through the materializer and the existing fences. Registry `description` fields for all six defs are product copy, digit-free (registry test pins this).

## Testing

- Per-def fixture tests with a **mandatory degenerate-data fixture** each: constant column, null-heavy column, and — for `market-snapshot`/`price-bands`/`zip-movers` — the phantom/duplicate rollup row.
- Registry index test extends to 10 defs; digit-free description pin covers the new six.
- Materializer round-trips (load/rebind/turn-into) on one wave-2 fixture (`zip-market-profile`) to prove the multi-measure profile survives turn-into.
- Shared-helper extraction keeps desk behavior pinned: existing desk tests stay green after the `detectPartialScans` move.
- Compose recipe: author-section test proves the recipe text is digit-free and only rides when a market-update intent resolves.
- Verify: `bunx next build` (never `npx tsc`).

## Non-goals (wave 2)

- No desk migration to the registry (opportunistic folding stays the rule; only the partial-scan helper moves, because copy #2 triggered).
- No new block types, no engine/materializer changes, no PDF work (the canvas already renders to PDF via `lib/pdf/email-doc-pdf.tsx`).
- No open composer; no upload/web-lane extractors.
- Parked with evidence for a future wave: `census-zip-demographics` (95 ZIPs), `county-sold-medians` (assessor lane, 38 Lee ZIPs), building permits (corridor-scoped, thin).
