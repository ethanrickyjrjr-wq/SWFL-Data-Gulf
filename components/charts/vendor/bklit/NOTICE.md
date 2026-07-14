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
vendored and typecheck clean). Area (zhvi-area trend chart) and Composed (bar + mean reference
line, the email reshape picker's `composed` option) are both wired into production email
rendering; Ring is wired into the live `/charts` web page. Bar/Line are vendored and proven (Bar
via the SSR spike) but not yet wired into a production call site — that's the next increment,
not a silent gap.

**Gauge (2026-07-10)** — `gauge.tsx`, `gauge-label-layout.tsx`, `notch-gauge-shared.ts`,
`pie-center-shell.tsx`, `pie-center.tsx`, `pie-context.tsx` vendored verbatim, no forks
(web-only — no static/email SSR path, so neither `staticSize` nor `initialLoaded` applies).
The 07/08 deferral reason is gone at this commit: the gauge chain imports NO
`@base-ui/react`; its only new external dep is `d3-shape` (via `pie-center-shell`), now a
declared direct dependency. First call site: `components/charts/MarketTemperatureGauge.tsx`
(passes explicit `activeFill`/`inactiveFill` — the CSS-var caveat above applies).

**Heatmap (2026-07-10)** — the whole upstream `heatmap/` directory (19 files, minus
`__tests__/`) vendored VERBATIM, no forks. The upstream axes/tooltip are hardwired to a
weekday contribution calendar, so the first call site
(`components/charts/ZipMomentumHeatmap.tsx`, a ZIP×month grid) renders its own plain-HTML
labels and a custom tooltip CHILD built on the exported `useHeatmap` +
`useHeatmapInteraction` hooks + `TooltipBox` (a tooltip fork was tried and reverted — the
stock tooltip only sees `(count, date)` and can't name the hovered column). Sizing gotcha:
`HeatmapChart` positions its plot absolutely inside a `relative w-full` root — a call site
MUST size it (the `aspectRatio` prop = cols/rows with zero margins is the clean way);
an unsized flex parent collapses and the grid paints nothing visible. New dep:
`@visx/heatmap`.

**Profit/Loss Line (2026-07-10)** — `profit-loss-line.tsx`, `profit-loss-segments.ts`,
`profit-loss-legend.tsx`, `profit-loss-legend-hover.tsx` + the upstream `legend/` directory
(8 files) vendored verbatim, no forks. `legend/legend-progress.tsx` is where the
`@base-ui/react/progress` import actually lives (the dep the 07/08 gauge deferral
remembered) — `@base-ui/react` was already a declared dependency, so it resolves. Upstream
P/L defaults `var(--color-emerald-500)`/`var(--color-red-500)` are never used — call sites
pass explicit `positiveColor`/`negativeColor` (gulf mangrove / sunset-coral; the design
language forbids stock-market red/green). First call site:
`components/charts/MomentumProfitLossPanel.tsx`.

**Projection Line + Reference Area (2026-07-10)** — `projection-line.tsx` and
`projection-line-end-marker.tsx` vendored verbatim, no forks. Their support files
(`projection-utils.ts`, `projection-config.ts`, `reference-area.tsx`,
`reference-area-config.ts`, `reference-area-geometry.ts`,
`reference-area-registration-context.tsx`) were ALREADY vendored in the 07/08 pass (the
time-series shell imports them) — re-fetched at the same pin and confirmed byte-identical
after prettier, so nothing changed. Projections render a dashed forecast segment past the
anchor; per the rules of engagement every projection call site MUST carry `[INFERENCE]` +
base value + one falsifier in visible copy (first call site:
`components/charts/TierProjectionChart.tsx`). Not compatible with Brush (upstream docs) —
Brush is not vendored.

**Explicit `yDomain` + cadence-aware date labels (2026-07-14)** — two additive patches to shared
plumbing, both real bugs, both latent in EVERY bklit time-series chart:

1. **`yDomain?: [number, number]`** on `line-chart.tsx` → `time-series-chart-shell.tsx`. The shell gives
   any all-positive series a ZERO BASELINE (`resolveTimeSeriesYDomain`). That is right for an area chart
   — the fill's height IS the magnitude — and ruinous for a zoomed line: two years of Cape Coral medians
   live between $350k and $410k, so a real $1,201-a-month slide rendered as a FLAT LINE. An explicit
   domain now wins. **The obligation travels with it:** a caller that truncates the axis MUST render a
   `<YAxis />` and must not draw a filled area (an area whose base is not zero overstates every movement
   by the height of the crop). A cropped axis that doesn't say where it starts is the oldest chart lie
   there is.
2. **`pickDateFmt`** in `chart-formatters.ts`, replacing the hardcoded `shortDateFmt` in the shell's
   `dateLabels`. `shortDateFmt` is month+day with NO YEAR, so an eleven-year axis rendered
   `Jun 29 · Mar 30 · Dec 30` — five labels that read as five dates inside one year. The test is
   **CADENCE, not span**: a span threshold still leaves a 12-month window yearless (and it spans two
   calendar years), and lowering it far enough to catch that would hit short DAILY series, where
   month+year collapses every tick in a month to one string and the axis dedupes them away (`seenLabels`
   in `x-axis.tsx`) — losing ticks to fix years. Median point spacing ≥ 20 days ⇒ monthly ⇒ the day is
   noise and the year is essential.

Both worth upstreaming.

**Tooltip dot ignores `discreteInteraction` (2026-07-14)** — one-line additive patch to
`tooltip/chart-tooltip.tsx`. On a dense/discrete series (`dateLabels.length > 60` —
`discreteInteraction`), the crosshair line and the floating tooltip box already both go
INSTANT (`animate={!discreteInteraction}` / `boxMotion.animate`), but `<TooltipDot>` was never
passed the same flag — it always springs (`stiffness: 300, damping: 30`, ~250ms settle) toward
the hovered point regardless of dataset size. On a noisy monthly series (desk hero's 157-month
sold-price line) a normal hover distance jumps the target value by a lot, so the spring visibly
lags: caught live via DOM inspection mid-hover, X had settled to within 2px of the true point
while Y was still 44px short of it — the dot visibly floating off the line the crosshair and box
had already snapped to. Fix: `<TooltipDot animate={!discreteInteraction} .../>`, matching the
other two. Worth upstreaming.

**FitGlow — the backlit fit, added to the underlay slot (2026-07-14)** — new file
`fit-glow.tsx` (ours, not upstream), plus a ONE-LINE additive patch to `chart-child-passthrough.ts`
adding `"FitGlow"` to `UNDERLAY_COMPONENT_NAMES`. The shell routes children to render slots BY
DISPLAY NAME, and the underlay slot is the only one that paints above the grid but BELOW the
series. That placement is the whole point: the fitted trend is an `[INFERENCE]` about the
observed series, so it must render behind it — in the default bucket it would paint a claim on
top of the fact it was derived from, and on a straight line the claim wins the eye. Draws a
glow as a stroke stack (one path, three widths), never an SVG `<filter>` blur — a filter is one
silent rasterizer drop away from a chart that still looks finished. What it may draw is decided
entirely by `lib/charts/fit-overlay.ts`; this component branches on nothing. Not upstreamable as-is
(the underlay set is upstream's).

**Static clip-id collision fork (2026-07-10)** — upstream `line-chart.tsx` and
`composed-chart.tsx` hardcode `clipPathId="chart-grow-clip"` / `"composed-chart-grow-clip"`.
`url(#id)` resolves DOCUMENT-WIDE to the FIRST matching element, so with several LineCharts
on one page every later chart clips its series against the first chart's grow-clip rect —
the tier-projection panel rendered fully blank next to the three P/L minis (found via live
DOM: 4 clipPaths, one id; forced-red strokes still invisible). Fork (both files, additive):
suffix the id with React `useId()` so each instance owns its clip. Worth upstreaming.

**Composed ≠ categorical out of the box (2026-07-08)** — `ComposedChart` (and by extension
`LineChart`/`AreaChart`) is built on a shared time-series shell (`time-series-chart-shell.tsx`)
whose x-axis accessor unconditionally does `value instanceof Date ? value : new Date(value)`.
The email reshape picker's Composed option plots categorical points (ZIP codes, city names),
not dates — passing a label straight through as `date: p.label` doesn't throw or produce
`Invalid Date`; `new Date("33921")` silently parses as year 33921, so bars land at
scrambled/overlapping x-positions ordered by that bogus year instead of the given point order.
Caught via a spike render inspecting raw `<rect>` x/width coordinates, not by typecheck or
`next build`. Fix (`bklitComposedSvg` in `email-svg.tsx`): pass a synthetic strictly-increasing
day sequence (`new Date(2000, 0, i + 1)`) instead of the real label, and never render an
`<XAxis>` child, so the fake dates position points in the given order but are never shown —
only the real (label, value) pairs plot as bar height + line. Any future non-time-series wiring
of Line/Area onto categorical data needs the same treatment.
