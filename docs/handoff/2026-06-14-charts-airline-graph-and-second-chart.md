# /charts — airline graph fix + a second chart (HANDOFF, 2026-06-14)

**Status: DONE — built 2026-06-14 on branch `claude/charts-airline-total-passengers-yoy`.**
Part 1 (airline graph): `total_passengers` + 12-month trend line. Part 2 (second chart):
YoY% momentum from `zhvi_pivoted`. All tests pass, tsc clean. See SESSION_LOG for commit.

The forward-looking chart *rules* live in `app/_design/07-charts-and-dataviz.md`
(read §1, §2, §6 before touching anything). The previous charts story is
`docs/handoff/2026-06-13-charts-rebuild.md` (parts of it are now stale — see
below).

---

## The ask (verbatim intent)

1. Fix the `/charts` **airline graph** to include the new airport data we landed
   today — but don't dump every metric, only what makes a *good* chart.
2. Pick **one more** interesting dataset (or an algorithm over data we have),
   make a second chart, and **try out one item from the UI kit**.

---

## PART 1 — Airline graph fix (APPROVED design, ready to build)

### What the chart is today
`/charts` is `app/charts/page.tsx` (a Server Component that reads Supabase and
renders `MetroAreaChart`). Three panels: home values, rents, **air travel**.

The air-travel panel = `loadPassengers()`. It hard-filters
`.eq("metric", "enplanements")` — **departures only** — and plots a single line.
Title is "Air travel through the region" but it only shows boardings, so the
title oversells what's drawn.

### The new data (CONFIRMED LIVE — probed this session)
`public.rsw_airport_monthly` now holds **all 5 LCPA metrics**, 516 rows each,
**1983-05 → 2026-04**: `enplanements`, `deplanements`, `total_passengers`,
`aircraft_operations`, `total_freight_lbs`. Verified via direct psycopg query.
`total_passengers` recent values: Apr 2026 = 1,152,669 · Mar = 1,521,149 (the
snowbird peak) · Feb = 1,190,070 · Jan = 1,063,645.

> **Stale doc to correct in the same PR:** `docs/handoff/2026-06-13-charts-rebuild.md`
> has a section "Air travel = departures only (read this before 'add arrivals')"
> claiming *"We do not hold deplanement data… adding arrivals is a data/ingest
> task."* That is now FALSE — the RSW v3 ingest landed all 5 metrics on
> 2026-06-14. Also fix `app/_design/07-charts-and-dataviz.md §7` (it still
> describes the panel as "monthly enplanements, →2026-04 (640,135…)").

### The approved design
Switch the line from `enplanements` → **`total_passengers`** (now the title is
true — total regional throughput, arrivals + departures), AND overlay a
**12-month moving-average trend line**. Two series, no clutter, and it mirrors
exactly how the `rsw-airport` brain reads direction (trailing-12 deseasonalizes
the ~1.71 snowbird seasonality ratio). Do **not** plot all 5 metrics; do **not**
plot enplanements vs deplanements as two lines (they're ~equal each month → two
near-duplicate lines, a bad chart).

### Implementation (≈ small; component is already N-series capable)
`MetroAreaChart` (`components/charts/ZHVIAreaChart.tsx`) already supports N series
via `series: ChartSeriesDef[]` (key/label/color/dash), `variant: "line"|"area"`,
an interactive legend (auto-shows when `series.length > 1`), and dash
double-encoding for colorblind. So this is mostly a data + series-def change:

1. **`lib/charts/airport-series.ts`** — extend the mapper (or add
   `mapAirportTotalWithTrend`) to emit rows `{ month, passengers, trend }` where
   `trend` is the trailing-12-month mean of `passengers` (null until 12 obs).
   Compute the trend over the FULL ascending series **before** the component
   slices by range — `MetroAreaChart` slices `sortedAndFilteredData` (6M/1Y/2Y/
   ALL), so the trend value must already sit on each row or it vanishes in the
   short views. Add a pure `movingAverage(values, window)` helper and unit-test
   it (TDD — this is the one bit of real math).
2. **`lib/charts/series.ts`** — add a 2-entry `REGION_AIR_TRAVEL_SERIES`:
   `passengers` (gulf-teal `#3dc9c0`, solid) + `trend` (neutral-gold `#d4b370`,
   dashed `"8 5"`). `REGION_PASSENGER_SERIES` is imported only by the page; you
   can replace it or add alongside.
