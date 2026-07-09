# Vendored from bklit-ui

Source: https://github.com/bklit/bklit-ui
Commit: d7cd58276de167c10fdd6c6bf44351a6459c11b4
License: MIT (see `LICENSE` in this directory)

Files under this directory are adapted from `packages/ui/src/charts/**` in the upstream repo.

Adapted (not verbatim) — the four chart SHELLS (`bar-chart.tsx`, `line-chart.tsx`,
`area-chart.tsx`, `composed-chart.tsx`) each carry one small, deliberate fork: an optional
`staticSize={{width,height}}` prop that bypasses `@visx/responsive`'s `ParentSize` (which
needs a real ResizeObserver/DOM and renders 0×0 under a single-pass server render), and (bar
only) an `initialLoaded` prop that seeds the reveal-animation state as already-done instead of
`useState(false)` (motion's `initial={{height:0,...}}` is what a single-pass SSR render would
otherwise capture — invisible bars; Line/Area/Composed don't need this fork — their shared
`useChartPhaseOrchestrator` already seeds `isLoaded` from `chartStatus==="ready"` synchronously).
Both props are additive/optional; the client/web path (no `staticSize`) is byte-identical to
upstream. Proven live 2026-07-08: a forked `BarChart` rendered real, correctly-scaled bar
geometry (not blank/0×0) through a single-pass server render, rasterized via the same
`@resvg/resvg-js` pipeline `lib/email/chart-image.ts` already uses.

See `render-static.tsx` for the render bridge (`renderBklitStaticSvg`) and `email-svg.tsx` for
the first real wiring (`bklitTrendSvg`, replacing `trendChartSvg` as the zhvi-area email
renderer) — this is what lets ONE component render both the live web frame (client, animated)
and the static email PNG (server), instead of hand-writing a second bespoke SVG builder per
shape. The bridge renders through `@react-email/render` (already a dependency —
`lib/email/render-email-doc.ts` uses it for the whole `EmailDoc`), not a direct
`react-dom/server` import — Next's App Router flags any direct `react-dom/server` import in a
traced `.tsx` file as an illegal nested render, even when, as here, it only ever runs inside a
Node API route.

Everything else in this directory (shared context/animation/axis/tooltip/legend infra) is
verbatim, no edits.

**Ring Chart (2026-07-08)** — `ring-chart.tsx`, `ring.tsx`, `ring-center.tsx`,
`ring-context.tsx`, `chart-center-typography.ts`, `chart-stat-flow.tsx` vendored verbatim, no
forks (this is web-only — no static/email SSR path needed yet, so neither of the `staticSize`/
`initialLoaded` forks applies). Pulls in one new upstream dependency, `@number-flow/react`
(animated number transitions for `RingCenter`'s value flip on hover) — added to `package.json`.
First call site: `components/charts/HurricaneRingChart.tsx` (SWFL hurricane category rings,
`/charts` page) supplies its own `color` per ring (bypassing the CSS-var `--chart-1..5`
palette, which this app's Tailwind theme doesn't define) and scopes `--border` locally for the
ring background track — this app has no global shadcn chart-theme CSS vars, so any future
bklit chart relying on `--chart-N`/`--border`/`--muted` needs the same local-scope treatment
until/unless those vars get defined in `app/globals.css`.

Not vendored (this pass): `packages/studio` (proprietary, see upstream `LICENSE-STUDIO.md`),
every `registry/examples/*` demo file, and — scope cut, not a rejection — Gauge, Pie, Sankey,
Live Line, Candlestick, Choropleth, Funnel, Heatmap, Radar, Scatter, and Sunburst. Gauge
was dropped from this pass specifically because its dependency chain reaches into Pie's
center-label infra plus a new `@base-ui/react` progress dependency — bundling that in without
verifying it visually felt like exactly the kind of half-shipped expansion this build was
supposed to stop doing. Wired so far: Bar, Line, Area, Composed, Ring (shells + shared infra all
vendored and typecheck clean); only Area (as the zhvi-area trend chart) is wired into
production email rendering, and Ring is wired into the live `/charts` web page. Bar/Line/Composed
are vendored and proven (Bar via the SSR spike) but not yet wired into a production call site —
that's the next increment, not a silent gap.
