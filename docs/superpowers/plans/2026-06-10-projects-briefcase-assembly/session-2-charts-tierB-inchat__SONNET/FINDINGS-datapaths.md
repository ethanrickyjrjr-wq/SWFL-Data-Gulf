# Task 01 — Findings: Tier-B Chart Data Paths

> Completed 2026-06-10. These findings are the authoritative source for Task 02.

## asking-rent

- **Source:** `fixtures/corridor-rents.json`
- **Field:** `nnn_asking_rent_per_sqft` (NNN $/sqft, nullable)
- **Count:** 27 total corridors; 19 have non-null rent values
- **As-of label:** "Jun 2026" (derived from `corridor-permits.json` `last_refined_at: 2026-06-09`)
- **Status:** DELIVERABLE — 19 ≥ 3 minimum bars

## vacancy

- **Source:** `fixtures/corridor-rents.json`
- **Field:** `vacancy_pct` (%, nullable)
- **Count:** 27 total; 19 have non-null vacancy values
- **As-of label:** "Jun 2026" (same fixture date)
- **Status:** DELIVERABLE

## zhvi

- **Source:** `fixtures/zhvi-trend.json`
- **Fields:** `month` (YYYY-MM), `cape_coral`, `fort_myers`, `naples` (all number)
- **Count:** 36 monthly entries; all fully populated (no nulls)
- **Last entry:** `month: "2026-04"` → as-of label "Apr 2026"
- **Consumer:** `ZHVIAreaChart` via `{ component: "zhvi", data: ZHVITrendEntry[] }` (not a ChartBlock — component handles rendering)
- **Status:** DELIVERABLE

## corridor-scatter

- **Source:** `fixtures/corridor-rents.json` + `fixtures/corridor-permits.json` + `fixtures/corridor-centroids.json`
- **Join key:** `CORRIDOR_ALIASES[rent.id]` → `permit.corridor_id` via `refinery/lib/corridor-aliases.mts`
  - Lee corridors: identity map (slug → same slug)
  - Collier corridors: identity map but `permits = null` (no coverage — component handles gracefully)
- **Consumer:** `CorridorMarketScatter` via `{ component: "scatter", data: JoinedCorridorRow[] }`
- **As-of label:** "Jun 2026" (permits `last_refined_at`)
- **corridor-permits.json is optional:** file is currently on disk (confirmed), but `buildScatterChart` handles absence gracefully (`.catch(() => [])`)
- **Status:** DELIVERABLE (Lee corridors with permits plotted; Collier `permits: null` — filtered inside component)

## flood-aal

- **Investigated:** `brains/env-swfl.md` — no `detail_tables` key anywhere in the brain markdown
- **Result:** No detail-table accessor resolved
- **Status:** DEFERRED — `buildChartForIntent` returns `null` for `flood-aal` scope

## ChartBlockView area/scatter renderer audit

File: `components/charts/ChartBlockView.tsx` lines 25-34  
Both `area` and `scatter` branches call `adaptToArea(block)` / `adaptToScatter(block)` from `refinery/lib/chart-adapter.mts`, which both simply delegate to `adaptToTable` → render an HTML table stub.  
**Fix (Task 02):** Replace with generic Recharts `AreaChart` (area) and `ScatterChart` (scatter) that read directly from the `ChartBlock.rows` / `.columns`.
