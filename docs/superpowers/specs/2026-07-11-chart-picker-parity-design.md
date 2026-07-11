# Email Lab chart-type picker parity (12/12 registry frames)

**Date:** 2026-07-11
**Audit:** `docs/audit/2026-07-11-chart-builder-wiring/findings.md`
**Check:** `chart_picker_parity_live_verify`

## Problem

`CHART_REGISTRY` (`components/charts/registry/registry.ts`) holds 12 chart frames, none
`fixtureOnly` — all 12 can legitimately bind to live brain data. The Email Lab builder's
chart-type dropdown (`CHART_TYPE_OPTIONS` in `lib/email/reshape-chart-type.ts`) only offers 5:
`bar`, `ranked`, `donut`, `dotplot`, `composed`. Two more (`spark-grid`, `line-band`) already have
working PNG renderers in `lib/email/spec-to-png.ts` but were never added as picker options — a
pure oversight. The remaining 5 (`corridor-scatter`, `composition`, `z-gauge`, `seasonal-radial`,
`storm-timeline`) have no PNG-render path at all — if one of their `frameId`s ever reached
`spec-to-png.ts` today it would silently fall back to a plain bar chart, never breaking loudly,
never showing the real chart.

## Goal

Every frame in `CHART_REGISTRY` that can bind to live data is selectable in the Email Lab picker
and renders correctly in a sent email. 12/12, not 5/12.

## What we're building

### Phase A — expose what already works (quick win)

Add `spark-grid` and `line-band` to `CHART_TYPE_OPTIONS` (`reshape-chart-type.ts:17-23`) and a
matching `case` in `reshapeChartToType`'s switch (`reshape-chart-type.ts:123-190`), following the
existing pattern (`extractPoints` → shape-specific `options`). Both already have working cases in
`spec-to-png.ts:126-133` — this phase touches only the picker/reshape layer, not the renderer.

### Phase B — build the 5 missing PNG renderers

Confirmed by reading each frame component — the 5 gaps split into three different technical
situations, not one uniform "add a case" task:

**B1. Tailwind/CSS-rendered — need a brand-new pure-SVG builder (no shortcut).**
`composition` (`CompositionFrame.tsx`) and `z-gauge` (`ZGaugeFrame.tsx`) render with Tailwind
classes and inline `%`-width divs — this cannot be rasterized for email (no Tailwind pipeline, no
real DOM at render time). Each needs a new `lib/charts/svg/{composition,z-gauge}.ts` pure-SVG
builder function, following the existing pattern the 2026-06-26 batch established
(`lib/charts/svg/dot-plot.ts` is the reference: a pure function taking the same data shape
`extractCompositionData`/`extractZGaugeData` already extract, returning an SVG string). Once
built, refactor `CompositionFrame`/`ZGaugeFrame` to consume it (mirroring `DotPlotFrame.tsx:44-66`
— render the SAME SVG string web-side via `dangerouslySetInnerHTML`, so there is exactly one
renderer, not two). Then wire the case into `spec-to-png.ts`.

**B2. Recharts-rendered — reuse the existing server-render bridge.**
`storm-timeline` (`TimelineFrame.tsx`) and `seasonal-radial` (`SeasonalRadialFrame.tsx` →
`SeasonalRadialChart.tsx`) are real `recharts` components (`RadialBarChart`, `BarChart` +
`ResponsiveContainer`). `spec-to-png.ts` already has a working precedent for this exact situation
— `zhvi-area` and `composed-bar-line` render through a server-side React→SVG bridge
(`bklitTrendSvg`/`bklitComposedSvg`, `render-static.tsx`, `@react-email/render`) rather than a
hand-authored SVG string. Reuse that bridge for these two components instead of rewriting them as
pure SVG — they already pass `initialDimension` for SSR, so no component change needed.
`storm-timeline` is also gated on `env-swfl` emitting a per-storm `detail_table` (currently only
emits a combined total per `TimelineFrame.tsx:30-33`) — the PNG renderer can be built and tested
against fixture data now, but it won't bind to live data until that emit ships (tracked
separately, not blocking this build).

