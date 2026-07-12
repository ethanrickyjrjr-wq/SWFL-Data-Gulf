# Handoff — /desk v2 deferred items (STORMS/PERMITS tabs, filter tabs)

**Date:** 2026-07-11 · **Parent spec:** `docs/superpowers/specs/2026-07-12-desk-v2-additions-design.md`
**What shipped instead:** ⌘K command bar, watchlist, alert rail, price-band histogram, correlation
heatmap, Wire file-this bridge — all built 07/11/2026 (check `desk_v2_additions_live_verify`).

## ~~1. Mini-map choropleth~~ — BUILT 07/12/2026, no longer deferred

Operator ruling: reuse the map that already works on the homepage and /map. The first draft of this
handoff blamed the wrong asset — the welded-33931 hold applies to `public/maps/lee-collier.svg`
(plural, the `ZipChoropleth` basemap), while the homepage/`/map` page run `MapCanvas` over
`public/map/lee-collier.svg` (singular), which is live in front of users daily. Built: `MapCanvas`
gained an additive `override?: MetricDef` prop (fixture path byte-identical when absent; live path
colors via the homepage's `blendedT`/`rampColor` math from `home-map-types`), and /desk mounts it
as the "Asking-Price Map" zone with per-ZIP median asking prices the loader already held (zero new
queries, ≥20-ZIP floor, brand ramp per the 07/03/2026 operator ruling). `ZipChoropleth` + its
welded-SVG hold stay as-is for the zip-report County section — that hold was never about this asset.

## 2. STORMS / PERMITS tabs

- **Blocker:** the permits feed is not alive — exactly one live write has ever landed
  (`lee_permits_capdetail_waf_429`, Accela WAF saga). A tab on a dead feed violates the desk's
  empty-tolerant credo (a hidden zone is honest; an empty TAB is a broken promise in the nav).
- **Unblock:** permits cron proves sustained weekly writes first (watch `max(_loaded_at)` on
  `data_lake.lee_building_permits`). Storms content additionally needs a daily-cadence source —
  the env/storm brains are rebuild-cadence, not daily; decide what a STORMS tab actually shows
  before building.

## 3. New-construction / foreclosure filter tabs

- **Blocker:** none hard — descoped for size. Real tab filtering reshapes EVERY zone loader
  (each would need a flag-filtered variant); the inventory-mix strip already surfaces the counts
  from the same query lane (`countActiveFlag` in `lib/desk/loaders.ts`).
- **Approach when built:** thread an optional `flag` param through the zone loaders rather than
  forking them; the mix strip's lane comment marks the seam.

## Also left open (small)

- Register the two new chart zones (`desk-bands`, `desk-correlation`) in `PANEL_CONFIGS` +
  `AddChartToProject` so they're chart-saveable like `desk-price-trend`/`desk-pulse` (Phase 1b
  pattern). Skipped to keep this build page-scoped.
- `insiders_desk_stats_mock_grounding` — pre-existing RED grounding test on main (mock-data
  import); fix alongside the next desk touch (noted in the master punch list 07/11).
