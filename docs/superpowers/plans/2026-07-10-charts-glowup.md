# Charts Glow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 13 tasks, 20 files, 2 conflict groups, keywords: migration, schema, architecture

**Goal:** Vendor bklit Gauge/Heatmap/Profit-Loss-Line/Projection-Line/Reference-Area at the pinned commit, add four live-data panels to `/charts`, and remove the last fabricated chart vintages.

**Architecture:** Verbatim vendoring into `components/charts/vendor/bklit/` (one documented additive fork: heatmap tooltip header), pure tested mappers in `lib/charts/`, thin client wrapper components in `components/charts/`, server loaders in `app/charts/page.tsx` following the existing `LoadedPanel` pattern. One new idempotent SQL view for the heatmap (aggregate at source — the raw window exceeds the PostgREST row cap).

**Tech Stack:** Next.js App Router, React 19, Tailwind v4, bklit-ui (visx + motion), Supabase (`data_lake` schema, service-role untyped client), bun test.

**Spec:** `docs/superpowers/specs/2026-07-10-charts-glowup-design.md`

## Global Constraints

- Upstream pin: `bklit/bklit-ui` commit `d7cd58276de167c10fdd6c6bf44351a6459c11b4` (MIT) — the SAME commit `components/charts/vendor/bklit/NOTICE.md` already records. Vendor verbatim; document every fork in NOTICE.md.
- No shadcn chart CSS vars exist in this app — every call site passes explicit colors or scopes vars locally (see `HurricaneRingChart`'s `RING_TRACK_VARS`).
- Colors: positive = mangrove `#5bc97a`, negative = sunset-coral `#E08158`, primary = gulf-teal `#3DC9C0`, neutral track = `rgba(240,237,230,0.10)`, grid = `#22414f`. Never stock-market red/green (`app/_design/05-color-and-type.md`).
- Every panel: real loader-backed values only, empty-tolerant (hide panel on failure/thin data — never sample data), as-of stated once as MM/DD/YYYY, named source in the caption.
- Verify with `bunx next build` — never `npx tsc` (repo rule).
- Tests run with `bun test <path>`.
- Commit after every task; stage explicit paths only (never `git add -A`). Do NOT push — pushing needs operator approval at the end.
- Before writing the first panel component (Task 8), invoke the `dataviz` skill if available in the session.
- `[INFERENCE]` framing (Task 11 only): tag + audited base value + one falsifier, per the rules of engagement.

---

### Task 1: Make chart dependencies explicit

**Files:**
- Modify: `package.json`, `bun.lock`

**Interfaces:**
- Produces: `@visx/heatmap`, `@visx/curve`, `d3-shape` resolvable as direct dependencies (Tasks 2–5 import them).

- [ ] **Step 1: Add the packages**

```bash
bun add @visx/curve@^4.0.0 @visx/heatmap@^4.0.0 d3-shape
bun add -d @types/d3-shape
```

`@visx/curve` is already imported by vendored `line.tsx`/`area.tsx`/`pattern-area.tsx`/`series-path-utils.ts` but only resolves transitively today; this makes it explicit. If `bun add d3-shape` reports that `d3-shape` ships its own types, skip `@types/d3-shape`.

- [ ] **Step 2: Verify resolution**

```bash
bun -e "import('d3-shape').then(m => console.log('d3-shape ok', typeof m.arc)); import('@visx/heatmap').then(m => console.log('heatmap ok', Object.keys(m).length))"
```

Expected: both `ok` lines print.

- [ ] **Step 3: Commit (lockfile in the same commit — pre-push gate 1)**

```bash
git add package.json bun.lock
git commit -m "chore(charts): declare @visx/curve, @visx/heatmap, d3-shape as direct deps"
```

---

### Task 2: Vendor Gauge (+ Pie center closure)

**Files:**
- Create: `components/charts/vendor/bklit/gauge.tsx`, `gauge-label-layout.tsx`, `notch-gauge-shared.ts`, `pie-center-shell.tsx`, `pie-center.tsx`, `pie-context.tsx`
- 🔴 Modify: `components/charts/vendor/bklit/NOTICE.md`

**Interfaces:**
- Produces: `Gauge` component from `./vendor/bklit/gauge` — props used later: `value` (0–100 fill), `centerValue`, `defaultLabel`, `formatOptions` (Intl.NumberFormatOptions), `activeFill`, `inactiveFill`, `inactiveFillOpacity`, `spacing`, `minWidth`. Verified closure: these six files + already-vendored `chart-stat-flow`, `chart-center-typography`; NO `@base-ui/react` import anywhere in the chain at this commit.

- [ ] **Step 1: Fetch the six files verbatim at the pinned commit**

```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
for f in gauge.tsx gauge-label-layout.tsx notch-gauge-shared.ts pie-center-shell.tsx pie-center.tsx pie-context.tsx; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/$f?ref=$SHA" --jq .content | base64 -d > "components/charts/vendor/bklit/$f"
done
```

- [ ] **Step 2: Verify the import closure is complete**

```bash
grep -hoE 'from "\./[a-z-]+' components/charts/vendor/bklit/gauge.tsx components/charts/vendor/bklit/gauge-label-layout.tsx components/charts/vendor/bklit/pie-center-shell.tsx components/charts/vendor/bklit/pie-center.tsx | sort -u
```

Every `./x` named must exist in `components/charts/vendor/bklit/`. If one is missing, fetch it the same way and note it in NOTICE.md.

- [ ] **Step 3: Confirm no `@base-ui` import snuck in**

```bash
grep -rn "@base-ui" components/charts/vendor/bklit/gauge.tsx components/charts/vendor/bklit/pie-center*.tsx components/charts/vendor/bklit/pie-context.tsx
```

Expected: no matches. (The 07/08 pass deferred Gauge over this dep; at d7cd5827 it is gone.)

- [ ] **Step 4: Build**

```bash
bunx next build
```

Expected: compiles green (files aren't imported yet; this catches type/syntax drift).

- [ ] **Step 5: Update NOTICE.md**

Append to `components/charts/vendor/bklit/NOTICE.md`:

```markdown
**Gauge (2026-07-10)** — `gauge.tsx`, `gauge-label-layout.tsx`, `notch-gauge-shared.ts`,
`pie-center-shell.tsx`, `pie-center.tsx`, `pie-context.tsx` vendored verbatim, no forks
(web-only — no static/email SSR path, so neither `staticSize` nor `initialLoaded` applies).
The 07/08 deferral reason is gone at this commit: the gauge chain imports NO
`@base-ui/react`; its only new external dep is `d3-shape` (via `pie-center-shell`), now a
declared direct dependency. First call site: `components/charts/MarketTemperatureGauge.tsx`
(passes explicit `activeFill`/`inactiveFill` — the CSS-var caveat above applies).
```

- [ ] **Step 6: Commit**

```bash
git add components/charts/vendor/bklit/gauge.tsx components/charts/vendor/bklit/gauge-label-layout.tsx components/charts/vendor/bklit/notch-gauge-shared.ts components/charts/vendor/bklit/pie-center-shell.tsx components/charts/vendor/bklit/pie-center.tsx components/charts/vendor/bklit/pie-context.tsx components/charts/vendor/bklit/NOTICE.md
git commit -m "feat(charts): vendor bklit Gauge + pie-center closure at pinned d7cd5827"
```

---

### Task 3: Vendor Heatmap directory (one documented tooltip fork)

**Files:**
- Create: `components/charts/vendor/bklit/heatmap/` — 19 files: `generate-heatmap-skeleton-data.ts`, `heatmap-animation.ts`, `heatmap-cells.tsx`, `heatmap-chart-loading.tsx`, `heatmap-chart.tsx`, `heatmap-colors.ts`, `heatmap-context.tsx`, `heatmap-legend-gradient.tsx`, `heatmap-legend-swatch.tsx`, `heatmap-legend.tsx`, `heatmap-pattern-defs.tsx`, `heatmap-resolve-separator.ts`, `heatmap-separator.tsx`, `heatmap-tooltip.tsx`, `heatmap-utils.ts`, `heatmap-x-axis.tsx`, `heatmap-y-axis.tsx`, `index.ts`, `use-delayed-tooltip-data.ts` (skip `__tests__/`)
- 🔴 Modify: `components/charts/vendor/bklit/NOTICE.md`

**Interfaces:**
- Produces (used by Task 9): `HeatmapChart` (props: `data: HeatmapColumn[]`, `layout`, `colorScale?: (count) => string`, `levelStyles?`), `HeatmapCells`, `HeatmapTooltip` (fork adds `formatTitle?: (date: Date) => string`, `formatSubtitle?: (date: Date) => string | null`), `HeatmapInteractionProvider`, `HeatmapInteractionBoundary`, types `HeatmapBin { count: number; bin: number; date: Date }`, `HeatmapColumn { bin: number; bins: HeatmapBin[] }`.

- [ ] **Step 1: Fetch the directory verbatim**

```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
mkdir -p components/charts/vendor/bklit/heatmap
for f in generate-heatmap-skeleton-data.ts heatmap-animation.ts heatmap-cells.tsx heatmap-chart-loading.tsx heatmap-chart.tsx heatmap-colors.ts heatmap-context.tsx heatmap-legend-gradient.tsx heatmap-legend-swatch.tsx heatmap-legend.tsx heatmap-pattern-defs.tsx heatmap-resolve-separator.ts heatmap-separator.tsx heatmap-tooltip.tsx heatmap-utils.ts heatmap-x-axis.tsx heatmap-y-axis.tsx index.ts use-delayed-tooltip-data.ts; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/heatmap/$f?ref=$SHA" --jq .content | base64 -d > "components/charts/vendor/bklit/heatmap/$f"
done
grep -rhoE 'from "\.\./[a-z-]+' components/charts/vendor/bklit/heatmap/ | sort -u
```

Every `../x` must exist in `components/charts/vendor/bklit/` (they all do: `chart-context`, `chart-loading-label`, `chart-phase`, `chart-scale`, `pattern-preset`, `shimmering-text`…). Fetch any missing one and note it.

- [ ] **Step 2: Fork the tooltip header (additive, defaults = upstream behavior)**

In `heatmap-tooltip.tsx`, extend the props and the two header lines:

```tsx
export interface HeatmapTooltipProps {
  /** Custom contribution line (bottom section). Default: `N contribution(s)`. */
  formatLabel?: (count: number, date: Date) => string;
  /** FORK(swfl): custom header title. Default: upstream date formatting. */
  formatTitle?: (date: Date) => string;
  /** FORK(swfl): custom header subtitle; return null to hide the line. Default: upstream weekday. */
  formatSubtitle?: (date: Date) => string | null;
  // ...existing props unchanged
}
```

In the component body, destructure with defaults and replace the two hardwired lines:

```tsx
formatTitle = formatHeatmapTooltipDate,
formatSubtitle = formatHeatmapTooltipWeekday,
```

```tsx
<div className="font-medium text-chart-tooltip-foreground text-xs">
  {formatTitle(date)}
</div>
{formatSubtitle(date) != null && (
  <div className="mt-0.5 text-chart-tooltip-muted text-xs">
    {formatSubtitle(date)}
  </div>
)}
```

- [ ] **Step 3: Build**

```bash
bunx next build
```

Expected: green.

- [ ] **Step 4: Update NOTICE.md**

```markdown
**Heatmap (2026-07-10)** — the whole upstream `heatmap/` directory (19 files, minus
`__tests__/`) vendored into `heatmap/`. ONE fork, additive: `heatmap-tooltip.tsx` gains
optional `formatTitle`/`formatSubtitle` props (defaults reproduce upstream date + weekday
lines; `formatSubtitle` returning null hides the weekday row) — upstream hardwires a
calendar-contribution header, and our first call site is a ZIP×month grid, not a
contribution calendar. `HeatmapXAxis`/`HeatmapYAxis` are vendored for completeness but NOT
used by the ZIP×month panel (upstream y-axis is hardwired to weekday labels; the wrapper
renders its own plain-HTML labels instead — no fork needed). New dep: `@visx/heatmap`.
```

- [ ] **Step 5: Commit**

```bash
git add components/charts/vendor/bklit/heatmap components/charts/vendor/bklit/NOTICE.md
git commit -m "feat(charts): vendor bklit heatmap dir at d7cd5827 (one additive tooltip-header fork)"
```

---

### Task 4: Vendor Profit/Loss Line + legend directory

**Files:**
- Create: `components/charts/vendor/bklit/profit-loss-line.tsx`, `profit-loss-segments.ts`, `profit-loss-legend.tsx`, `profit-loss-legend-hover.tsx`, and `components/charts/vendor/bklit/legend/` — `index.ts`, `legend-context.tsx`, `legend-item.tsx`, `legend-label.tsx`, `legend-marker.tsx`, `legend-progress.tsx`, `legend-value.tsx`, `legend.tsx`
- 🔴 Modify: `components/charts/vendor/bklit/NOTICE.md`

**Interfaces:**
- Produces (used by Task 10): `ProfitLossLine` (props: `dataKey`, `xDataKey` default `"date"`, `positiveColor`, `negativeColor`, `strokeWidth`), `profitLossColor(value)`, `resolveProfitLossTooltipLabel(label)` from `./vendor/bklit/profit-loss-line`. Usage contract (upstream docs, verbatim): P/L renders inside `LineChart` alongside a hidden `Line` with the same `dataKey` (`stroke="transparent" strokeWidth={0} showHighlight={false} fadeEdges={false}`) so the series registers for y-domain/tooltip; zero baseline via `<Grid horizontal highlightRowValues={[0]} />`.

- [ ] **Step 1: Fetch verbatim**

```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
for f in profit-loss-line.tsx profit-loss-segments.ts profit-loss-legend.tsx profit-loss-legend-hover.tsx; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/$f?ref=$SHA" --jq .content | base64 -d > "components/charts/vendor/bklit/$f"
done
mkdir -p components/charts/vendor/bklit/legend
for f in index.ts legend-context.tsx legend-item.tsx legend-label.tsx legend-marker.tsx legend-progress.tsx legend-value.tsx legend.tsx; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/legend/$f?ref=$SHA" --jq .content | base64 -d > "components/charts/vendor/bklit/legend/$f"
done
grep -rhoE 'from "\./[a-z-]+|from "\.\./[a-z-]+' components/charts/vendor/bklit/profit-loss-*.tsx components/charts/vendor/bklit/profit-loss-segments.ts components/charts/vendor/bklit/legend/ | sort -u
```

Fetch any missing internal module the grep reveals; note additions in NOTICE.md.

- [ ] **Step 2: Build**

```bash
bunx next build
```

- [ ] **Step 3: Update NOTICE.md**

```markdown
**Profit/Loss Line (2026-07-10)** — `profit-loss-line.tsx`, `profit-loss-segments.ts`,
`profit-loss-legend.tsx`, `profit-loss-legend-hover.tsx` + the upstream `legend/` directory
(8 files) vendored verbatim, no forks. Upstream defaults
`var(--color-emerald-500)`/`var(--color-red-500)` are never used — call sites pass explicit
`positiveColor`/`negativeColor` (gulf mangrove / sunset-coral; the design language forbids
stock-market red/green). First call site: `components/charts/MomentumProfitLossPanel.tsx`.
```

- [ ] **Step 4: Commit**

```bash
git add components/charts/vendor/bklit/profit-loss-line.tsx components/charts/vendor/bklit/profit-loss-segments.ts components/charts/vendor/bklit/profit-loss-legend.tsx components/charts/vendor/bklit/profit-loss-legend-hover.tsx components/charts/vendor/bklit/legend components/charts/vendor/bklit/NOTICE.md
git commit -m "feat(charts): vendor bklit profit/loss line + legend dir at d7cd5827"
```

---

### Task 5: Vendor Projection Line + Reference Area utilities

**Files:**
- Create: `components/charts/vendor/bklit/projection-line.tsx`, `projection-utils.ts`, `projection-config.ts`, `projection-line-end-marker.tsx`, `reference-area.tsx`, `reference-area-config.ts`, `reference-area-geometry.ts`, `reference-area-registration-context.tsx`
- 🔴 Modify: `components/charts/vendor/bklit/NOTICE.md`

**Interfaces:**
- Produces (used by Task 11): `ProjectionLine` (props: `data: ProjectionPoint[]` = `{date, value}[]`, `stroke`, `strokeDasharray`, `curveKind`, `showEndMarker`), `buildProjectionPath({sourceData, seriesKey, mode: "target", pathDensity: "endpoints", horizonPoints, endValue})` from `./vendor/bklit/projection-utils` (confirm the export file via grep after fetch — it may re-export from `projection-config`), `ReferenceArea` (props: `x1?: Date`, `y1?/y2?`, `fill`, `fillOpacity`, `strokeStyle`) from `./vendor/bklit/reference-area`.

- [ ] **Step 1: Fetch verbatim + closure check**

```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
for f in projection-line.tsx projection-utils.ts projection-config.ts projection-line-end-marker.tsx reference-area.tsx reference-area-config.ts reference-area-geometry.ts reference-area-registration-context.tsx; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/$f?ref=$SHA" --jq .content | base64 -d > "components/charts/vendor/bklit/$f"
done
grep -rhoE 'from "\./[a-z-]+' components/charts/vendor/bklit/projection-*.tsx components/charts/vendor/bklit/projection-*.ts components/charts/vendor/bklit/reference-area*.tsx components/charts/vendor/bklit/reference-area*.ts | sort -u
grep -n "buildProjectionPath" components/charts/vendor/bklit/projection-*.ts
```

Fetch any missing internal module; note where `buildProjectionPath` actually lives for Task 11's import.

- [ ] **Step 2: Check whether LineChart must register these children**

```bash
grep -n "ProjectionLine\|ReferenceArea\|isChartClipPassthrough\|useReferenceAreaRegistration" components/charts/vendor/bklit/time-series-chart-shell.tsx components/charts/vendor/bklit/line-chart.tsx | head
```

If the already-vendored shell predates these utilities and lacks their registration hooks, re-fetch `time-series-chart-shell.tsx` (and `line-chart.tsx`) from the SAME pinned SHA — NOTICE says shared infra is verbatim, and the pin is identical, so a re-fetch is a no-op unless our copy is stale. Diff before overwriting:

```bash
gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/time-series-chart-shell.tsx?ref=$SHA" --jq .content | base64 -d | diff - components/charts/vendor/bklit/time-series-chart-shell.tsx
```

If the diff is non-empty, STOP and reconcile intentionally (our copy may carry a documented fork) — do not blind-overwrite.

- [ ] **Step 3: Build**

```bash
bunx next build
```

- [ ] **Step 4: Update NOTICE.md**

```markdown
**Projection Line + Reference Area (2026-07-10)** — `projection-line.tsx`,
`projection-utils.ts`, `projection-config.ts`, `projection-line-end-marker.tsx`,
`reference-area.tsx`, `reference-area-config.ts`, `reference-area-geometry.ts`,
`reference-area-registration-context.tsx` vendored verbatim, no forks. Projections render a
dashed forecast segment past the anchor; per the rules of engagement every projection call
site MUST carry `[INFERENCE]` + base value + one falsifier in visible copy (first call
site: `components/charts/TierProjectionChart.tsx`). Not compatible with Brush (upstream
docs) — Brush is not vendored.
```

- [ ] **Step 5: Commit**

```bash
git add components/charts/vendor/bklit/projection-line.tsx components/charts/vendor/bklit/projection-utils.ts components/charts/vendor/bklit/projection-config.ts components/charts/vendor/bklit/projection-line-end-marker.tsx components/charts/vendor/bklit/reference-area.tsx components/charts/vendor/bklit/reference-area-config.ts components/charts/vendor/bklit/reference-area-geometry.ts components/charts/vendor/bklit/reference-area-registration-context.tsx components/charts/vendor/bklit/NOTICE.md
git commit -m "feat(charts): vendor bklit projection line + reference area at d7cd5827"
```

---

### Task 6: Kill the fabricated vintages (rent bar + corridor scatter)

**Files:**
- Modify: `lib/build-chart-for-intent.mts` (delete `FIXTURE_ASOF`/`FIXTURE_SOURCE`, rewrite `buildRentChart` + `buildScatterChart`)
- Modify: `components/charts/CorridorMarketScatter.tsx` (footer label prop)
- Modify: `components/charts/registry/frames/CorridorMarketScatterFrame.tsx` (pass citation through)
- Modify: `app/embed/charts/page.tsx`, `app/demo/page.tsx` (pass explicit "Sample data" label)
- Test: `lib/build-chart-for-intent.test.mts` (update rent expectations, add pure-mapper tests)

**Interfaces:**
- Consumes: `createServiceRoleClientUntyped` from `@/utils/supabase/service-role` (the guarded pattern in `lib/charts/load-metro-trend.ts` — degrade to null on missing creds, never throw).
- Produces: `export interface CorridorProfileRow { corridor_name: string; city: string | null; asking_rent_psf: number | null; vacancy_rate_pct: number | null; absorption_sqft: number | null; metrics_verified_date: string | null; updated_at: string | null }`, `export function rentChartSpecFromRows(rows: CorridorProfileRow[]): ChartSpec | null`, `export function scatterChartSpecFromRows(rows: CorridorProfileRow[], permits: CorridorPermitsEntry[], centroids: CorridorCentroidEntry[]): ChartSpec | null`, and `export function corridorRowsAsOf(rows: CorridorProfileRow[]): string | null` in `lib/build-chart-for-intent.mts`.

- [ ] **Step 1: Write the failing tests**

Replace the rent test that pins the fabricated stamp (`expect(r?.asOf).toBe("2026-06-30")` at `lib/build-chart-for-intent.test.mts:64`) and add pure-mapper tests. Mirror the existing `vacancyChartSpecFromTable` test style in that file:

```ts
import { rentChartSpecFromRows, scatterChartSpecFromRows, corridorRowsAsOf } from "./build-chart-for-intent.mts";

const row = (over: Partial<CorridorProfileRow> = {}): CorridorProfileRow => ({
  corridor_name: "Test Corridor",
  city: "Fort Myers",
  asking_rent_psf: 30,
  vacancy_rate_pct: 4,
  absorption_sqft: 1000,
  metrics_verified_date: "2026-07-07",
  updated_at: "2026-07-08T00:00:00Z",
  ...over,
});

test("rentChartSpecFromRows: real vintage from metrics_verified_date, real citation, no fixture stamp", () => {
  const rows = [
    row({ corridor_name: "A", asking_rent_psf: 60, metrics_verified_date: "2026-07-01" }),
    row({ corridor_name: "B", asking_rent_psf: 40, metrics_verified_date: "2026-07-07" }),
    row({ corridor_name: "C", asking_rent_psf: 20, metrics_verified_date: null }),
  ];
  const spec = rentChartSpecFromRows(rows);
  expect(spec).not.toBeNull();
  expect(spec!.asOf).toBe("2026-07-07"); // max verified date, NOT a constant
  expect(spec!.source?.citation).toBe("SWFL Data Gulf verified corridor metrics");
  expect(spec!.rows[0][0]).toBe("A"); // sorted high→low rent
});

test("rentChartSpecFromRows: null when fewer than 3 corridors carry a rent", () => {
  expect(rentChartSpecFromRows([row(), row({ asking_rent_psf: null }), row({ asking_rent_psf: null })])).toBeNull();
});

test("corridorRowsAsOf: falls back to updated_at when no metrics_verified_date", () => {
  expect(corridorRowsAsOf([row({ metrics_verified_date: null, updated_at: "2026-07-08T12:00:00Z" })])).toBe("2026-07-08");
});

test("scatterChartSpecFromRows: carries real vintage and citation", () => {
  const rows = [
    row({ corridor_name: "A" }), row({ corridor_name: "B" }), row({ corridor_name: "C" }),
  ];
  // permits joined by CORRIDOR_ALIASES — construct entries whose corridor_id matches the alias of each name,
  // or assert the null-permit degrade: with no permits coverage the scatter returns null (<3 plottable).
  expect(scatterChartSpecFromRows(rows, [], [])).toBeNull();
});
```

(Adapt the scatter-positive case to the alias fixtures the existing test file already uses for the corridor join — reuse its helpers if present.)

- [ ] **Step 2: Run to verify failure**

```bash
bun test lib/build-chart-for-intent.test.mts
```

Expected: FAIL — `rentChartSpecFromRows is not exported`.

- [ ] **Step 3: Implement**

In `lib/build-chart-for-intent.mts`: delete the `FIXTURE_ASOF`/`FIXTURE_SOURCE` constants and their comment block. Add:

```ts
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

export interface CorridorProfileRow {
  corridor_name: string;
  city: string | null;
  asking_rent_psf: number | null;
  vacancy_rate_pct: number | null;
  absorption_sqft: number | null;
  metrics_verified_date: string | null;
  updated_at: string | null;
}

const CORRIDOR_CITATION = "SWFL Data Gulf verified corridor metrics";

/** Real vintage for a corridor_profiles read: newest metrics_verified_date,
 *  falling back to newest updated_at. Null when neither exists (caller then
 *  returns no chart — never a stamped constant). */
export function corridorRowsAsOf(rows: CorridorProfileRow[]): string | null {
  const dates = rows.map((r) => r.metrics_verified_date).filter((d): d is string => !!d);
  if (dates.length > 0) return dates.sort().at(-1)!.slice(0, 10);
  const updated = rows.map((r) => r.updated_at).filter((d): d is string => !!d);
  return updated.length > 0 ? updated.sort().at(-1)!.slice(0, 10) : null;
}

/** Guarded live read of verified corridor rows; [] on any failure (credless env,
 *  query error) so every consumer degrades to "no chart", never a 500. */
async function loadCorridorProfiles(): Promise<CorridorProfileRow[]> {
  try {
    const supabase = createServiceRoleClientUntyped();
    const { data, error } = await supabase
      .from("corridor_profiles")
      .select("corridor_name, city, asking_rent_psf, vacancy_rate_pct, absorption_sqft, metrics_verified_date, updated_at")
      .is("deleted_at", null)
      .eq("verification_status", "verified");
    if (error || !data) return [];
    return data as CorridorProfileRow[];
  } catch {
    return [];
  }
}

export function rentChartSpecFromRows(rows: CorridorProfileRow[]): ChartSpec | null {
  const withRent = rows.filter(
    (r): r is CorridorProfileRow & { asking_rent_psf: number } => r.asking_rent_psf != null,
  );
  const chartRows = withRent
    .sort((a, b) => b.asking_rent_psf - a.asking_rent_psf)
    .slice(0, 12)
    .map((r): [string, number] => [r.corridor_name, r.asking_rent_psf]);
  const asOf = corridorRowsAsOf(withRent);
  if (chartRows.length < 3 || !asOf) return null;

  const block: ChartBlock = {
    title: "SWFL Corridor NNN Asking Rents",
    columns: ["Corridor", "NNN Asking Rent ($/sqft)"],
    rows: chartRows,
    chart_type: "bar",
    value_format: "currency",
    asOf, // REAL vintage from the verified rows, never a constant
    source: { citation: CORRIDOR_CITATION },
  };
  if (!lintChartBlock(block).ok) return null;
  return { ...block, frameId: "bar-table" };
}
```

Rewrite `buildRentChart` to `const rows = await loadCorridorProfiles(); return rentChartSpecFromRows(rows);` and rewrite `buildScatterChart` the same way: live rows mapped to the `JoinedCorridorRow` shape (`id: r.corridor_name, name: r.corridor_name, submarket: r.city ?? "Unknown", nnn_asking_rent_per_sqft: r.asking_rent_psf, vacancy_pct: r.vacancy_rate_pct, absorption_sqft: r.absorption_sqft`), keeping the existing permits/centroids fixture joins as optional context, `asOf: corridorRowsAsOf(...)` (return null when null), `source: { citation: CORRIDOR_CITATION }`. Extract the join into `scatterChartSpecFromRows(rows, permits, centroids)` so it unit-tests without I/O.

- [ ] **Step 4: Run tests**

```bash
bun test lib/build-chart-for-intent.test.mts
```

Expected: PASS, including the pre-existing zhvi/vacancy tests (lines 89/157 assert `asOf` is NOT "2026-06-30" — they must still pass).

- [ ] **Step 5: Thread the scatter footer label**

`components/charts/CorridorMarketScatter.tsx`: add to props `sourceLabel?: string;` and change line ~489 from the hardcoded string to:

```tsx
as of {asOf}{sourceLabel ? ` · ${sourceLabel}` : ""}
```

`components/charts/registry/frames/CorridorMarketScatterFrame.tsx`: pass `sourceLabel={spec.source?.citation}` (match the prop name it already uses for `asOf`). `app/embed/charts/page.tsx` and `app/demo/page.tsx`: pass `sourceLabel="Sample data"` explicitly (they render fixture data and must say so).

- [ ] **Step 6: Verify no fabricated stamp remains**

```bash
grep -rn "FIXTURE_ASOF\|SWFL fixture sample" lib components app --include="*.ts" --include="*.tsx" --include="*.mts"
```

Expected: matches only in `lib/build-chart-for-intent.test.mts` history-free assertions (i.e., none, once the test no longer pins it) — zero production hits.

- [ ] **Step 7: Build + commit**

```bash
bunx next build
git add lib/build-chart-for-intent.mts lib/build-chart-for-intent.test.mts components/charts/CorridorMarketScatter.tsx components/charts/registry/frames/CorridorMarketScatterFrame.tsx app/embed/charts/page.tsx app/demo/page.tsx
git commit -m "fix(charts): rent bar + corridor scatter read live corridor_profiles with real vintage — fabricated FIXTURE_ASOF removed"
```

---

### Task 7: `data_lake.zhvi_zip_yoy_monthly` view (heatmap source)

**Files:**
- Create: `migrations/20260710_zhvi_zip_yoy_monthly.sql`

**Interfaces:**
- Produces: view `data_lake.zhvi_zip_yoy_monthly` — columns `zip_code text`, `period_end date`, `home_value double precision`, `yoy_pct double precision`. One row per (ZIP, month) where a prior-year month exists.

- [ ] **Step 1: Write the idempotent migration**

```sql
-- ZIP×month YoY % change of ZHVI, computed at source so the /charts heatmap
-- reads a small window instead of hauling 34k raw rows past the PostgREST cap.
-- Join on month-truncated period_end (period_end is month-END; a leap-February
-- date-arithmetic join would miss 2024-02-29 → 2025-02-28).
create or replace view data_lake.zhvi_zip_yoy_monthly as
select
  cur.zip_code,
  cur.period_end,
  cur.home_value,
  ((cur.home_value - prior.home_value) / prior.home_value) * 100.0 as yoy_pct
from data_lake.zhvi_swfl cur
join data_lake.zhvi_swfl prior
  on prior.zip_code = cur.zip_code
 and date_trunc('month', prior.period_end) = date_trunc('month', cur.period_end - interval '1 year')
where cur.home_value is not null
  and prior.home_value is not null
  and prior.home_value <> 0;

grant select on data_lake.zhvi_zip_yoy_monthly to service_role;
```

- [ ] **Step 2: Run it**

```bash
bun scripts/run-migration.ts migrations/20260710_zhvi_zip_yoy_monthly.sql
```

Expected: `✓ done`.

- [ ] **Step 3: Verify row count + spot-check a value (RULE 1: verify after migration)**

Via the lake MCP (`query_lake`) or a bun one-liner:

```sql
select count(*) as n, min(period_end) as min_p, max(period_end) as max_p,
       count(distinct zip_code) as zips
from pg.data_lake.zhvi_zip_yoy_monthly;
```

Expected: ~30k rows (34,031 raw minus the first 12 months per ZIP), `max_p` = `2026-05-31`, 109 ZIPs. Spot-check one ZIP/month YoY by hand against two `zhvi_swfl` rows.

- [ ] **Step 4: Commit**

```bash
git add migrations/20260710_zhvi_zip_yoy_monthly.sql
git commit -m "feat(lake): zhvi_zip_yoy_monthly view — ZIP-month YoY aggregated at source for the charts heatmap"
```

---

### Task 8: Market-temperature gauge panel

**Files:**
- Create: `lib/charts/market-temperature-series.ts`, `components/charts/MarketTemperatureGauge.tsx`
- 🟡 Modify: `app/charts/page.tsx`, `components/charts/index.ts`, `lib/charts/format.ts`
- Test: `lib/charts/market-temperature-series.test.ts`

**Interfaces:**
- Consumes: `Gauge` (Task 2), `medianOf` from `@/lib/stats`, `Supabase` untyped service-role client (page pattern).
- Produces: `export interface MarketTempGaugeData { medianHotness: number; zipCount: number; asOf?: string }`, `export function mapMarketTemperature(rows: MarketTempRow[] | null | undefined): MarketTempGaugeData | null` (null = hide panel), `export function formatAsOfDate(isoDate: string | undefined): string | undefined` in `lib/charts/format.ts` ("2026-07-04" → "07/04/2026").

- [ ] **Step 1: Failing tests**

`lib/charts/market-temperature-series.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mapMarketTemperature } from "./market-temperature-series";

const rows = (n: number, score = 50) =>
  Array.from({ length: n }, (_, i) => ({
    local_hotness_score: score + i,
    captured_date: "2026-07-04",
  }));

test("median hotness across ZIPs, zip count, iso asOf", () => {
  const g = mapMarketTemperature(rows(11, 40));
  expect(g).not.toBeNull();
  expect(g!.medianHotness).toBe(45); // 40..50 → median 45
  expect(g!.zipCount).toBe(11);
  expect(g!.asOf).toBe("2026-07-04");
});

test("null-score rows excluded from median and count", () => {
  const g = mapMarketTemperature([...rows(11, 40), { local_hotness_score: null, captured_date: "2026-07-04" }]);
  expect(g!.zipCount).toBe(11);
});

test("thin data (<10 scored ZIPs) hides the panel", () => {
  expect(mapMarketTemperature(rows(9))).toBeNull();
  expect(mapMarketTemperature(null)).toBeNull();
});
```

Also in `lib/charts/format.ts` test coverage (add to its existing test file if one exists, else assert inline in the series test): `formatAsOfDate("2026-07-04") === "07/04/2026"`, `formatAsOfDate(undefined) === undefined`.

- [ ] **Step 2: Run to verify failure**

```bash
bun test lib/charts/market-temperature-series.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement mapper + formatter**

`lib/charts/market-temperature-series.ts`:

```ts
import { medianOf } from "@/lib/stats";

export interface MarketTempRow {
  local_hotness_score: number | null;
  captured_date: string | null;
}

export interface MarketTempGaugeData {
  medianHotness: number;
  zipCount: number;
  asOf?: string; // "YYYY-MM-DD"
}

/** Median realtor.com hotness (0–100) across scored SWFL ZIPs. Null (hide the
 *  panel) below 10 scored ZIPs — a 3-ZIP median stamped as "SWFL" would mislead. */
export function mapMarketTemperature(
  rows: MarketTempRow[] | null | undefined,
): MarketTempGaugeData | null {
  const scores = (rows ?? [])
    .map((r) => r.local_hotness_score)
    .filter((s): s is number => typeof s === "number");
  if (scores.length < 10) return null;
  const asOf =
    (rows ?? [])
      .map((r) => r.captured_date)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1)
      ?.slice(0, 10) ?? undefined;
  return {
    medianHotness: Math.round(medianOf(scores) * 10) / 10,
    zipCount: scores.length,
    asOf,
  };
}
```

`lib/charts/format.ts` — add:

```ts
/** ISO date ("2026-07-04") → the MM/DD/YYYY convention every caption uses. */
export function formatAsOfDate(isoDate: string | undefined): string | undefined {
  if (!isoDate) return undefined;
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  if (!y || !m || !d) return undefined;
  return `${m}/${d}/${y}`;
}
```

- [ ] **Step 4: Run tests**

```bash
bun test lib/charts/market-temperature-series.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wrapper component**

`components/charts/MarketTemperatureGauge.tsx` (client component; card chrome copied from `HurricaneRingChart`'s container classes so the page reads as one system):

```tsx
"use client";

import { Gauge } from "./vendor/bklit/gauge";
import type { MarketTempGaugeData } from "@/lib/charts/market-temperature-series";
import { formatAsOfDate } from "@/lib/charts/format";

export interface MarketTemperatureGaugeProps {
  gauge: MarketTempGaugeData;
  className?: string;
}

const GULF_TEAL = "#3DC9C0";
const TRACK = "rgba(240,237,230,0.10)";

/** Regional market-temperature dial: median realtor.com hotness (0–100)
 *  across scored SWFL ZIPs. Deterministic — the median is computed in
 *  mapMarketTemperature, this component only draws it. */
export function MarketTemperatureGauge({ gauge, className = "" }: MarketTemperatureGaugeProps) {
  return (
    <div className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}>
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">Market Temperature</h3>
      <p className="text-sm text-gray-500">
        Median market hotness — 0 (cold) to 100 (hot) — across {gauge.zipCount} Lee &amp; Collier ZIP codes
      </p>
      <div className="mt-4 mx-auto max-w-md">
        <Gauge
          value={gauge.medianHotness}
          centerValue={gauge.medianHotness}
          defaultLabel="of 100 · hotness"
          formatOptions={{ maximumFractionDigits: 1 }}
          activeFill={GULF_TEAL}
          inactiveFill={TRACK}
          inactiveFillOpacity={1}
          spacing={25}
        />
      </div>
      <p className="mt-3 text-xs text-gray-500 font-mono">
        {gauge.asOf ? `as of ${formatAsOfDate(gauge.asOf)} · ` : ""}realtor.com monthly ZIP aggregates
      </p>
    </div>
  );
}
```

Export from `components/charts/index.ts`: `export { MarketTemperatureGauge } from "./MarketTemperatureGauge";`

- [ ] **Step 6: Page loader + wiring**

`app/charts/page.tsx` — add loader (same guarded shape as the others):

```ts
import { mapMarketTemperature, type MarketTempRow, type MarketTempGaugeData } from "@/lib/charts/market-temperature-series";

async function loadMarketTemperature(
  supabase: Supabase,
): Promise<{ gauge: MarketTempGaugeData | null }> {
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("market_details_swfl_latest")
      .select("local_hotness_score, captured_date");
    if (error) return { gauge: null };
    return { gauge: mapMarketTemperature(data as MarketTempRow[] | null) };
  } catch {
    return { gauge: null };
  }
}
```

Add `loadMarketTemperature(supabase)` to the `Promise.all`, and render ABOVE the hurricane ring (the dial is the page's temperature headline), hidden entirely when null:

```tsx
{marketTemp.gauge && <MarketTemperatureGauge gauge={marketTemp.gauge} />}
```

- [ ] **Step 7: Build + visual check + commit**

```bash
bunx next build && bunx next start
```

Open `http://localhost:3000/charts`: dial fills to the median, center number matches a `median(local_hotness_score)` spot-check against the lake, caption reads `as of 07/04/2026 · realtor.com monthly ZIP aggregates` (or the current capture date). Then:

```bash
git add lib/charts/market-temperature-series.ts lib/charts/market-temperature-series.test.ts lib/charts/format.ts components/charts/MarketTemperatureGauge.tsx components/charts/index.ts app/charts/page.tsx
git commit -m "feat(charts): market-temperature gauge panel — median per-ZIP hotness, live view, real vintage"
```

---

### Task 9: ZIP×month momentum heatmap panel

**Files:**
- Create: `lib/charts/zip-heatmap-series.ts`, `components/charts/ZipMomentumHeatmap.tsx`
- 🟡 Modify: `app/charts/page.tsx`, `components/charts/index.ts`
- Test: `lib/charts/zip-heatmap-series.test.ts`

**Interfaces:**
- Consumes: view `data_lake.zhvi_zip_yoy_monthly` (Task 7), heatmap components (Task 3).
- Produces: `export interface ZipYoYRow { zip_code: string; period_end: string; yoy_pct: number }`, `export interface ZipHeatmapData { columns: HeatmapColumn[]; zipLabels: string[]; monthLabels: string[]; asOf: string; cellValue: (column: number, row: number) => number | null }`, `export function mapZipHeatmap(rows: ZipYoYRow[] | null | undefined, opts?: { zips?: number; months?: number }): ZipHeatmapData | null`, `export const YOY_BUCKET_COLORS: readonly [string, string, string, string, string]`, `export function yoyBucket(yoyPct: number): 0 | 1 | 2 | 3 | 4`.

- [ ] **Step 1: Failing tests**

`lib/charts/zip-heatmap-series.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mapZipHeatmap, yoyBucket } from "./zip-heatmap-series";

function synth(zips: string[], months: string[], value: (z: string, m: string) => number) {
  return zips.flatMap((z) => months.map((m) => ({ zip_code: z, period_end: m, yoy_pct: value(z, m) })));
}
const MONTHS = ["2025-06-30","2025-07-31","2025-08-31","2025-09-30","2025-10-31","2025-11-30","2025-12-31","2026-01-31","2026-02-28","2026-03-31","2026-04-30","2026-05-31"];

test("fixed diverging buckets", () => {
  expect(yoyBucket(-8)).toBe(0);  // ≤ -5
  expect(yoyBucket(-2)).toBe(1);  // (-5, 0)
  expect(yoyBucket(0)).toBe(2);   // [0, 5)
  expect(yoyBucket(4.9)).toBe(2);
  expect(yoyBucket(7)).toBe(3);   // [5, 10)
  expect(yoyBucket(12)).toBe(4);  // ≥ 10
});

test("selects the biggest absolute movers in the latest month, sorted by latest YoY desc", () => {
  const zips = ["11111", "22222", "33333"];
  // 33333 is the biggest mover (−9), 11111 next (+6), 22222 flat (+1)
  const rows = synth(zips, MONTHS, (z) => (z === "33333" ? -9 : z === "11111" ? 6 : 1));
  const grid = mapZipHeatmap(rows, { zips: 2, months: 12 });
  expect(grid).not.toBeNull();
  expect(grid!.zipLabels).toEqual(["11111", "33333"]); // +6 sorts above −9
  expect(grid!.columns).toHaveLength(12);
  expect(grid!.columns[0].bins).toHaveLength(2);
  expect(grid!.asOf).toBe("2026-05-31");
  expect(grid!.cellValue(11, 0)).toBe(6); // latest month, first row = 11111's real YoY
});

test("hides the panel on thin data (fewer than 6 months or 5 ZIPs)", () => {
  expect(mapZipHeatmap(synth(["1","2","3","4","5"], MONTHS.slice(0, 3), () => 1))).toBeNull();
  expect(mapZipHeatmap(null)).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun test lib/charts/zip-heatmap-series.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the mapper**

`lib/charts/zip-heatmap-series.ts`:

```ts
import type { HeatmapColumn } from "@/components/charts/vendor/bklit/heatmap/heatmap-context";

export interface ZipYoYRow {
  zip_code: string;
  period_end: string; // "YYYY-MM-DD" month end
  yoy_pct: number;
}

export interface ZipHeatmapData {
  columns: HeatmapColumn[]; // one column per month, one bin per ZIP row
  zipLabels: string[]; // row order, top → bottom
  monthLabels: string[]; // "Jun 25" style, column order
  asOf: string; // newest period_end in the grid
  /** Real YoY % for (columnIndex, rowIndex), for tooltip + a11y — null for a gap. */
  cellValue: (column: number, row: number) => number | null;
}

/** Fixed diverging buckets (NOT quantiles — two months must be comparable):
 *  0: ≤ −5 · 1: (−5, 0) · 2: [0, 5) · 3: [5, 10) · 4: ≥ 10  (YoY %) */
export function yoyBucket(yoyPct: number): 0 | 1 | 2 | 3 | 4 {
  if (yoyPct <= -5) return 0;
  if (yoyPct < 0) return 1;
  if (yoyPct < 5) return 2;
  if (yoyPct < 10) return 3;
  return 4;
}

/** Diverging ramp from existing gulf tokens only: sunset-coral (falling) →
 *  gulf-haze (flat) → gulf-teal (rising). */
export const YOY_BUCKET_COLORS = [
  "#E08158",
  "rgba(224,129,88,0.45)",
  "#22414F",
  "rgba(61,201,192,0.45)",
  "#3DC9C0",
] as const;

const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

export function mapZipHeatmap(
  rows: ZipYoYRow[] | null | undefined,
  opts: { zips?: number; months?: number } = {},
): ZipHeatmapData | null {
  const wantZips = opts.zips ?? 20;
  const wantMonths = opts.months ?? 12;
  if (!rows || rows.length === 0) return null;

  const months = [...new Set(rows.map((r) => r.period_end))].sort().slice(-wantMonths);
  if (months.length < 6) return null;
  const latest = months[months.length - 1];

  // Biggest absolute movers in the latest month, then displayed sorted by latest YoY desc.
  const latestByZip = new Map(rows.filter((r) => r.period_end === latest).map((r) => [r.zip_code, r.yoy_pct]));
  const zips = [...latestByZip.entries()]
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, wantZips)
    .sort((a, b) => b[1] - a[1])
    .map(([zip]) => zip);
  if (zips.length < 5) return null;

  const byKey = new Map(rows.map((r) => [`${r.zip_code}|${r.period_end}`, r.yoy_pct]));
  const columns: HeatmapColumn[] = months.map((m, ci) => ({
    bin: ci,
    bins: zips.map((z, ri) => {
      const v = byKey.get(`${z}|${m}`);
      return { bin: ri, count: v == null ? Number.NaN : v, date: new Date(`${m}T00:00:00Z`) };
    }),
  }));

  return {
    columns,
    zipLabels: zips,
    monthLabels: months.map((m) => MONTH_FMT.format(new Date(`${m}T00:00:00Z`))),
    asOf: latest,
    cellValue: (column, row) => {
      const v = byKey.get(`${zips[row]}|${months[column]}`);
      return v == null ? null : v;
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
bun test lib/charts/zip-heatmap-series.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wrapper component**

`components/charts/ZipMomentumHeatmap.tsx` — same card chrome; passes a value-based `colorScale` (NOT the count-quantized default), renders its own ZIP row labels + month column labels (upstream axes are weekday-hardwired), and a 5-swatch threshold legend:

```tsx
"use client";

import {
  HeatmapChart,
  HeatmapCells,
  HeatmapInteractionBoundary,
  HeatmapInteractionProvider,
  HeatmapTooltip,
} from "./vendor/bklit/heatmap";
import {
  YOY_BUCKET_COLORS,
  yoyBucket,
  type ZipHeatmapData,
} from "@/lib/charts/zip-heatmap-series";
import { formatAsOfDate } from "@/lib/charts/format";

export interface ZipMomentumHeatmapProps {
  grid: ZipHeatmapData;
  className?: string;
}

const BUCKET_LABELS = ["≤ −5%", "−5–0%", "0–5%", "5–10%", "≥ 10%"];

/** ZIP×month home-value momentum grid: each cell is that ZIP's REAL YoY %
 *  (carried as the bin count), pre-bucketed into 5 fixed diverging levels.
 *  Colors map by VALUE, not the upstream contribution quantization. */
export function ZipMomentumHeatmap({ grid, className = "" }: ZipMomentumHeatmapProps) {
  const colorScale = (count: number | null | undefined) =>
    count == null || Number.isNaN(count) ? "rgba(240,237,230,0.04)" : YOY_BUCKET_COLORS[yoyBucket(count)];

  return (
    <div className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}>
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">Where Home Values Are Moving, ZIP by ZIP</h3>
      <p className="text-sm text-gray-500">
        Year-over-year home-value change — the {grid.zipLabels.length} ZIPs moving hardest this month, trailing {grid.monthLabels.length} months
      </p>
      <HeatmapInteractionProvider>
        <HeatmapInteractionBoundary>
          <div className="mt-4 flex gap-2">
            <div className="flex flex-col justify-between py-1 text-[10px] font-mono text-gray-500">
              {grid.zipLabels.map((z) => (
                <span key={z}>{z}</span>
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <HeatmapChart data={grid.columns} layout="fluid" colorScale={colorScale}>
                <HeatmapCells inactiveOpacity={1} inactiveScale={1} />
                <HeatmapTooltip
                  instant
                  formatTitle={(d) =>
                    new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d)
                  }
                  formatSubtitle={() => null}
                  formatLabel={(count) =>
                    Number.isNaN(count) ? "no data" : `${count >= 0 ? "+" : ""}${count.toFixed(1)}% year over year`
                  }
                />
              </HeatmapChart>
              <div className="mt-1 flex justify-between text-[10px] font-mono text-gray-500">
                {grid.monthLabels.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>
          </div>
        </HeatmapInteractionBoundary>
      </HeatmapInteractionProvider>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] font-mono text-gray-500">
        {BUCKET_LABELS.map((label, i) => (
          <span key={label} className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: YOY_BUCKET_COLORS[i] }} />
            {label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500 font-mono">
        as of {formatAsOfDate(grid.asOf)} · Zillow Home Value Index (ZHVI)
      </p>
    </div>
  );
}
```

Notes for the implementer: `colorScale` is a real `HeatmapChart` prop (`colorScaleProp` internally) — verify the prop name in the vendored `heatmap-chart.tsx` and adjust if upstream calls it differently. If ZIP-row/month-label alignment drifts from the cell grid at odd widths, align with the same `margin`/`gap` values the chart context exposes rather than eyeballing pixel offsets.

Export from `components/charts/index.ts`.

- [ ] **Step 6: Page loader + wiring**

`app/charts/page.tsx`:

```ts
import { mapZipHeatmap, type ZipYoYRow, type ZipHeatmapData } from "@/lib/charts/zip-heatmap-series";

// Trailing 13 months × 109 ZIPs ≈ 1,400 rows — over the 1000-row PostgREST cap,
// so page through it (aggregate-at-source view keeps this the SMALL query).
async function loadZipHeatmap(supabase: Supabase): Promise<{ grid: ZipHeatmapData | null }> {
  try {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 13);
    const sinceIso = since.toISOString().slice(0, 10);
    const pageSize = 1000;
    const all: ZipYoYRow[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .schema("data_lake")
        .from("zhvi_zip_yoy_monthly")
        .select("zip_code, period_end, yoy_pct")
        .gte("period_end", sinceIso)
        .order("period_end", { ascending: true })
        .order("zip_code", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) return { grid: null };
      all.push(...((data ?? []) as ZipYoYRow[]));
      if (!data || data.length < pageSize) break;
    }
    return { grid: mapZipHeatmap(all) };
  } catch {
    return { grid: null };
  }
}
```

Wire into `Promise.all`, render `{zipHeat.grid && <ZipMomentumHeatmap grid={zipHeat.grid} />}` after the metro panels.

- [ ] **Step 7: Build + visual check + commit**

```bash
bunx next build && bunx next start
```

`/charts`: 20 rows × 12-13 columns, teal clusters on rising ZIPs, coral on falling; tooltip shows "+X.X% year over year" with month/year title and NO weekday line; legend thresholds visible; caption `as of 05/31/2026 · Zillow Home Value Index (ZHVI)`. Spot-check one cell against `pg.data_lake.zhvi_zip_yoy_monthly`.

```bash
git add lib/charts/zip-heatmap-series.ts lib/charts/zip-heatmap-series.test.ts components/charts/ZipMomentumHeatmap.tsx components/charts/index.ts app/charts/page.tsx
git commit -m "feat(charts): ZIP-by-month home-value momentum heatmap — live YoY view, fixed diverging buckets"
```

---

### Task 10: YoY momentum as Profit/Loss small multiples (replaces the recharts momentum panel)

**Files:**
- Create: `components/charts/MomentumProfitLossPanel.tsx`
- 🟡 Modify: `app/charts/page.tsx` (swap the `home-value-momentum` panel entry for the new component), `components/charts/index.ts`

**Interfaces:**
- Consumes: `loadHomeValueMomentum` (page.tsx — unchanged; returns `{data: ChartRow[] ({month, cape_coral, fort_myers, naples}), asOf?, error}`), `LineChart`/`Line` from `./vendor/bklit/line-chart`, `Grid` from `./vendor/bklit/grid`, `XAxis` from `./vendor/bklit/x-axis`, `ChartTooltip` from `./vendor/bklit/tooltip`, `ProfitLossLine, profitLossColor` from `./vendor/bklit/profit-loss-line` (Task 4).
- Produces: `MomentumProfitLossPanel({ data, asOf, error })` — three mini charts, one per metro.

- [ ] **Step 1: Component**

```tsx
"use client";

import { LineChart } from "./vendor/bklit/line-chart";
import { Line } from "./vendor/bklit/line";
import { Grid } from "./vendor/bklit/grid";
import { XAxis } from "./vendor/bklit/x-axis";
import { ChartTooltip } from "./vendor/bklit/tooltip";
import { ProfitLossLine } from "./vendor/bklit/profit-loss-line";
import { curveLinear } from "@visx/curve";
import type { ChartRow } from "@/types/viz";
import { formatAsOf } from "@/lib/charts/format";

export interface MomentumProfitLossPanelProps {
  data: ChartRow[]; // {month, cape_coral, fort_myers, naples}
  asOf?: string; // "YYYY-MM"
  error?: string | null;
  className?: string;
}

const POSITIVE = "#5bc97a"; // mangrove
const NEGATIVE = "#E08158"; // sunset-coral — never stock-market red/green

const METROS = [
  { key: "cape_coral", label: "Cape Coral" },
  { key: "fort_myers", label: "Fort Myers" },
  { key: "naples", label: "Naples" },
] as const;

/** YoY home-value momentum as sign-colored small multiples — one mini chart per
 *  metro (Profit/Loss Line is single-series; three multiples beat one averaged
 *  composite, which would hide the per-metro story). */
export function MomentumProfitLossPanel({ data, asOf, error, className = "" }: MomentumProfitLossPanelProps) {
  if (error || data.length < 13) return null; // empty-tolerant: hide, never sample

  const perMetro = METROS.map((m) => ({
    ...m,
    rows: data
      .filter((r) => typeof r[m.key] === "number")
      .map((r) => ({ date: new Date(`${r.month}-01T00:00:00Z`), pnl: r[m.key] as number })),
  }));

  return (
    <div className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}>
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">Home Value Year-Over-Year Growth</h3>
      <p className="text-sm text-gray-500">
        Green above zero, coral below — the sign flip IS the story
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {perMetro.map((m) => (
          <div key={m.key}>
            <p className="text-xs font-mono text-gray-400">{m.label}</p>
            <div className="h-44">
              <LineChart data={m.rows}>
                <Grid horizontal highlightRowValues={[0]} />
                <Line
                  curve={curveLinear}
                  dataKey="pnl"
                  fadeEdges={false}
                  showHighlight={false}
                  stroke="transparent"
                  strokeWidth={0}
                />
                <ProfitLossLine dataKey="pnl" positiveColor={POSITIVE} negativeColor={NEGATIVE} />
                <XAxis />
                <ChartTooltip
                  rows={(point) => {
                    const value = (point.pnl as number) ?? 0;
                    return [
                      {
                        color: value >= 0 ? POSITIVE : NEGATIVE,
                        label: "YoY change",
                        value: `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`,
                      },
                    ];
                  }}
                />
              </LineChart>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500 font-mono">
        {asOf ? `as of ${formatAsOf(asOf)} · ` : ""}Zillow Home Value Index (ZHVI)
      </p>
    </div>
  );
}
```

Implementer notes: confirm `formatAsOf`'s exact output at `lib/charts/format.ts:50` renders MM/DD/YYYY-style (it's the month formatter the page already uses); confirm `ChartTooltip`'s `rows` callback signature against the vendored `tooltip/chart-tooltip.tsx` (upstream docs show `rows={(point) => [...]}` — adjust the value type if the vendored `TooltipRow` wants a number).

- [ ] **Step 2: Swap the page panel**

In `app/charts/page.tsx`: remove the `home-value-momentum` entry from the `panels` array (KEEP the `loadHomeValueMomentum` loader and its `Promise.all` slot), export the new component from `components/charts/index.ts`, and render in the old panel's position in the page flow:

```tsx
<MomentumProfitLossPanel
  data={homeValueMomentum.data}
  asOf={homeValueMomentum.asOf}
  error={homeValueMomentum.error}
/>
```

- [ ] **Step 3: Build + visual check**

```bash
bunx next build && bunx next start
```

`/charts`: three mini charts; recent months dip coral below the zero baseline (SWFL values are currently falling YoY); zero gridline emphasized; tooltip prints signed percent; exactly ONE momentum panel on the page.

- [ ] **Step 4: Commit**

```bash
git add components/charts/MomentumProfitLossPanel.tsx components/charts/index.ts app/charts/page.tsx
git commit -m "feat(charts): momentum panel reborn as sign-colored profit/loss small multiples"
```

---

### Task 11: Tier divergence with 6-month projection (replaces the recharts tier-gap panel)

**Files:**
- Create: `lib/charts/tier-projection-series.ts`, `components/charts/TierProjectionChart.tsx`
- 🟡 Modify: `app/charts/page.tsx`, `components/charts/index.ts`
- Test: `lib/charts/tier-projection-series.test.ts`

**Interfaces:**
- Consumes: `loadTierIndexed` (page.tsx, unchanged — `{data: ChartRow[] ({month, luxury_index, starter_index}), asOf?, error}`), `LineChart`/`Line`/`Grid`/`XAxis`/`ChartTooltip` (as Task 10), `ProjectionLine` + `buildProjectionPath` + `ReferenceArea` (Task 5), `TIER_INDEXED_SERIES` colors from `lib/charts/series.ts`.
- Produces: `export interface TierProjection { luxuryEnd: number; starterEnd: number; luxuryLatest: number; starterLatest: number; horizonMonths: number }`, `export function projectTierTrend(entries: ChartRow[], horizonMonths?: number, window?: number): TierProjection | null`.

- [ ] **Step 1: Failing tests**

`lib/charts/tier-projection-series.test.ts`:

```ts
import { expect, test } from "bun:test";
import { projectTierTrend } from "./tier-projection-series";

const rows = (n: number, lux: (i: number) => number, star: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => ({
    month: `20${String(20 + Math.floor(i / 12)).padStart(2, "0")}-${String((i % 12) + 1).padStart(2, "0")}`,
    luxury_index: lux(i),
    starter_index: star(i),
  }));

test("linear series projects linearly: +1/mo over 12 → +6 at horizon 6", () => {
  const p = projectTierTrend(rows(24, (i) => 100 + i, (i) => 100 + 2 * i), 6, 12);
  expect(p).not.toBeNull();
  expect(p!.luxuryLatest).toBe(123);
  expect(p!.luxuryEnd).toBeCloseTo(129, 5); // slope 1 × 6 months
  expect(p!.starterEnd).toBeCloseTo(146 + 12, 5); // slope 2 × 6 months from 146
  expect(p!.horizonMonths).toBe(6);
});

test("flat series projects flat", () => {
  const p = projectTierTrend(rows(24, () => 100, () => 100), 6, 12);
  expect(p!.luxuryEnd).toBeCloseTo(100, 5);
});

test("null under a full trailing window (needs 12 rows)", () => {
  expect(projectTierTrend(rows(8, (i) => 100 + i, (i) => 100 + i))).toBeNull();
  expect(projectTierTrend([])).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bun test lib/charts/tier-projection-series.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/charts/tier-projection-series.ts`:

```ts
import type { ChartRow } from "@/types/viz";

export interface TierProjection {
  luxuryLatest: number;
  starterLatest: number;
  luxuryEnd: number;
  starterEnd: number;
  horizonMonths: number;
}

/** Least-squares slope of the last `window` values, per index step (= per month). */
function trailingSlope(values: number[]): number {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Deterministic 6-month linear extrapolation of each tier's index on its
 *  trailing-12-month trend. This is the [INFERENCE] base math — the CALLER
 *  must render the tag, base values, and falsifier (rules of engagement). */
export function projectTierTrend(
  entries: ChartRow[],
  horizonMonths = 6,
  window = 12,
): TierProjection | null {
  const lux = entries.map((e) => e.luxury_index).filter((v): v is number => typeof v === "number");
  const star = entries.map((e) => e.starter_index).filter((v): v is number => typeof v === "number");
  if (lux.length < window || star.length < window) return null;
  const luxWin = lux.slice(-window);
  const starWin = star.slice(-window);
  const luxuryLatest = luxWin[luxWin.length - 1];
  const starterLatest = starWin[starWin.length - 1];
  return {
    luxuryLatest,
    starterLatest,
    luxuryEnd: luxuryLatest + trailingSlope(luxWin) * horizonMonths,
    starterEnd: starterLatest + trailingSlope(starWin) * horizonMonths,
    horizonMonths,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
bun test lib/charts/tier-projection-series.test.ts
```

Expected: PASS.

- [ ] **Step 5: Component**

`components/charts/TierProjectionChart.tsx`:

```tsx
"use client";

import { LineChart } from "./vendor/bklit/line-chart";
import { Line } from "./vendor/bklit/line";
import { Grid } from "./vendor/bklit/grid";
import { XAxis } from "./vendor/bklit/x-axis";
import { ChartTooltip } from "./vendor/bklit/tooltip";
import { ProjectionLine } from "./vendor/bklit/projection-line";
import { buildProjectionPath } from "./vendor/bklit/projection-utils";
import { ReferenceArea } from "./vendor/bklit/reference-area";
import type { ChartRow } from "@/types/viz";
import { projectTierTrend } from "@/lib/charts/tier-projection-series";
import { formatAsOf } from "@/lib/charts/format";

export interface TierProjectionChartProps {
  data: ChartRow[]; // {month, luxury_index, starter_index}
  asOf?: string;
  error?: string | null;
  className?: string;
}

const LUXURY = "#3DC9C0"; // gulf-teal (matches TIER_INDEXED_SERIES)
const STARTER = "#5bc97a"; // mangrove

export function TierProjectionChart({ data, asOf, error, className = "" }: TierProjectionChartProps) {
  if (error || data.length < 24) return null;

  const rows = data
    .filter((r) => typeof r.luxury_index === "number" && typeof r.starter_index === "number")
    .map((r) => ({
      date: new Date(`${r.month}-01T00:00:00Z`),
      luxury_index: r.luxury_index as number,
      starter_index: r.starter_index as number,
    }));
  const projection = projectTierTrend(data);
  if (rows.length < 24 || !projection) return null;

  const anchorDate = rows[rows.length - 1].date;
  const luxPath = buildProjectionPath({
    sourceData: rows,
    seriesKey: "luxury_index",
    mode: "target",
    pathDensity: "endpoints",
    horizonPoints: projection.horizonMonths,
    endValue: projection.luxuryEnd,
  });
  const starPath = buildProjectionPath({
    sourceData: rows,
    seriesKey: "starter_index",
    mode: "target",
    pathDensity: "endpoints",
    horizonPoints: projection.horizonMonths,
    endValue: projection.starterEnd,
  });

  const fmt = (v: number) => Math.round(v);

  return (
    <div className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}>
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">Luxury vs. Starter Home Price Index — With a 6-Month Look Ahead</h3>
      <p className="text-sm text-gray-500">
        Each tier set to 100 in Jan 2019. Solid lines are Zillow&apos;s published monthly medians; dashed segments are a projection.
      </p>
      <div className="mt-4 h-72">
        <LineChart data={rows}>
          <Grid horizontal />
          <ReferenceArea x1={anchorDate} fill="#F0EDE6" fillOpacity={0.04} strokeStyle="dashed" />
          <Line dataKey="luxury_index" stroke={LUXURY} strokeWidth={2} />
          <Line dataKey="starter_index" stroke={STARTER} strokeWidth={2} />
          <ProjectionLine data={luxPath} stroke={LUXURY} strokeDasharray="2,5" showEndMarker />
          <ProjectionLine data={starPath} stroke={STARTER} strokeDasharray="2,5" showEndMarker />
          <XAxis />
          <ChartTooltip
            rows={(point) => [
              { color: LUXURY, label: "Luxury homes", value: fmt(point.luxury_index as number) },
              { color: STARTER, label: "Starter homes", value: fmt(point.starter_index as number) },
            ]}
          />
        </LineChart>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        [INFERENCE] The dashed segments extend each tier&apos;s trailing-12-month linear trend {projection.horizonMonths} months
        past the last published month: luxury {fmt(projection.luxuryLatest)} → {fmt(projection.luxuryEnd)}, starter{" "}
        {fmt(projection.starterLatest)} → {fmt(projection.starterEnd)}. Falsifier: two consecutive months of slope
        reversal in either tier&apos;s published series breaks this projection.
      </p>
      <p className="mt-2 text-xs text-gray-500 font-mono">
        {asOf ? `as of ${formatAsOf(asOf)} · ` : ""}Zillow Home Value Index (ZHVI), price-tier cuts
      </p>
    </div>
  );
}
```

Implementer notes: verify `buildProjectionPath`'s import location and exact option names in the vendored `projection-utils.ts`/`projection-config.ts` (the docs show these options; the source is authority). If `ReferenceArea` requires registration context on `LineChart` (Task 5 Step 2), it's already handled by the same-pin shell.

- [ ] **Step 6: Swap the page panel**

Remove the `tier-gap` entry from the `panels` array (KEEP `loadTierIndexed`), export + render `TierProjectionChart` in its position with `{...tierIndexed}` props. The `tier-momentum` recharts panel stays untouched.

- [ ] **Step 7: Build + visual check + commit**

```bash
bunx next build && bunx next start
```

`/charts`: two solid indexed lines with dashed 6-month continuations inside a faint right-side band; the `[INFERENCE]` caption prints real base + projected values; tooltip works on the historical region.

```bash
git add lib/charts/tier-projection-series.ts lib/charts/tier-projection-series.test.ts components/charts/TierProjectionChart.tsx components/charts/index.ts app/charts/page.tsx
git commit -m "feat(charts): tier divergence panel gains a 6-month linear projection with [INFERENCE] framing"
```

---

### Task 12: Global Charts nav link (nice-to-have — bounded)

**Files:**
- Investigate first; likely Modify: whichever global header/nav component exists (`components/PageShell.tsx` has none today).

- [ ] **Step 1: Locate a global nav**

```bash
grep -rln "href=\"/reports\"\|href=\"/charts\"\|<nav" components app/layout.tsx app/page.tsx --include="*.tsx" | head
```

- [ ] **Step 2: Bounded decision**

If a shared header/nav component renders on every page: add `<Link href="/charts">Charts</Link>` styled like its siblings, build, commit, and close the check:

```bash
node scripts/check.mjs close charts_global_nav_link "Charts link added to the global nav (<component>)" --evidence "commit <sha>"
```

If NO global nav exists (the check has sat 26 days for a reason): do NOT build a nav system. Update the check instead:

```bash
node scripts/check.mjs update charts_global_nav_link --detail "07/10/2026: no global nav component exists to hang the link on (PageShell has none); needs a site-nav decision first — out of charts-glowup scope."
```

---

### Task 13: Final verification + ledger + handoff to operator

- [ ] **Step 1: Full gates**

```bash
bun test lib/charts lib/build-chart-for-intent.test.mts
bunx next build
grep -rn "FIXTURE_ASOF\|SWFL fixture sample" lib components app --include="*.ts" --include="*.tsx" --include="*.mts"
```

Expected: tests green, build green, zero production fixture-stamp hits.

- [ ] **Step 2: Visual pass** (`bunx next start`, `/charts`): gauge, heatmap, P/L multiples, projection panel all render live data; every caption shows one MM/DD/YYYY as-of + a named source; kill one loader locally (rename its view string) to confirm the panel hides instead of rendering sample data, then restore.

- [ ] **Step 3: Close what's provable now**

```bash
node scripts/check.mjs close charts_vacancy_asof_fabricated "Rent bar + scatter now read live corridor_profiles with real metrics_verified_date vintage; FIXTURE_ASOF/'SWFL fixture sample' removed from all production paths (vacancy had been fixed earlier via cre-swfl detail table)" --evidence "grep clean + bun test lib/build-chart-for-intent.test.mts green, commit <sha>"
node scripts/check.mjs close bklit_charts_evaluation "ADOPT: Gauge, Heatmap, Profit/Loss Line, Projection Line, Reference Area (all vendored at d7cd5827, live on /charts). PASS for now (no blocker, no consuming panel yet): Pie, Sankey, Radar, Scatter, Candlestick, Choropleth, Sunburst, Live Line, Funnel, Brush (Brush also conflicts with projections upstream)." --evidence "components/charts/vendor/bklit/NOTICE.md 2026-07-10 entries"
```

`charts_glowup_live_verify` STAYS OPEN — it closes only against the live URL after deploy. Add the save-button deferral to it:

```bash
node scripts/check.mjs update charts_glowup_live_verify --detail "Post-deploy: verify all 4 new panels on https://www.swfldatagulf.com/charts. DEFERRED in-build: AddChartToProject on the new panels (save-gallery registry has no gauge/heatmap/P-L frames — belongs with chart_social_object work)."
```

- [ ] **Step 4: SESSION_LOG entry** (top of file: what shipped, spec/plan paths, checks closed/updated, next = deploy + live verify).

- [ ] **Step 5: STOP — ask the operator to approve the push** (`node scripts/safe-push.mjs` only after explicit approval; never push autonomously).

---

## Self-Review (done at plan-writing)

- **Spec coverage:** vendoring (Tasks 2–5), four panels (8–11), fabrication kill (6), heatmap source view (7), deps (1), nav nice-to-have (12), verification + check hygiene (13). Save-button deferral recorded in 13. ✓
- **Placeholders:** none — every step carries code or an exact command. Two spots deliberately instruct source-verification at execution time (`colorScale` prop name, `buildProjectionPath` export site) because the source is authority over docs; both name the exact file to check. ✓
- **Type consistency:** `MarketTempGaugeData`/`ZipHeatmapData`/`TierProjection`/`CorridorProfileRow` names match across mapper, component, loader, and test blocks. `formatAsOfDate` (new, ISO date) vs `formatAsOf` (existing, "YYYY-MM") used per their input shapes. ✓

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3, Task 4, Task 5 | `components/charts/vendor/bklit/NOTICE.md` |
| 🟡 | Task 8, Task 9, Task 10, Task 11 | `app/charts/page.tsx` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
