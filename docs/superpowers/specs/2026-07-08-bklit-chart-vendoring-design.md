# Vendor 3 bklit-ui charts (live-line, pie, sankey) as new registry frames

Status: approved (design) — pending implementation plan
Source: https://github.com/bklit/bklit-ui (MIT, `packages/ui`), commit as of 2026-07-08

## Why

bklit-ui is a shadcn-registry chart library (visx + motion), not a layout/shell
system as originally assumed — confirmed by reading its README and
`packages/ui/registry.json` directly (RULE 0.5/0.4). Its charts theme entirely
through CSS custom properties (`--chart-1`..`--chart-5`, `--chart-line-primary`,
`--chart-background`, etc.) — the same pattern our own
`components/charts/registry/FrameRenderer.tsx` already uses for
`--chart-primary`/`--chart-accent`, just richer. That match is the "shell Claude
fills with brand colors" mechanism: extend our existing 2-var injection to
bklit's fuller semantic set, generated from our existing 2-color brand theme.

Rather than re-implementing bklit's spring-tuned crosshair/tooltip/reveal
animation from scratch (real risk of shipping a visibly worse result for no
reason — the code is MIT, that's what the license is for), we vendor the
specific source for 3 chart types and gut the rest.

## Scope: which 3, and why not the other 11

Checked our existing `CHART_REGISTRY` (`components/charts/registry/frames/`)
before picking anything (RULE 0.5) — most of bklit's catalog duplicates a frame
we already have:

| bklit chart | Verdict | Reason |
|---|---|---|
| **live-line-chart** | **IN** | No equivalent — nothing real-time in our registry |
| **pie-chart** (animated, center-shell) | **IN** | Ours (`DonutShareFrame`) is static; bklit's slice-reveal + center typography is genuinely different, better craft |
| **sankey-chart** | **IN** | Genuine gap — no flow-diagram frame exists, and flow data (visitor→lead→close, land-use breakdowns) fits this product |
| gauge | out | `ZGaugeFrame` already exists |
| radar | out | `SeasonalRadialFrame` already covers this shape |
| scatter | out | `CorridorMarketScatterFrame` already exists |
| area | out | `ZHVIAreaChartFrame` already exists |
| bar | out | `ChartBlockFrame` already exists |
| composed | out | `CompositionFrame` / `LineBandFrame` already cover this |
| ring | out | `DonutShareFrame` already covers this |
| candlestick | out | No OHLC-shaped data anywhere in this product |
| choropleth | out | Wrong tool — a real SWFL ZIP/county choropleth needs actual boundary data; that's a Mapbox job (data-driven `fill-color` on real geometry), not a generic topojson component |
| funnel | out | echarts (already a dependency) has a native funnel series; not worth a second implementation |
| Studio (chart playground app) | out | Proprietary license (`LICENSE-STUDIO.md`) — not MIT, cannot vendor |

## Architecture

**Vendor directory:** `components/charts/vendor/bklit/` — adapted source only,
no build tooling, no mock-data generators, no Studio. Traced the exact file set
via `packages/ui/registry.json`'s dependency graph (not guessed):

- Shared (`chart-context`, `chart-animation`, `chart-tooltip`, `chart-utils`
  registry items): `chart-context.tsx`, `reference-area-config.ts`,
  `use-chart-interaction.ts`, `y-axis-scales.ts`, `y-axis-ticks.ts`,
  `chart-phase.ts`, `y-domain-utils.ts`, `filter-data-by-x-domain.ts`,
  `generate-chart-skeleton-data.ts`, `use-animated-y-domains.ts`,
  `use-chart-phase-orchestrator.ts`, `line-loading-timing.ts`, `animation.ts`,
  `motion-utils.ts`, `use-mount-progress.ts`, `use-enter-complete.ts`,
  `chart-reveal-clip.tsx`, `static-chart-preview-context.tsx`, `chart-defs.ts`,
  `chart-config-context.tsx`, `indicator-fade.ts`, `tooltip/*.tsx` (5 files) +
  `tooltip/index.ts`, `chart-formatters.ts`, `decimate-time-series.ts`,
  `use-scheduled-tooltip.ts`.
- `live-line-chart.tsx`, `chart-child-passthrough.ts`, `live-line.tsx`,
  `live-x-axis.tsx`, `live-y-axis.tsx`.
- `pie-chart.tsx`, `pie-context.tsx`, `pie-slice.tsx`, `chart-stat-flow.tsx`,
  `pie-center-shell.tsx`, `pie-center.tsx`, `chart-center-typography.ts`.
- `sankey/sankey-chart.tsx`, `sankey/sankey-context.tsx`,
  `sankey/sankey-node.tsx`, `sankey/sankey-link.tsx`,
  `sankey/sankey-tooltip.tsx`, `sankey/index.ts`.

**Adaptation, not a straight copy:**
- Every file's mock/demo data generator (`generateData()` and friends) is
  deleted; data comes from `ChartSpec.options.data` instead (see Data flow).
- bklit's shared utils package (`@bklit/utils`) wants `clsx` + `tailwind-merge`.
  Our `lib/utils.ts` deliberately has neither (documented rationale: components
  are authored for additive classes only). Vendored files import our existing
  `@/lib/utils` `cn()` instead of bringing in `@bklit/utils` — no new deps, no
  contradiction of an already-made call.
- `components/charts/vendor/bklit/LICENSE` — verbatim copy of bklit-ui's MIT
  license. `components/charts/vendor/bklit/NOTICE.md` — one paragraph: source
  repo URL, commit SHA vendored from, which files were adapted vs. copied
  verbatim. Satisfies MIT attribution without carrying the whole upstream repo.

**New frame wrappers** in `components/charts/registry/frames/`:
`LiveLineFrame.tsx`, `AnimatedPieFrame.tsx`, `SankeyFrame.tsx` — each
`({ spec }: { spec: ChartSpec }) => JSX`, the only place that reads
`spec.options.data` and reshapes it into the vendored component's props
(mirrors how `ZHVIAreaChartFrame` already threads `options.data` today).

**New `CHART_REGISTRY` entries** (additive, nothing existing changes):
`"live-line"` (`accepts: ["time-series"]`), `"pie-animated"`
(`accepts: ["composition"]`), `"sankey"` (`accepts: ["composition"]` — flow
data is a composition variant; `DataShape` is descriptive metadata only per
the existing comment in `chart-spec.ts`, so no type change needed).

**New dependencies** (all verified React-19-compatible via live npm registry
check, not assumed):
`@visx/curve@4.0.1-alpha.0`, `@visx/scale@4.0.1-alpha.0`,
`@visx/shape@4.0.1-alpha.0`, `@visx/responsive@4.0.1-alpha.0`,
`@visx/event@4.0.1-alpha.0`, `@visx/group@4.0.1-alpha.0`,
`@visx/gradient@4.0.1-alpha.0`, `@visx/pattern@4.0.1-alpha.0`,
`@visx/sankey@4.0.1-alpha.0`, `d3-array`, `d3-shape`, `d3-sankey`,
`@number-flow/react`. `motion` is already a dependency (v12.42.0) — reused as-is.

## Theming bridge — the actual "shell + brand color" mechanism

`ChartTheme` (`chart-spec.ts`) keeps its existing shape (`primary`, `accent`,
`logoUrl` — no breaking change). A new helper,
`components/charts/registry/bklit-theme.ts` (`toBklitChartVars(theme, mode)`),
generates the fuller var set bklit's charts actually read, confirmed from
bklit's own `chart-context` registry entry (`cssVars.light`/`cssVars.dark`):

- `--chart-1` = `theme.primary`, `--chart-5` = `theme.accent`, `--chart-2/3/4`
  = 3-step OKLCH interpolation between them (perceptually smooth — same color
  space bklit's own defaults use; avoids the muddy midpoints a plain RGB lerp
  produces). This is what feeds pie's 5-slice categorical palette.
- `--chart-line-primary: var(--chart-1)`, `--chart-line-secondary: var(--chart-2)`
  (live-line's two series colors).
- `--chart-crosshair` = `theme.accent`.
- `--chart-background`, `--chart-foreground`, `--chart-foreground-muted`,
  `--chart-grid`, `--chart-label`, tooltip/marker vars: fall back to bklit's
  own light-mode defaults when the theme doesn't specify — these are design
  defaults, not data, so falling back never violates the no-invented-numbers
  rule.

`FrameRenderer.tsx` gets one small addition: frames whose `FrameDef` sets
`usesBklitTheme: true` get `toBklitChartVars(spec.theme)` merged into the style
object alongside (not replacing) today's `--chart-primary`/`--chart-accent`
injection. Existing frames are byte-for-byte unaffected.

## Data flow

- `LiveLineFrame` expects `options.data: { date: string | number; [seriesKey]: number }[]`.
- `AnimatedPieFrame` expects `options.data: { label: string; value: number; color?: string }[]`.
- `SankeyFrame` expects `options.data: { nodes: {id: string; label: string}[]; links: {source: string; target: string; value: number}[] }`.
- Each frame wrapper is the only code that reads/reshapes its `options.data` —
  matches the existing convention documented in `chart-spec.ts`.

## Testing / verification

- One test per new frame (mirrors `ZGaugeFrame.test.ts`): renders with a
  representative `ChartSpec` fixture, asserts no throw and that the resolved
  CSS custom properties match a given theme.
- Manual check: render all 3 side-by-side on a fixture/Storybook page (repo
  already has `.storybook/` set up) with 2–3 different brand palettes to
  confirm the OKLCH ramp actually re-colors correctly and stays legible at
  both ends of the primary/accent contrast range.
- `bunx next build` clean (per project convention — not `npx tsc`).

## Non-goals (explicit, so nobody re-litigates later)

- Not pulling in Studio (proprietary, can't).
- Not vendoring the other 11 chart types now — same vendor+wrapper pattern
  extends later, one at a time, if a real need shows up.
- Not touching any existing frame or `CHART_REGISTRY` entry.
- Not adding shadcn CLI / `components.json` to the project — this vendors
  source directly rather than pulling through the registry installer, since
  the installer doesn't know our `ChartSpec`/`FrameDef` contract anyway and
  we're being selective, not bulk-importing.
