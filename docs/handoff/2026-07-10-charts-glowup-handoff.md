# Handoff — /charts glow-up: four new bklit components, four new panels

**Date:** 2026-07-10 · **Owner:** a website-builder session · **Check:** rides
`bklit_charts_evaluation` (adopt/pass verdict per component belongs in that check's close note)
**Origin:** operator asked for "more sweet graphs/charts with high-value data" (07/10/2026);
this session focused on the saved-chart social object (see
`docs/superpowers/specs/2026-07-10-chart-social-object-design.md`) and hands the /charts work
here.

## Verified upstream facts (crawl4ai, bklit.com/docs/components, 07/10/2026)

The registry ships 17 components + utilities. Relevant and NOT yet vendored:
Gauge, Heatmap, **Profit/Loss Line** (line that splits color above/below a baseline — not
listed in our vendor NOTICE; it exists upstream), Live Line, Pie, Sankey, Radar, Scatter,
Candlestick, Choropleth, Sunburst, and utilities **Projection Line**, **Reference Area**,
**Brush**. Already vendored (see `components/charts/vendor/bklit/NOTICE.md`): Bar, Line, Area,
Composed, Ring + shared infra, with documented SSR forks.

## The build (scope: web /charts page only — no email work)

1. **Vendor** Gauge, Heatmap, Profit/Loss Line, Projection Line (+ Reference Area if free).
   Follow NOTICE.md conventions exactly: verbatim where possible, document every fork, check
   the `--chart-N`/`--border`/`--muted` CSS-var caveat (this app doesn't define shadcn chart
   vars — scope locally like `HurricaneRingChart` does). Gauge previously deferred because its
   deps reach into Pie center-label infra + `@base-ui/react` progress — vendor what it needs,
   verify visually, don't half-ship (that's why it was cut on 07/08).
2. **Panels** (all from views the page already reads or siblings in `data_lake`):
   - Market-temperature gauge (market-temperature view family).
   - ZIP×month heat grid (heatmap) — needs a per-ZIP monthly series with a varying month
     column; note `market_heat_by_zip` currently carries a constant month (see
     `market_trend_sweep_followup` check) — pick a series that actually varies.
   - YoY home-value momentum as Profit/Loss Line (same `zhvi_pivoted` YoY mapper the page
     already uses — positive/negative coloring is the whole point).
   - Projection Line on the tier-divergence panel — projection framing must carry
     `[INFERENCE]` + base value + one falsifier per the rules of engagement.
3. **Fix in the same pass:** `charts_vacancy_asof_fabricated` (live /charts vacancy+rent bars
   stamp a hardcoded future as-of over a frozen snapshot — fabricated vintage on a live
   surface). Do not add new panels next to a known-fabricated stamp without fixing it.
4. **Nice-to-have if trivial:** `charts_global_nav_link` (global Charts nav link).

## Constraints

- RULE 3.5 applies to the executing session (brainstorm → spec → `new-build.mjs`) — this
  handoff is the brief, not the spec.
- Every panel: real loader-backed values only, as-of MM/DD/YYYY stated once, named source,
  empty-tolerant (hide the panel on loader failure — never sample data).
- Chart colors: gulf palette direction per `chart_color_refactor_p3` check — don't extend the
  old ad-hoc palette to new panels.