3. **`app/charts/page.tsx`** — in `loadPassengers()` change
   `.eq("metric", "enplanements")` → `.eq("metric", "total_passengers")`; map
   with the new mapper; point the panel at `REGION_AIR_TRAVEL_SERIES`; update the
   subtitle (e.g. "Passengers per month — total throughput, with 12-month
   trend"). Keep `valueFormat: "count"`. Title "Air travel through the region"
   stays (now accurate).

---

## PART 2 — Second chart + a UI-kit item (OPEN — pick one)

This half was never settled on a final dataset. Pick a candidate, **verify its
data is live + clean + has real variation first** (design-standard §0/§7: a chart
earns its place; never chart data you haven't confirmed is populated and clean —
a thin/flat dataset makes a useless chart), then build.

### Hard constraint — what the UI kit can and can't be here
`app/_design/07-charts-and-dataviz.md §1.5` is a **locked rule**:
**no pie, donut, gauge, treemap, or 3-D — ever** (angle/area encodings read
poorly). That **rules out** two of the UI-kit visuals for the public hub:
- ❌ **Seasonal Radial** (kit #05, `SeasonalRadialChart.tsx` / `SeasonalRadialFrame`)
- ❌ **Z-Gauge / freight nowcast** (kit #04, `ZGaugeFrame`)

Allowed encodings: **line, bar, and scatter** (position/length). So the UI-kit
item you "try" must be one of those.

### Vetted candidates (standard-compliant)
- **Corridor Market Scatter** (kit #01) — `CorridorMarketScatter.tsx` is already
  built (ECharts), cap-rate × vacancy bubble scatter for 8 CRE corridors. Scatter
  is allowed. ⚠️ Verify the corridor data is live-queryable from the server page
  (it may be fixture-only / a one-time Premise copy) before wiring.
- **Home-value YoY momentum** — a `%` year-over-year LINE derived from the
  `data_lake.zhvi_pivoted` view already read on `/charts` (live, auto-refreshing,
  zero new source — the 06-13 handoff lists it as the obvious "4th chart"). Easy
  and clean, BUT it reuses the existing line component, so it doesn't really
  "try a new UI-kit item." Good fallback, weak on the kit requirement.
- **Flood-exposure composition** (kit #03, `CompositionFrame`) — a composition
  BAR (allowed; keep it part-to-whole, don't fake a stacked total). ⚠️ Verify
  env-swfl emits the data live.

### Data sourcing reality (so you don't pick a dead one)
`/charts` reads `data_lake.*_pivoted` views (zhvi/zori) or `public.rsw_airport_monthly`
server-side via `createServiceRoleClient`. Several Brains tables (corridor
profiles, TDT collections, etc.) are **one-time Premise copies with no refresh
pipeline** — prefer the genuinely cadenced sources (Zillow ZHVI/ZORI, RSW airport,
BLS, FDOT, FEMA) for a chart that stays live.

The in-chat registry frames (`components/charts/registry/frames/*`) take a
`{ spec }` (the in-chat `ChartSpec` system). To put one on the standalone
server-rendered `/charts` page you either build a `ChartSpec` from queried rows
and render the frame, or use the underlying standalone component. Decide which
before starting.

---

## Build gates & gotchas (do not skip)

- **RSC boundary — this is what reddened `main` on 2026-06-13.** The page is a
  Server Component; the chart is a Client Component. **You cannot pass a function
  prop across that boundary** — `next build` aborts at prerender ("Functions
  cannot be passed directly to Client Components"). Pass **serializable tokens**
  only (e.g. `valueFormat="count"`), resolve to a formatter *inside* the client
  component. (`07-charts-and-dataviz.md §6`.)
- **`tsc`, eslint, and `bun test` ALL pass the RSC bug — only `next build` (or
  `vercel build`) catches it.** Run a real build before pushing any page that
  wires a chart. This is non-negotiable for `/charts` work.
- **Palette + colorblind (§2):** gulf tokens only (`--gulf-teal #3dc9c0`,
  `--mangrove #5bc97a`, `--neutral-gold #d4b370`, `--sunset-coral #e08158`);
  they're near-iso-luminant, so **dash patterns + direct labels are mandatory**,
  not optional. ≤ 3 series per chart (§1.4).
- **No jargon (§3):** plain-language titles, no company names / acronyms / table
  names on the chart face; date every chart from real data freshness.

---

## File map

| What | Where |
| --- | --- |
| The page (Server Component, DB reads) | `app/charts/page.tsx` |
| Generic chart component (N-series, line/area) | `components/charts/ZHVIAreaChart.tsx` (`MetroAreaChart`) |
| Airport data mapper | `lib/charts/airport-series.ts` |
| Series presets (key/label/color/dash) | `lib/charts/series.ts` |
| Value-format tokens (serializable) | `lib/charts/format.ts` |
| Chart rules (READ FIRST) | `app/_design/07-charts-and-dataviz.md` |
| Previous charts story (partly stale) | `docs/handoff/2026-06-13-charts-rebuild.md` |
| Built UI-kit frames | `components/charts/registry/frames/` |
| Live airport table | `public.rsw_airport_monthly` (5 metrics × 516 rows) |
