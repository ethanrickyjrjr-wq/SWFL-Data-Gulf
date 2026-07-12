# Handoff — /desk v2 deferred items (choropleth, STORMS/PERMITS tabs, filter tabs)

**Date:** 2026-07-11 · **Parent spec:** `docs/superpowers/specs/2026-07-12-desk-v2-additions-design.md`
**What shipped instead:** ⌘K command bar, watchlist, alert rail, price-band histogram, correlation
heatmap, Wire file-this bridge — all built 07/11/2026 (check `desk_v2_additions_live_verify`).

These three were deliberately NOT built. Each has a concrete blocker; none is a scope cut for
convenience.

## 1. Mini-map choropleth

- **Blocker:** the served contractor SVG (`/maps/lee-collier.svg`) welds Fort Myers Beach (33931)
  to the mainland — the SAME standing hold that pulled `ZipChoropleth` from the zip-report County
  section. Do not ship the desk mini-map off that basemap; it would put a known-wrong geography on
  the flagship data page.
- **Ready when unblocked:** `components/charts/ZipChoropleth.tsx` + `lib/report/zip-choropleth-data.ts`
  are built, tested, and kept current. Per-ZIP values to color: `desk.watch` rows (already in the
  page payload) or `listing_active_stats` medians.
- **Unblock paths:** (a) corrected contractor SVG lands → re-run `scripts/clean-contractor-map.mjs`,
  verify 33931 is a real island, mount; or (b) decide Mapbox GL — new dep + token + design pass,
  NOT a bolt-on (spec it separately if chosen).

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
