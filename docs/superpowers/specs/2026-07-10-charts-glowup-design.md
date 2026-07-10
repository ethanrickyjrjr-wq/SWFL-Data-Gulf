# Charts glow-up: gauge, heatmap, P/L momentum, tier projection

> **Recommended model:** ⚡ Sonnet — keywords: migration, refactor

**Date:** 2026-07-10
**Status:** DESIGN — pending operator review (brainstormed lane-B, autonomous; decisions below
are recommendations with the alternatives stated, veto at review)
**Check:** `charts_glowup_live_verify` · verdicts also fold into `bklit_charts_evaluation`'s
close note (adopt/pass per component) per the handoff
**Brief:** `docs/handoff/2026-07-10-charts-glowup-handoff.md`
**Research:** upstream source read at the PINNED commit `d7cd5827` via GitHub API in-session
07/10/2026 — upstream HEAD **is** d7cd5827 (2026-07-06), the same commit
`components/charts/vendor/bklit/NOTICE.md` already pins, so this pass vendors from the same
tree with zero drift. Import closures below are from the actual `.tsx` sources, not the docs
site; usage/props confirmed against `apps/web/content/docs/components/*.mdx` in the same tree.

## Problem

`/charts` today is six recharts panels (`MetroAreaChart`) + one bklit Ring (hurricane). The
operator asked for "more sweet graphs/charts with high-value data" (07/10/2026). Four bklit
components that would carry genuinely new visual information — Gauge, Heatmap, Profit/Loss
Line, Projection Line — are not vendored, and high-value series we already hold (per-ZIP
monthly ZHVI depth, live per-ZIP market hotness) have no panel. Separately, the assistant
chart path still stamps a fabricated future as-of ("2026-06-30" + "SWFL fixture sample") on
the asking-rent bar and corridor scatter (`lib/build-chart-for-intent.mts` — the vacancy case
was already fixed to read cre-swfl's detail table; rent + scatter were not), and
`CorridorMarketScatter` hardcodes the "SWFL fixture sample" footer.

## Goal

Four new live-data panels on `/charts` built on newly vendored bklit components, zero
fabricated vintages left on any live chart path, and an adopt verdict recorded for each
vendored component.

## What we're building

### A. Vendor four components + two utilities (same NOTICE.md conventions)

All from `bklit/bklit-ui@d7cd5827` (MIT), verbatim where possible, every fork documented in
NOTICE.md. Web-only this pass — none of these need the `staticSize`/`initialLoaded` SSR forks
(no email path); note that in NOTICE.

Verified dependency closures (from source imports at the pinned commit):

- **Gauge** — `gauge.tsx`, `gauge-label-layout.tsx`, `notch-gauge-shared.ts`,
  `pie-center-shell.tsx`, `pie-center.tsx`, `pie-context.tsx`. Everything else it touches
  (`chart-stat-flow`, `chart-center-typography`) is already vendored. The 07/08 blocker is
  GONE at this commit: the gauge chain imports NO `@base-ui/react` (and `@base-ui/react` +
  `@number-flow/react` are already in package.json anyway). One new package: **`d3-shape`**
  (pie-center-shell imports it directly; today it only resolves transitively).
- **Heatmap** — the whole `heatmap/` directory (19 files, self-contained + already-vendored
  shared infra; `shimmering-text` already vendored). One new package: **`@visx/heatmap`**.
- **Profit/Loss Line** — `profit-loss-line.tsx`, `profit-loss-segments.ts`,
  `profit-loss-legend.tsx`, `profit-loss-legend-hover.tsx`, plus the upstream `legend/`
  directory (`Legend/LegendItem/LegendLabel/LegendMarker` — small, not yet vendored). Rides
  inside the already-vendored `LineChart` (hidden `Line` registers the series; `Grid
  highlightRowValues={[0]}` draws the zero baseline — verbatim upstream usage).
- **Projection Line** — `projection-line.tsx`, `projection-utils.ts`, `projection-config.ts`,
  `projection-line-end-marker.tsx`. All deps already vendored.
- **Reference Area** ("if free" — it is) — `reference-area.tsx`, `reference-area-config.ts`,
  `reference-area-geometry.ts`, `reference-area-registration-context.tsx`. `pattern-preset`
  already vendored.

package.json additions in the same commit (with `bun install` + `bun.lock`, pre-push gate 1):
`@visx/heatmap`, `d3-shape` (+ `@types/d3-shape` if upstream doesn't ship types), and
**`@visx/curve` made explicit** — vendored `line.tsx`/`area.tsx` already import it but it only
resolves transitively today; this pass stops depending on hoisting luck.

CSS-var caveat (NOTICE, 07/08): this app defines no shadcn `--chart-N`/`--border`/`--muted`
vars — every new call site passes explicit colors or scopes vars locally, exactly like
`HurricaneRingChart`. Profit/Loss defaults (`var(--color-emerald-500)`/`--color-red-500`) are
never used: explicit `positiveColor`/`negativeColor` per the palette rules below.

Colors follow `app/_design/05-color-and-type.md`: bullish/positive = mangrove `#5bc97a`,
bearish/negative = `--sunset-coral` `#E08158` ("mangrove + coral, never stock-market
red/green"), sequential/diverging ramps built from the gulf tokens via
`extendPalette` (`lib/charts/palette.ts`) — no extension of the old ad-hoc palette
(`chart_color_refactor_p3` direction).

### B. Four new panels on `/charts`

Every panel: server loader in `page.tsx` following the existing `LoadedPanel` pattern
(try/catch → `{data, asOf, error}`), real loader-backed values only, as-of MM/DD/YYYY stated
once in the caption, named source, empty-tolerant — loader failure or thin data hides the
panel body behind the existing empty-state treatment, never sample data.

1. **Market-temperature gauge** (`MarketTemperatureGauge.tsx`). Source:
   `data_lake.market_details_swfl_latest` (verified live: 50 ZIPs with
   `local_hotness_score`, captured 07/04/2026). Value = median `local_hotness_score` across
   ZIPs (0–100 fill), `centerValue` = the same median, caption states ZIP count + as-of from
   `captured_date`. Citation: the same realtor.com-origin citation the market-temperature
   brain publishes (source-faithful, read at implementation from its citation row — never
   "SteadyAPI").
2. **ZIP×month heat grid** (`ZipMomentumHeatmap.tsx`). Source: `data_lake.zhvi_swfl`
   (verified live: 109 ZIPs × 317 months through 2026-05-31 — a genuinely varying month
   column, sidestepping `market_heat_by_zip`'s constant-month trap flagged in
   `market_trend_sweep_followup`). Cell = YoY % change of ZHVI for (ZIP, month), trailing 12
   months × the 20 ZIPs with the largest |YoY| in the latest month (the movers are the
   story), rows sorted by latest YoY. YoY pre-bucketed in code into the component's 5
   ordered levels with a diverging gulf ramp (coral → slate-neutral → teal); bucket
   thresholds fixed and printed in the legend, not quantiles (so two months are comparable).
   Query uses a scoped SQL view or paged select — 20×13 cells needs ~2,700 source rows,
   over the PostgREST 1000-row cap, so aggregate at source (per
   `feedback_aggregate-at-source`): add view `data_lake.zhvi_zip_yoy_monthly` (ZIP, month,
   yoy_pct, latest home_value) in an idempotent migration, and read the trailing window from
   it. Citation: Zillow Home Value Index (ZHVI), as-of = newest month-end.
3. **YoY momentum as Profit/Loss** (`MomentumProfitLossPanel.tsx`) — REPLACES the existing
   recharts `home-value-momentum` panel (same data, better encoding; two panels of the same
   series would be noise). Same `mapPivotedCityYoY` mapper on `zhvi_pivoted` the page already
   uses. P/L Line is single-series, so: three small-multiple `LineChart`s (Cape Coral, Fort
   Myers, Naples) in one panel frame, shared title/as-of/source, each with hidden `Line` +
   `ProfitLossLine` + zero baseline. Positive mangrove, negative sunset-coral — the
   above/below-zero split is the whole point.
   *Alternative considered:* one chart of a 3-metro average — rejected (a composite hides
   the per-metro story and invites "which city?" questions the small multiples answer).
4. **Tier divergence + projection** — the existing `tier-gap` panel (luxury vs. starter
   index) moves from recharts to the bklit `LineChart` so it can carry **Projection Line**:
   each tier's indexed track projected 6 months by a trailing-12-month linear trend
   (deterministic math in code), rendered as the dashed projection with **Reference Area**
   shading the projected window. Framing per rules of engagement: subtitle carries
   `[INFERENCE]`, the audited base values (each tier's latest index level + as-of), and one
   falsifier ("two consecutive months of slope reversal in either tier's Zillow series
   breaks this projection"). The `tier-momentum` (YoY) recharts panel stays as-is.
   *Alternative considered:* a separate second projection panel — rejected (duplicate
   series, more page weight, no new information).

Save-to-project buttons (`AddChartToProject`) are NOT added to the four new panels this
pass: `/api/charts/save-gallery` rebuilds a chart from a per-rootId registry frame, and
gauge/heatmap/P-L frames don't exist in that registry. Extending the saved-chart registry is
follow-up work that belongs with the chart-social-object build — noted as a deferral in the
`charts_glowup_live_verify` check detail at close (no silent deferrals).

### C. Kill the last fabricated vintages (`charts_vacancy_asof_fabricated`)

The vacancy case was already fixed (cre-swfl `corridor_vacancy` detail table, real
`fetched_at`). Finish the job, same precedent — live source or no chart, never a fixture with
an invented stamp:

- `buildRentChart` (`lib/build-chart-for-intent.mts`): read live `public.corridor_profiles`
  (`asking_rent_psf`, verified + not-deleted — the exact query
  `app/embed/cards/asking-rent/page.tsx` already uses) instead of
  `fixtures/corridor-rents.json`. `asOf` = max `metrics_verified_date` (fallback
  `updated_at`) of the rows plotted; citation = the same corridor-metrics citation
  `/r/cre-swfl` publishes. No fixture fallback — null until data, like vacancy.
- `buildScatterChart`: same live read joined with the permit/centroid fixtures it already
  tolerates as optional; drop `FIXTURE_ASOF`/`FIXTURE_SOURCE` entirely (grep-clean the
  constants).
- `CorridorMarketScatter.tsx:489`: the hardcoded "SWFL fixture sample" footer becomes a
  `sourceLabel` prop supplied by callers; `/embed/charts` and `/demo` (honest sample
  surfaces) pass "Sample data", live callers pass the real citation.
- Close `charts_vacancy_asof_fabricated` with evidence (the check's own wording targets
  surfaces that have since moved — close note records where the remaining stamps actually
  lived).

### D. Nice-to-have: global Charts nav link (`charts_global_nav_link`)

`PageShell` has no nav today. If a global header/nav component exists (to locate at
implementation), add the Charts link there and close the check; if there is none, the check
stays open with a note — building a global nav system is NOT in this scope.

## Not in scope

- Migrating the remaining recharts panels (`MetroAreaChart` family) to bklit.
- Saved-chart registry entries / OG cards for the new panel types (rides
  `chart_social_object_live_verify`).
- Email/SSR rendering of the new components (web-only; no `staticSize` forks).
- The desk showpiece page (`desk_showpiece_parked` — explicitly after this lands).
- Pie/Sankey/Radar/Scatter/Candlestick/Choropleth/Sunburst/Live Line/Brush (verdict for
  `bklit_charts_evaluation` close note: adopt = Gauge/Heatmap/P-L/Projection/Reference Area
  now; pass-for-now = the rest, no blocker found, just no panel that needs them yet).

## Verification

- `bunx next build` green (the verify standard — not `npx tsc`).
- Visual pass on `/charts` via `next build && next start` (stale-dev-server caveat): four
  panels render real data, empty states verified by pointing one loader at a bogus view
  locally, reduced-motion respected (bklit handles it), tooltips/legend hover work.
- `grep -rn "FIXTURE_ASOF\|SWFL fixture sample" lib components` → only honest sample
  surfaces remain (embed/demo labels).
- Panel as-of dates match `mcp__lake` spot checks (heatmap max month = zhvi_swfl max
  period_end; gauge as-of = market_details_swfl_latest captured_date).
- Close `charts_glowup_live_verify` with live-URL evidence after deploy;
  `charts_vacancy_asof_fabricated` with the grep + a live chart render;
  `bklit_charts_evaluation` with the adopt/pass verdict table.