**B3. ECharts-rendered — needs vendor verification before implementation.**
`corridor-scatter` (`CorridorMarketScatterFrame.tsx` → `CorridorMarketScatter.tsx`) uses ECharts,
an interactive canvas/SVG library with its own server-side rendering mode. Per RULE 0.4, the exact
API for headless/SSR SVG-string rendering (ECharts documents an `ssr: true` + `renderToSVGString()`
mode) must be verified in-session against the current ECharts docs before writing code — not
assumed from training memory. This is the highest-effort item of the 5 and should be sequenced
last within Phase B.

### Phase B fit-gates — every new type needs a `chartTypeFits` guard (do not skip)

A renderer is not enough. `chartTypeFits` (`build-doc.ts:262-267`) already refuses `donut` unless
the data is share-style ("counts that add to a whole"), and falls back to a bar with a plain-English
reason. Each of the 5 new types binds meaningful data ONLY under a shape condition — expose them
without a fit-gate and you manufacture a new incoherence class:

- `z-gauge` needs a single value against a max/target — reshaping a multi-point series into a gauge
  picks an arbitrary needle. Gate: single salient value + a bound.
- `composition` needs parts-of-a-whole (like donut). Gate: same share-style test.
- `seasonal-radial` needs a cyclical/monthly series. Gate: 12-ish periodic points.
- `storm-timeline` needs discrete dated events. Gate: a per-event detail table (the env-swfl emit).
- `corridor-scatter` needs paired x/y per entity. Gate: two numeric columns.

Each Phase-B frame ships its `chartTypeFits` case + the "showed a bar instead, here's why" fallback
message alongside its renderer and picker option — three pieces per frame, not one.

### Coherence guard (cross-ref: `deliverable-coherence-gate`)

Exposing 7 more selectable charts adds 7 more ways a user's pick can contradict the headline. Every
picker-selected chart already routes through `buildPromptChart`, where the coherence guard
(`assertHeroChartCoherence`, shipped under `deliverable_coherence_gate_live_verify`) drops a chart
whose magnitude clashes with the hero. No new wiring here — just do not add a bypass; the new types
inherit the guard for free by going through the same seam.

### Rollout order

Phase A ships alone first (near-zero risk, unblocks 2 real chart types immediately). Phase B ships
frame-by-frame in order B1 → B2 → B3 (increasing effort/risk), each frame independently
picker-enabled + tested before the next starts — never a big-bang PR touching all 5.

### Drive-by fix (same area, trivial)

`components/charts/registry/chart-spec.ts:35` — the `DataShape` doc comment says "seasonal-radial
is fixture-only," describing a flag that registry.ts's own comments say was flipped off when
`cre-swfl` started emitting `corridor_seasonality` live. Registry.ts is the single source of truth
per its own docstring; the comment in chart-spec.ts is now stale and should be corrected in the
same PR that touches this area, so the next reader doesn't get misled by it.

## Testing

- Phase A: extend `reshape-chart-type.test.ts` with `spark-grid`/`line-band` cases (mirrors
  existing `composed`/`donut` tests).
- Phase B, each frame: a `spec-to-png.test.ts` case asserting a non-null SVG containing the
  expected drawable elements (mirrors the existing `composed-bar-line renders a real bklit
  ComposedChart SVG` test) + a `reshape-chart-type.test.ts` case for the new picker option.
- No live-data test needed for `storm-timeline` until the env-swfl emit ships (fixture-only until
  then, matching the existing `fixtureOnly`-gate pattern).

## Non-goals

- Not migrating `EmailChartSpec` (outreach/listing-flyer) — tracked separately as
  `retire_emailchartspec_outreach`.
- Not touching the social composer — that's `docs/superpowers/specs/2026-07-11-social-chart-registry-design.md`.
- Not changing `CHART_REGISTRY`'s `fixtureOnly` gate semantics — only `storm-timeline`'s live-emit
  timing is a soft dependency, not a flag change.
