# Desk price: daily asking line + monthly sold anchor

**Date:** 2026-07-11 · **Check:** `daily_price_dual_signal_live_verify`

## Problem

`data_lake.daily_truth.median_sale_price` has been **NULL for every row** — 19 days × 3 cities
(cape_coral, fort_myers, naples), every row `status_reason = "all cascade legs returned no sourced
number"` (verified live 07/11/2026). The desk hero + price-trend panel fall back to ZHVI monthly.

Root cause is **not** a flaky cascade — it's the **wrong lane**. The metric is wired
`fetch_mode: search`: a Gemini grounded web-search (`ingest/pipelines/live_search/engine.py`) whose
three fallback legs (`firecrawl_search`, `spider_search`, `claude_last_resort`) are all dead stubs
that `return None`. When Gemini returns no grounded number → NULL, no fallback. The mortgage metric
beside it works because it uses `fetch_mode: api` against FRED (deterministic, authoritative).

The deeper truth (the reason someone reached for a web-scrape in the first place): **there is no such
thing as a daily, source-faithful, city-grain SOLD median.** Sold prices lag (deeds record over
days/weeks); our own sold-capture (`listing_transitions` to_state='sold') is **77 rows total**
(~1 month, all of Lee+Collier) — too thin for a stable daily city number; and every true-sold feed we
hold is **monthly**. The daily cron was chasing a number with no daily source.

## Live evidence (all verified in-session 07/11/2026, RULE 0.4 / RULE 1)

- **SteadyAPI `/housing-market-details`** (`new_steady` key): returns `median_sold_price` but is
  **ZIP-only** — `city=`, `location=`, `location="Lee County, FL"` all 422 "zipcode field is required".
  Already ingested → `data_lake.market_details_swfl` (54 Lee+Collier ZIPs, monthly). City number would
  be median-of-ZIP-medians = `[INFERENCE]`, not source-faithful. Good for ZIP drill, not a daily hero.
- **Redfin county tracker** (already ingested, `redfin_lee_market` / `redfin_collier_market`): clean
  `median_sale_price` + YoY + homes_sold, but **county grain only** ("Lee County, FL"), monthly.
- **Redfin CITY tracker** (`.../redfin_market_tracker/city_market_tracker.tsv000.gz`, free, not yet
  ingested): HTTP 200, ~1 GB gz, columns `REGION / PROPERTY_TYPE / MEDIAN_SALE_PRICE` present, and
  **all three cities verified present**: "Cape Coral, FL", "Fort Myers, FL", "Naples, FL". Source-
  faithful true-SOLD median at exactly the desk's city grain — but **monthly**.
- **Live active inventory** (`data_lake.active_listings_residential` + `_zip_stats`): fresh **today**
  (Lee 34 ZIPs / 4,762 listings, Collier 21 ZIPs / 2,812, every ZIP with `median_list_price`). This is
  the only genuinely **daily-moving** price we can source honestly — but it's **asking/list**, not sold.
- **crawl4ai**: not the tool here — our own data beats scraping this metric. Its place is wiring the
  dead cascade legs for metrics we don't already hold.

## Decision (operator, 07/11/2026)

Show **both**, both source-faithful, both honestly labeled:
- **Daily asking line** — median list price per city from live active inventory (moves every day).
- **Monthly sold anchor** — true median sale price per city from Redfin city tracker (real sold).

Rejected: daily-asking-only (loses the sold benchmark); monthly-sold-only (hero stops moving daily).

## What we're building

1. **Redfin CITY ingest** (net-new) — mirror `ingest/pipelines/redfin_lee` streaming-gzip-filter
   pattern against `city_market_tracker.tsv000.gz`, filtered to REGION ∈ {Cape Coral, Fort Myers,
   Naples}, FL → `data_lake.redfin_city_swfl` (PK region, period_end, property_type). Ships with
   `--dry-run`, GHA monthly cron wrapper, `cadence_registry` entry, pipeline-freshness row, tests,
   `VolumeGuardError` on empty pull + `assert_content_fresh` (55d, monthly). Provenance = redfin.com.
2. **Daily city asking rollup** — a per-city median list price for {cape_coral, fort_myers, naples}
   from active inventory. **CORRECTED 07/11/2026 (check `price_source_wire_off_stale_seed_table`):**
   read the CLEANED view the desk already uses — `data_lake.listing_active_stats` /
   `active_listings_residential_zip_stats` — NOT the raw seed `data_lake.active_listings_residential`.
   The raw seed carries rental/staleness contamination fixed at the view level on 06/26/2026
   (`docs/sql/20260625_active_listings_residential_zip_stats.sql`); querying it directly produced the
   bogus "Collier asking $309k / 2× gap vs sold" this doc originally reported. From the clean rollup
   Collier asking is ~$610k against Redfin sold ~$625k (within ~2.4%). Pin ONE authority (the desk's
   existing `listing_active_stats` read); the two clean views disagree on Lee ($296k vs $445k), so do
   not roll a fresh percentile off the raw table.
3. **Desk wiring** (`lib/desk/loaders.ts`) — hero + price-trend read the **daily asking** series as
   the moving line and the **monthly sold** value as the anchor, labeled distinctly ("asking" vs
   "sold, as of MM/DD/YYYY"). Four-lane: never refuse; ZHVI stays the deepest fallback.
4. **Retire the broken price web-search** — drop `median_sale_price` from the `live_search` daily
   cron / `daily_truth` (stop the NULL-producing Gemini calls). Mortgage metric stays. Keep the
   `daily_truth` row-writer intact for mortgage; remove only the price metric config + its cron target.

## Honesty / labels

- Asking ≠ sold — the daily line is labeled **asking/list price**, never "sale price".
- The sold anchor states its as-of date once (MM/DD/YYYY), monthly cadence made visible ("steps
  monthly"). No smoothing, no invented daily interpolation of the sold number.
- SteadyAPI name never surfaced; Redfin surfaced as redfin.com provenance.

## Verify (closes `daily_price_dual_signal_live_verify`)

- Redfin city ingest live run writes ≥1 row per city to `redfin_city_swfl`; dry-run prints intended
  rows, zero network on `--dry-run`.
- Desk hero renders a daily-moving asking line + a monthly sold anchor for all 3 cities (no ZHVI
  fallback when both feeds present).
- `median_sale_price` no longer fired by the daily cron (no new NULL rows).
