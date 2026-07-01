# market-heat region monthly trend detail_table (foundation)

**Date:** 2026-07-01
**Slug / check:** `market-heat-region-trend` · `market_heat_region_trend_live_verify`
**Companion research:** `_ASSISTANT/research/2026-07-01-taskC-charttype-verification.md` (the survey that
surfaced this: the market brains hold accumulating history but emit only the latest snapshot).

## Problem

The new market brains ingest and hold **monthly history** but emit only the **latest snapshot**, so the
over-time story a scheduled email wants ("SWFL inventory has climbed 4 months running", "days-on-market
trending down") has no data to plot. market-heat-swfl is the clearest case: it loads the full realtor.com
Core Inventory history (`coreByZip: Map<zip, Map<month, row>>`, `market-heat-swfl.mts:202-217`) but collapses
to the latest month per ZIP on output (`latestKey`, `:231-234`). The `_latest` snapshot is deliberate (the
aggregate `_latest` views exist to stay under the PostgREST 1000-row cap) — but nothing exposes the region
trend that already sits in memory.

This is the **foundation** build: emit the trend data. Plotting it as a trend line is the immediate
follow-up (a small time-series→`zhvi-area`/`trendChartSvg` wire), deliberately **out of scope here** —
operator chose foundation-only, and is not prioritizing website chat.

## Goal

market-heat-swfl emits a compact, date-indexed **region monthly trend** `detail_table` — the region median,
per month, of the core heat signals — computed in-brain from the history it already loads. Deterministic,
faithful (real medians of real lake data, no invention), aggregate-at-source (in-memory; no new SQL, no
extra reads), empty-tolerant, and future-proofed so the later chart wire detects it as time-series with zero
extra work.

## What we're building (one pack change: `refinery/packs/market-heat-swfl.mts`)

### 1. Compute the trend in `corpusSummary` (where the history is in hand)

`coreByZip` already holds every `(zip, month) → MarketHeatCoreRow`. Add a pure helper that inverts it to a
month-keyed region aggregate:

- For each `month` present across ZIPs, take the region **median** across ZIPs of the core numerics that are
  retained per-month on the row: `active_listing_count`, `median_days_on_market`, `pending_ratio`.
- Sort ascending by month; cap to the last **36 months** (tidy trend, trivially under the row cap).
- Reuse the existing `median()` helper (`:182`, null-safe).
- Store on `lastData` as `regionTrend: { month: string; active: number|null; dom: number|null; pending:
  number|null }[]`.

(Hotness is excluded from the MVP trend: `hotnessLatest` (`:203,214-215`) retains only the latest month per
ZIP, so per-month hotness history isn't in memory. Adding it means retaining hotness-by-month — noted as an
optional extension, not built here. The three core signals are the inventory/DOM/pending "heating vs
cooling" story and are already retained per month.)

### 2. Emit it as a `detail_tables` entry in `outputProducer`

Alongside the existing output, append one `BrainOutputDetailTable`:

- `id`: `market_heat_region_trend`
- `columns`: `month` (the date dimension — matches `DATE_COLUMN_RE` `/…|month|…/`, so the future picker
  reads it as time-series), then `region_median_active_listings`, `region_median_dom`,
  `region_median_pending_ratio` (numeric).
- `rows`: one per month from `regionTrend`, real medians; nulls preserved (never zero-filled).
- Carries the brain's existing `source`/citation (realtor.com Economic Research Data Library) — provenance,
  never policed.

### Data faithfulness (four-lane / no-invention)

Every cell is a **median of real lake values** (realtor.com Core Inventory, lane 1), computed
deterministically in code — an aggregation of held data, not an invented figure. Cited to the same
realtor.com source the brain already carries. A month with no qualifying ZIP values yields `null`, never a
fabricated number.

## What this does NOT do

- **No chart-path touch.** Does not wire `pickFramesForData`/`buildChartForQuestion` Layer 2, does not add a
  trend renderer. The detail_table is latent data until the follow-up charting wire lands.
- No new SQL view, no schema change, no new read (the history is already loaded from the parquets).
- No website-chat work.
- Does not touch the other market brains (that's the queued sweep).

## Contract discipline (refinery/packs gates)

- **Vocab (Gate 2):** if the `detail_table` id or any new emitted slug must be registered in
  `brain-vocabulary.json`, ship it in the SAME commit; audit `bun refinery/tools/check-vocab-coverage.mts
  --all`. (Confirm in the plan whether detail_table ids are vocab-tracked.)
- **Catalog (Gate 5):** keep `refinery/packs/catalog.mts` mirror in sync; `catalog.test.mts` + the pack's
  `bun:test` green.
- **Atomic:** no `PackDefinition`/`BrainOutput` type change expected (detail_tables already exist on the
  contract). If a type touch is needed, backfill all packs in the same commit.
- Rebuild with `--target-only` (avoid clobbering parallel `brains/*.md` + the cre-swfl egress hang).

## Testing (`market-heat-swfl.test.mts`)

- **Trend aggregation:** given a fixture `coreByZip` with 3 ZIPs × 4 months, the helper returns 4 rows in
  ascending month order, each the correct region median of active/DOM/pending (assert exact medians, incl. a
  null-in-one-ZIP case).
- **Cap:** 40 months of fixture → 36 rows (last 36).
- **Date recognition:** `isDateColumn("month")` is true (guards the future picker) — a one-line assertion so
  a rename can't silently break the trend detection.
- **Empty-tolerant:** empty `coreByZip` → no trend table (brain still emits its normal no-data path);
  1-month history → a 1-row table (valid, just not yet a `MIN_POINTS`≥3 time series).
- **Faithfulness:** no zero-filling — a month/metric with all-null ZIP values emits `null`.

## Blast radius

Low and contained — one pack, additive. market-heat's existing key_metrics / ranked-ZIP output is unchanged;
this only appends a detail_table. The daily rebuild picks it up on the next market-heat build. Because
nothing consumes the trend yet (foundation-only), there's no downstream render change to regress.

## Follow-up (queued, not built here)

The **whole sweep** (operator's call): replicate the region-trend pattern to price-distribution,
market-temperature, and listing-momentum (via aggregate-at-source region-trend SQL views, since those read
`_latest` and don't hold history in memory), plus the daily active-listings / listing-lifecycle inventory+DOM
trend — once this pattern is proven and the weekly/monthly crons accumulate depth. Then the single charting
wire (time-series detail_table → `zhvi-area`/`trendChartSvg`) lights up trend lines across all of them in
scheduled emails. Track as a new build/check.
