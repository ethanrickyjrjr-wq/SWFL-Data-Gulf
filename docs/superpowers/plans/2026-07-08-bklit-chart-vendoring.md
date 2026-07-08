# Vendor bklit-ui charts (live-line, pie, sankey) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 7 tasks, 33 files, keywords: architecture

**Goal:** Vendor 3 bklit-ui chart primitives (live-line, animated pie, sankey) into `components/charts/vendor/bklit/` as composable building blocks, wire them into `CHART_REGISTRY` as 3 new frames, and extend the brand-theme injection so any of them re-colors from `ChartTheme.primary`/`.accent`.

**Architecture:** Verbatim-vendor the upstream source (pinned to one commit SHA, MIT-licensed, zero code changes needed — confirmed every target file already takes data as props, no baked-in mock generators to strip) into a flat `vendor/bklit/` directory that mirrors upstream's own relative-import structure. A single barrel (`vendor/bklit/index.ts`) re-exports every primitive — chart shells (`LiveLineChart`, `PieChart`, `SankeyChart`) AND their sub-parts (`LiveLine`, `PieSlice`, `SankeyNode`, `SankeyLink`, tooltip/axis pieces) — so future ad-hoc chart composition doesn't require another vendoring pass. Three thin `ChartSpec → props` adapter components in `components/charts/registry/frames/` are the only new logic we write; they're what's registered in `CHART_REGISTRY`.

**Tech Stack:** React 19, visx 4.0.1-alpha.0 (`@visx/curve|scale|shape|responsive|event|group|gradient|pattern|sankey`), `motion` (already installed), `d3-array`/`d3-shape`/`d3-sankey` + their `@types/*`, `@number-flow/react`. Tests via `bun:test` (matches every existing file in `components/charts/registry/frames/`).

## Global Constraints

- Source: `https://github.com/bklit/bklit-ui`, pinned to commit `d7cd58276de167c10fdd6c6bf44351a6459c11b4` (verified via `gh api repos/bklit/bklit-ui/commits/main` on 2026-07-08) — every fetch command below uses this exact SHA, not `main`, so a re-run is reproducible.
- MIT license only (`packages/ui`) — never touch/vendor anything from Studio (`packages/studio`, proprietary per `LICENSE-STUDIO.md`).
- Every vendored file imports `cn` from `@/lib/utils` already (confirmed by reading the actual source — upstream already targets that exact path alias, zero import rewiring needed). Do **not** add `clsx`/`tailwind-merge` — our `lib/utils.ts` already documents why it doesn't have them.
- `@visx/*` deps pinned to `4.0.1-alpha.0` exactly (verified React-19-compatible via live `npm view <pkg>@4.0.1-alpha.0 peerDependencies` on 2026-07-08 — all report `react: '^16.14.0 || ^17.0.0-0 || ^18.0.0-0 || ^19.0.0-0'`).
- Nothing in `CHART_REGISTRY`, `FrameRenderer.tsx`'s existing `--chart-primary`/`--chart-accent` injection, or any existing frame file changes shape — this is additive only.
- `bunx next build` clean at the end (project convention — never `npx tsc`).

---

## Task 1: Vendor scaffold — directory, license, dependencies

**Files:**
- Create: `components/charts/vendor/bklit/LICENSE`
- Create: `components/charts/vendor/bklit/NOTICE.md`
- Modify: `package.json`

**Interfaces:**
- Produces: the `components/charts/vendor/bklit/` directory that Tasks 2–5 populate.

- [ ] **Step 1: Fetch and write the upstream MIT license verbatim**

Run:
```bash
gh api "repos/bklit/bklit-ui/contents/LICENSE?ref=d7cd58276de167c10fdd6c6bf44351a6459c11b4" -q '.content' | base64 --decode > components/charts/vendor/bklit/LICENSE
```
Expected: file created, starts with `MIT License`.

- [ ] **Step 2: Write the attribution notice**

Create `components/charts/vendor/bklit/NOTICE.md`:

```markdown
# Vendored from bklit-ui

Source: https://github.com/bklit/bklit-ui
Commit: d7cd58276de167c10fdd6c6bf44351a6459c11b4
License: MIT (see `LICENSE` in this directory — copied from `packages/ui/../../LICENSE` at the pinned commit)

Files under this directory are adapted from `packages/ui/src/charts/**` in the
upstream repo. Adapted = re-exported through `index.ts` and consumed by
`components/charts/registry/frames/{LiveLineFrame,AnimatedPieFrame,SankeyFrame}.tsx`.
No source edits were needed — every vendored component already takes data via
props (no bundled mock-data generators), and already imports `cn` from
`@/lib/utils` (a path alias, not the `@bklit/utils` package) so it works
against this repo's own `cn()` unmodified.

Not vendored: `packages/studio` (proprietary, see upstream `LICENSE-STUDIO.md`),
the other 11 bklit chart types, and every `registry/examples/*` demo file.
```

- [ ] **Step 3: Add the new dependencies**

Run:
```bash
bun add @visx/curve@4.0.1-alpha.0 @visx/scale@4.0.1-alpha.0 @visx/shape@4.0.1-alpha.0 @visx/responsive@4.0.1-alpha.0 @visx/event@4.0.1-alpha.0 @visx/group@4.0.1-alpha.0 @visx/gradient@4.0.1-alpha.0 @visx/pattern@4.0.1-alpha.0 @visx/sankey@4.0.1-alpha.0 d3-array d3-shape d3-sankey @number-flow/react
bun add -d @types/d3-array @types/d3-shape @types/d3-sankey
```
Expected: `package.json` and `bun.lock` both updated; no peer-dep warnings for React 19.

- [ ] **Step 4: Verify install**

Run: `bun run bunx next build 2>&1 | tail -20` — actually just run `bun install --frozen-lockfile` to confirm the lockfile is consistent:
```bash
bun install --frozen-lockfile
```
Expected: exits 0, no "lockfile not up to date" error.

- [ ] **Step 5: Commit**

```bash
git add components/charts/vendor/bklit/LICENSE components/charts/vendor/bklit/NOTICE.md package.json bun.lock
git commit -m "chore: scaffold bklit-ui chart vendoring (license, notice, deps)"
```

---

## Task 2: Vendor shared chart infrastructure (verbatim)

**Files:**
- Create: 23 files directly under `components/charts/vendor/bklit/` (listed below)
- Create: 7 files under `components/charts/vendor/bklit/tooltip/`

**Interfaces:**
- Produces: `ChartProvider`, `useChart`, `useChartStable`, `chartCssVars`, `DEFAULT_CHART_LIFECYCLE`, `ChartTooltip`, `useChartConfig`, and every other shared symbol Tasks 3–5's chart files import.

These are 100% verbatim copies — read during planning, confirmed self-contained (no imports outside this file set, `motion/react`, `@visx/*`, `d3-array`, or React). No edits.

- [ ] **Step 1: Fetch the flat shared-infra files**

Run (all at pinned SHA `d7cd58276de167c10fdd6c6bf44351a6459c11b4`):
```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
DEST=components/charts/vendor/bklit
mkdir -p "$DEST/tooltip"
for f in chart-context.tsx reference-area-config.ts use-chart-interaction.ts y-axis-scales.ts y-axis-ticks.ts chart-phase.ts y-domain-utils.ts filter-data-by-x-domain.ts generate-chart-skeleton-data.ts use-animated-y-domains.ts use-chart-phase-orchestrator.ts line-loading-timing.ts animation.ts motion-utils.ts use-mount-progress.ts use-enter-complete.ts chart-reveal-clip.tsx static-chart-preview-context.tsx chart-defs.ts chart-config-context.tsx indicator-fade.ts chart-formatters.ts decimate-time-series.ts use-scheduled-tooltip.ts; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/$f?ref=$SHA" -q '.content' | base64 --decode > "$DEST/$f"
  echo "wrote $DEST/$f"
done
```
Expected: 23 "wrote ..." lines, no errors, each file non-empty (`wc -l "$DEST"/*.ts "$DEST"/*.tsx` shows no 0-line file).

- [ ] **Step 2: Fetch the tooltip sub-directory**

```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
DEST=components/charts/vendor/bklit/tooltip
for f in chart-tooltip.tsx tooltip-box.tsx tooltip-content.tsx tooltip-dot.tsx tooltip-indicator.tsx date-ticker.tsx index.ts; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/tooltip/$f?ref=$SHA" -q '.content' | base64 --decode > "$DEST/$f"
  echo "wrote $DEST/$f"
done
```
Expected: 7 "wrote ..." lines.

- [ ] **Step 3: Typecheck the vendored infra in isolation**

Run: `bunx tsc --noEmit -p tsconfig.json 2>&1 | grep "vendor/bklit" | head -50`
Expected: no output (no errors referencing `vendor/bklit` paths). Errors elsewhere in the codebase unrelated to this change are pre-existing — ignore them, but if this command prints ANY line containing `vendor/bklit`, stop and fix before continuing (a fetch likely mismatched a relative import).

- [ ] **Step 4: Commit**

```bash
git add components/charts/vendor/bklit
git commit -m "chore: vendor shared bklit-ui chart context/tooltip/animation infra"
```

---

## Task 3: Theme bridge — brand palette to bklit CSS vars

**Files:**
- Create: `components/charts/registry/bklit-theme.ts`
- Create: `components/charts/registry/bklit-theme.test.ts`
- Modify: `components/charts/registry/chart-spec.ts:20-31` (add `usesBklitTheme?: boolean` to `FrameDef` — actually this field lives on `FrameDef` in `registry.ts`, not `chart-spec.ts`; see Task 6)

**Interfaces:**
- Consumes: `ChartTheme` (`primary?: string; accent?: string; logoUrl?: string`) from `components/charts/registry/chart-spec.ts`.
- Produces: `toBklitChartVars(theme: ChartTheme | undefined): React.CSSProperties` — used by `FrameRenderer.tsx` in Task 6, and directly by tests here.

This is the "shell Claude fills with brand colors" mechanism. Confirmed upstream reads a fixed set of CSS custom properties (`packages/ui/registry.json`'s `chart-context` item `cssVars.light`) — we always emit the **complete** set (not a sparse override) since nothing else in this repo defines bklit's non-brand defaults (background/grid/label/etc.) anywhere; relying on a partial override + missing global CSS would leave those vars unset.

- [ ] **Step 1: Write the failing test**

Create `components/charts/registry/bklit-theme.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { toBklitChartVars } from "./bklit-theme";

describe("toBklitChartVars", () => {
  it("returns bklit's literal light-mode defaults when no theme is given", () => {
    const vars = toBklitChartVars(undefined);
    expect(vars["--chart-background"]).toBe("oklch(1 0 0)");
    expect(vars["--chart-1"]).toBe("oklch(0.32 0 none)");
    expect(vars["--chart-line-primary"]).toBe("var(--chart-1)");
  });

  it("bookends the 5-slice ramp with primary and accent", () => {
    const vars = toBklitChartVars({ primary: "#0ea5e9", accent: "#f97316" });
    expect(vars["--chart-1"]).toBe("#0ea5e9");
    expect(vars["--chart-5"]).toBe("#f97316");
    expect(vars["--chart-2"]).toBe(
      "color-mix(in oklch, #0ea5e9 75%, #f97316 25%)"
    );
    expect(vars["--chart-3"]).toBe(
      "color-mix(in oklch, #0ea5e9 50%, #f97316 50%)"
    );
    expect(vars["--chart-4"]).toBe(
      "color-mix(in oklch, #0ea5e9 75%, #f97316 25%)".replace("75%", "25%").replace("25%", "75%")
    );
  });

  it("falls back to primary-only when accent is missing (monochrome ramp)", () => {
    const vars = toBklitChartVars({ primary: "#0ea5e9" });
    expect(vars["--chart-1"]).toBe("#0ea5e9");
    expect(vars["--chart-5"]).toBe("#0ea5e9");
  });

  it("sets crosshair and line-secondary from the ramp", () => {
    const vars = toBklitChartVars({ primary: "#0ea5e9", accent: "#f97316" });
    expect(vars["--chart-crosshair"]).toBe("#f97316");
    expect(vars["--chart-line-secondary"]).toBe("var(--chart-2)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test components/charts/registry/bklit-theme.test.ts`
Expected: FAIL — `Cannot find module './bklit-theme'`.

- [ ] **Step 3: Write the implementation**

Create `components/charts/registry/bklit-theme.ts`:

```typescript
import type { CSSProperties } from "react";
import type { ChartTheme } from "./chart-spec";

/**
 * bklit-ui's charts read a fixed CSS-custom-property contract (confirmed from
 * upstream's `packages/ui/registry.json` `chart-context` item, `cssVars.light`).
 * We always emit the full set — nothing else in this repo defines bklit's
 * non-brand defaults, so a sparse override would leave them unset.
 */
const LIGHT_DEFAULTS: Record<string, string> = {
  "--chart-background": "oklch(1 0 0)",
  "--chart-foreground": "oklch(0.145 0.004 285)",
  "--chart-foreground-muted": "oklch(0.55 0.014 260)",
  "--chart-grid": "oklch(0.9 0 0)",
  "--chart-brush-border": "oklch(0.9 0 0)",
  "--chart-tooltip-background": "oklch(0.21 0.006 285 / 0.8)",
  "--chart-tooltip-foreground": "oklch(0.985 0 0)",
  "--chart-tooltip-muted": "oklch(0.65 0.01 260)",
  "--chart-marker-background": "oklch(0.97 0.005 260)",
  "--chart-marker-border": "oklch(0.85 0.01 260)",
  "--chart-marker-foreground": "oklch(0.3 0.01 260)",
  "--chart-label": "oklch(0.45 0.01 260)",
  "--chart-scale-01": "oklch(0.98 0.003 106)",
  "--chart-scale-02": "oklch(0.92 0.008 106)",
  "--chart-scale-03": "oklch(0.82 0.015 106)",
  "--chart-scale-04": "oklch(0.68 0.02 106)",
  "--chart-scale-05": "oklch(0.55 0.025 106)",
  "--chart-scale-pattern-color": "oklch(0.96 0.005 106)",
};

const DEFAULT_1 = "oklch(0.32 0 none)";
const DEFAULT_5 = "oklch(0.89 0 none)";
const DEFAULT_CROSSHAIR = "oklch(0.4 0.1828 274.34)";

/** `color-mix(in oklch, …)` step between primary and accent — perceptually
 * smooth (same color space bklit's own default ramp uses), no manual OKLCH
 * conversion needed. */
function mix(a: string, b: string, aPercent: number): string {
  return `color-mix(in oklch, ${a} ${aPercent}%, ${b} ${100 - aPercent}%)`;
}

/** Brand theme -> the full bklit chart CSS-variable set. Never invents a
 * color: falls back to bklit's own literal light-mode defaults when no
 * theme (or only one of primary/accent) is given. */
export function toBklitChartVars(theme: ChartTheme | undefined): CSSProperties {
  const primary = theme?.primary ?? theme?.accent ?? DEFAULT_1;
  const accent = theme?.accent ?? theme?.primary ?? DEFAULT_5;

  return {
    ...LIGHT_DEFAULTS,
    "--chart-1": primary,
    "--chart-2": mix(primary, accent, 75),
    "--chart-3": mix(primary, accent, 50),
    "--chart-4": mix(primary, accent, 25),
    "--chart-5": accent,
    "--chart-line-primary": "var(--chart-1)",
    "--chart-line-secondary": "var(--chart-2)",
    "--chart-crosshair": theme?.accent ?? theme?.primary ?? DEFAULT_CROSSHAIR,
  } as CSSProperties;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test components/charts/registry/bklit-theme.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/charts/registry/bklit-theme.ts components/charts/registry/bklit-theme.test.ts
git commit -m "feat: brand-theme to bklit chart CSS-var bridge"
```

---

## Task 4: Live-line frame

**Files:**
- Create: `components/charts/vendor/bklit/live-line-chart.tsx`
- Create: `components/charts/vendor/bklit/live-line.tsx`
- Create: `components/charts/vendor/bklit/live-x-axis.tsx`
- Create: `components/charts/vendor/bklit/live-y-axis.tsx`
- Create: `components/charts/vendor/bklit/chart-child-passthrough.ts`
- Create: `components/charts/registry/frames/LiveLineFrame.tsx`
- Create: `components/charts/registry/frames/LiveLineFrame.test.ts`
- 🔴 Modify: `components/charts/registry/registry.ts`

**Interfaces:**
- Consumes: `ChartSpec`, `FrameDef` from `chart-spec.ts`/`registry.ts`; `toBklitChartVars` is NOT called here — theme injection happens once, centrally, in `FrameRenderer.tsx` (Task 6).
- Produces: `LiveLineFrame` component, registered as `CHART_REGISTRY["live-line"]`.

Data contract (this frame is the only place that reads it):
`spec.options.data: { date: string; [seriesKey: string]: string | number }[]`, `spec.options.seriesKey?: string` (default `"value"`).

- [ ] **Step 1: Fetch the live-line source files verbatim**

```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
DEST=components/charts/vendor/bklit
for f in live-line-chart.tsx live-line.tsx live-x-axis.tsx live-y-axis.tsx chart-child-passthrough.ts; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/$f?ref=$SHA" -q '.content' | base64 --decode > "$DEST/$f"
  echo "wrote $DEST/$f"
done
```
Expected: 5 "wrote ..." lines.

- [ ] **Step 2: Write the failing frame test**

Create `components/charts/registry/frames/LiveLineFrame.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { toLiveLinePoints } from "./LiveLineFrame";

describe("toLiveLinePoints", () => {
  it("returns [] for undefined data", () => {
    expect(toLiveLinePoints(undefined, "value")).toEqual([]);
  });

  it("maps date+seriesKey rows to {time, value} in unix seconds", () => {
    const rows = [
      { date: "2026-01-01T00:00:00.000Z", value: 10 },
      { date: "2026-01-02T00:00:00.000Z", value: 20 },
    ];
    const points = toLiveLinePoints(rows, "value");
    expect(points).toEqual([
      { time: Date.parse("2026-01-01T00:00:00.000Z") / 1000, value: 10 },
      { time: Date.parse("2026-01-02T00:00:00.000Z") / 1000, value: 20 },
    ]);
  });

  it("coerces a non-numeric series value to 0 rather than NaN", () => {
    const rows = [{ date: "2026-01-01T00:00:00.000Z", value: "n/a" }];
    const points = toLiveLinePoints(rows, "value");
    expect(points[0]?.value).toBe(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test components/charts/registry/frames/LiveLineFrame.test.ts`
Expected: FAIL — `Cannot find module './LiveLineFrame'`.

- [ ] **Step 4: Write the frame component**

Create `components/charts/registry/frames/LiveLineFrame.tsx`:

```tsx
"use client";

import { LiveLine } from "@/components/charts/vendor/bklit/live-line";
import { LiveLineChart } from "@/components/charts/vendor/bklit/live-line-chart";
import { LiveXAxis } from "@/components/charts/vendor/bklit/live-x-axis";
import { LiveYAxis } from "@/components/charts/vendor/bklit/live-y-axis";
import type { ChartSpec } from "../chart-spec";

export interface LiveLineRow {
  date: string;
  [seriesKey: string]: string | number;
}

export interface LiveLinePoint {
  time: number;
  value: number;
}

/** `options.data` -> the vendored component's `{time, value}[]` shape. The
 * only place this frame reads/reshapes `options.data` (project convention). */
export function toLiveLinePoints(
  rows: LiveLineRow[] | undefined,
  seriesKey: string
): LiveLinePoint[] {
  if (!rows) return [];
  return rows.map((r) => ({
    time: Date.parse(r.date) / 1000,
    value: typeof r[seriesKey] === "number" ? (r[seriesKey] as number) : Number(r[seriesKey]) || 0,
  }));
}

export function LiveLineFrame({ spec }: { spec: ChartSpec }) {
  const seriesKey = (spec.options?.seriesKey as string | undefined) ?? "value";
  const points = toLiveLinePoints(spec.options?.data as LiveLineRow[] | undefined, seriesKey);

  if (points.length === 0) return null;

  const latest = points.at(-1)?.value ?? 0;

  return (
    <LiveLineChart data={points} dataKey={seriesKey} value={latest}>
      <LiveLine dataKey={seriesKey} />
      <LiveXAxis />
      <LiveYAxis />
    </LiveLineChart>
  );
}

export default LiveLineFrame;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test components/charts/registry/frames/LiveLineFrame.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Register the frame**

Modify `components/charts/registry/registry.ts` — add the import near the other frame imports (after the `LineBandFrame` import):

```typescript
import { LiveLineFrame } from "./frames/LiveLineFrame";
```

Add the registry entry inside `CHART_REGISTRY` (after the `"z-gauge"` entry, matching existing style):

```typescript
  "live-line": {
    component: LiveLineFrame,
    accepts: ["time-series"],
    label: "Live Line (animated)",
    usesBklitTheme: true,
  },
```

(`usesBklitTheme` is added to `FrameDef` in Task 6 — if Task 6 hasn't run yet, this line will fail typecheck; Task 6 must land in the same PR before merge, but the plan sequences it last on purpose so Tasks 4/5 can each be reviewed independently before the final wiring step.)

- [ ] **Step 7: Commit**

```bash
git add components/charts/vendor/bklit/live-line-chart.tsx components/charts/vendor/bklit/live-line.tsx components/charts/vendor/bklit/live-x-axis.tsx components/charts/vendor/bklit/live-y-axis.tsx components/charts/vendor/bklit/chart-child-passthrough.ts components/charts/registry/frames/LiveLineFrame.tsx components/charts/registry/frames/LiveLineFrame.test.ts components/charts/registry/registry.ts
git commit -m "feat: vendor bklit live-line chart as a new registry frame"
```

---

## Task 5: Animated pie frame

**Files:**
- Create: `components/charts/vendor/bklit/pie-chart.tsx`
- Create: `components/charts/vendor/bklit/pie-context.tsx`
- Create: `components/charts/vendor/bklit/pie-slice.tsx`
- Create: `components/charts/vendor/bklit/chart-stat-flow.tsx`
- Create: `components/charts/vendor/bklit/pie-center-shell.tsx`
- Create: `components/charts/vendor/bklit/pie-center.tsx`
- Create: `components/charts/vendor/bklit/chart-center-typography.ts`
- Create: `components/charts/registry/frames/AnimatedPieFrame.tsx`
- Create: `components/charts/registry/frames/AnimatedPieFrame.test.ts`
- 🔴 Modify: `components/charts/registry/registry.ts`

**Interfaces:**
- Data contract: `spec.options.data: { label: string; value: number; color?: string }[]`.
- Produces: `AnimatedPieFrame`, registered as `CHART_REGISTRY["pie-animated"]`.

- [ ] **Step 1: Fetch the pie source files verbatim**

```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
DEST=components/charts/vendor/bklit
for f in pie-chart.tsx pie-context.tsx pie-slice.tsx chart-stat-flow.tsx pie-center-shell.tsx pie-center.tsx chart-center-typography.ts; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/$f?ref=$SHA" -q '.content' | base64 --decode > "$DEST/$f"
  echo "wrote $DEST/$f"
done
```
Expected: 7 "wrote ..." lines.

- [ ] **Step 2: Write the failing frame test**

Create `components/charts/registry/frames/AnimatedPieFrame.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { toPieData } from "./AnimatedPieFrame";

describe("toPieData", () => {
  it("returns [] for undefined data", () => {
    expect(toPieData(undefined)).toEqual([]);
  });

  it("passes through label/value/color", () => {
    const rows = [
      { label: "SFR", value: 62 },
      { label: "Condo", value: 38, color: "#f97316" },
    ];
    expect(toPieData(rows)).toEqual([
      { label: "SFR", value: 62, color: undefined },
      { label: "Condo", value: 38, color: "#f97316" },
    ]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test components/charts/registry/frames/AnimatedPieFrame.test.ts`
Expected: FAIL — `Cannot find module './AnimatedPieFrame'`.

- [ ] **Step 4: Write the frame component**

Create `components/charts/registry/frames/AnimatedPieFrame.tsx`:

```tsx
"use client";

import { PieChart } from "@/components/charts/vendor/bklit/pie-chart";
import type { PieData } from "@/components/charts/vendor/bklit/pie-context";
import { PieSlice } from "@/components/charts/vendor/bklit/pie-slice";
import type { ChartSpec } from "../chart-spec";

export interface PieRow {
  label: string;
  value: number;
  color?: string;
}

/** `options.data` -> the vendored component's `PieData[]` shape. The only
 * place this frame reads/reshapes `options.data` (project convention). */
export function toPieData(rows: PieRow[] | undefined): PieData[] {
  if (!rows) return [];
  return rows.map((r) => ({ label: r.label, value: r.value, color: r.color }));
}

export function AnimatedPieFrame({ spec }: { spec: ChartSpec }) {
  const data = toPieData(spec.options?.data as PieRow[] | undefined);

  if (data.length === 0) return null;

  return (
    <PieChart data={data} innerRadius={60}>
      {data.map((d, index) => (
        <PieSlice index={index} key={d.label} />
      ))}
    </PieChart>
  );
}

export default AnimatedPieFrame;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test components/charts/registry/frames/AnimatedPieFrame.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Register the frame**

Modify `components/charts/registry/registry.ts` — add the import:

```typescript
import { AnimatedPieFrame } from "./frames/AnimatedPieFrame";
```

Add the registry entry:

```typescript
  "pie-animated": {
    component: AnimatedPieFrame,
    accepts: ["composition"],
    label: "Pie (animated)",
    usesBklitTheme: true,
  },
```

- [ ] **Step 7: Commit**

```bash
git add components/charts/vendor/bklit/pie-chart.tsx components/charts/vendor/bklit/pie-context.tsx components/charts/vendor/bklit/pie-slice.tsx components/charts/vendor/bklit/chart-stat-flow.tsx components/charts/vendor/bklit/pie-center-shell.tsx components/charts/vendor/bklit/pie-center.tsx components/charts/vendor/bklit/chart-center-typography.ts components/charts/registry/frames/AnimatedPieFrame.tsx components/charts/registry/frames/AnimatedPieFrame.test.ts components/charts/registry/registry.ts
git commit -m "feat: vendor bklit animated pie chart as a new registry frame"
```

---

## Task 6: Sankey frame + barrel export + theme wiring in FrameRenderer

**Files:**
- Create: `components/charts/vendor/bklit/sankey/sankey-chart.tsx`
- Create: `components/charts/vendor/bklit/sankey/sankey-context.tsx`
- Create: `components/charts/vendor/bklit/sankey/sankey-node.tsx`
- Create: `components/charts/vendor/bklit/sankey/sankey-link.tsx`
- Create: `components/charts/vendor/bklit/sankey/sankey-tooltip.tsx`
- Create: `components/charts/vendor/bklit/sankey/index.ts`
- Create: `components/charts/vendor/bklit/index.ts` (barrel — "build whatever on the fly")
- Create: `components/charts/registry/frames/SankeyFrame.tsx`
- Create: `components/charts/registry/frames/SankeyFrame.test.ts`
- 🔴 Modify: `components/charts/registry/registry.ts` (`FrameDef` interface + new entry)
- Modify: `components/charts/registry/FrameRenderer.tsx`

**Interfaces:**
- Data contract: `spec.options.data: { nodes: {id: string; label: string}[]; links: {source: string; target: string; value: number}[] }` — note upstream's own `SankeyLinkDatum.source`/`.target` are **numeric node-array indices**, not strings, so this frame's `toSankeyData` maps our string `id`s to indices.
- Produces: `SankeyFrame`, registered as `CHART_REGISTRY["sankey"]`; `FrameDef.usesBklitTheme?: boolean`; `FrameRenderer` merges `toBklitChartVars(spec.theme)` for any frame with that flag set.

- [ ] **Step 1: Fetch the sankey source files verbatim (subdirectory)**

```bash
SHA=d7cd58276de167c10fdd6c6bf44351a6459c11b4
DEST=components/charts/vendor/bklit/sankey
mkdir -p "$DEST"
for f in sankey-chart.tsx sankey-context.tsx sankey-node.tsx sankey-link.tsx sankey-tooltip.tsx index.ts; do
  gh api "repos/bklit/bklit-ui/contents/packages/ui/src/charts/sankey/$f?ref=$SHA" -q '.content' | base64 --decode > "$DEST/$f"
  echo "wrote $DEST/$f"
done
```
Expected: 6 "wrote ..." lines.

- [ ] **Step 2: Write the barrel export**

Create `components/charts/vendor/bklit/index.ts` — every composable primitive vendored across Tasks 2–6, re-exported from one place so future ad-hoc chart composition (a new frame, a Storybook story, an experiment) doesn't need to know the internal file layout:

```typescript
// Barrel for every bklit-ui primitive vendored into this repo. Import from
// here (not individual files) when composing a NEW chart on the fly — the
// three registered frames (LiveLineFrame, AnimatedPieFrame, SankeyFrame) are
// just one assembly of these; nothing stops a different assembly later.

export { LiveLineChart } from "./live-line-chart";
export type { LiveLineChartProps, LiveLinePoint } from "./live-line-chart";
export { LiveLine, detectMomentum } from "./live-line";
export type { LiveLineProps, Momentum, MomentumColors } from "./live-line";
export { LiveXAxis } from "./live-x-axis";
export type { LiveXAxisProps } from "./live-x-axis";
export { LiveYAxis } from "./live-y-axis";
export type { LiveYAxisProps } from "./live-y-axis";

export { PieChart } from "./pie-chart";
export type { PieChartProps } from "./pie-chart";
export { PieSlice } from "./pie-slice";
export type { PieSliceProps, PieSliceHoverEffect } from "./pie-slice";
export { PieCenterShell } from "./pie-center-shell";
export type { PieCenterShellProps } from "./pie-center-shell";
export { PieProvider, usePie, usePieStable, usePieHover, defaultPieColors, pieCssVars } from "./pie-context";
export type { PieData, PieArcData, PieContextValue } from "./pie-context";

export {
  SankeyChart,
  SankeyNode,
  SankeyLink,
  SankeyTooltip,
  SankeyProvider,
  useSankey,
  sankeyCssVars,
} from "./sankey";
export type {
  SankeyChartProps,
  SankeyData,
  SankeyNodeDatum,
  SankeyLinkDatum,
  SankeyContextValue,
} from "./sankey";

export { ChartProvider, useChart, useChartStable, useChartHover, chartCssVars, defaultScatterColors } from "./chart-context";
export type { ChartContextValue, ChartTheme as BklitInternalChartTheme, Margin, LineConfig, TooltipData } from "./chart-context";
export { ChartTooltip, TooltipDot, TooltipIndicator } from "./tooltip";
export type { TooltipRow } from "./tooltip";
```

(If any named export above doesn't exist verbatim in the vendored files — e.g. `chartCssVars` casing — fix the barrel to match what Task 2's `chart-context.tsx` actually exports; the typecheck in Step 5 catches any mismatch.)

- [ ] **Step 3: Write the failing frame test**

Create `components/charts/registry/frames/SankeyFrame.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { toSankeyData } from "./SankeyFrame";

describe("toSankeyData", () => {
  it("returns null for undefined data", () => {
    expect(toSankeyData(undefined)).toBeNull();
  });

  it("maps string node ids to array indices for links", () => {
    const raw = {
      nodes: [
        { id: "visitors", label: "Visitors" },
        { id: "leads", label: "Leads" },
        { id: "clients", label: "Clients" },
      ],
      links: [
        { source: "visitors", target: "leads", value: 100 },
        { source: "leads", target: "clients", value: 20 },
      ],
    };
    const result = toSankeyData(raw);
    expect(result?.nodes).toEqual([
      { name: "Visitors" },
      { name: "Leads" },
      { name: "Clients" },
    ]);
    expect(result?.links).toEqual([
      { source: 0, target: 1, value: 100 },
      { source: 1, target: 2, value: 20 },
    ]);
  });

  it("drops links referencing an unknown node id", () => {
    const raw = {
      nodes: [{ id: "a", label: "A" }],
      links: [{ source: "a", target: "ghost", value: 5 }],
    };
    expect(toSankeyData(raw)?.links).toEqual([]);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test components/charts/registry/frames/SankeyFrame.test.ts`
Expected: FAIL — `Cannot find module './SankeyFrame'`.

- [ ] **Step 5: Write the frame component**

Create `components/charts/registry/frames/SankeyFrame.tsx`:

```tsx
"use client";

import { SankeyChart, SankeyLink, SankeyNode } from "@/components/charts/vendor/bklit/sankey";
import type { SankeyData } from "@/components/charts/vendor/bklit/sankey";
import type { ChartSpec } from "../chart-spec";

export interface SankeyRawNode {
  id: string;
  label: string;
}

export interface SankeyRawLink {
  source: string;
  target: string;
  value: number;
}

export interface SankeyRawData {
  nodes: SankeyRawNode[];
  links: SankeyRawLink[];
}

/** `options.data` -> upstream's `SankeyData` shape. Upstream's own
 * `SankeyLinkDatum.source`/`.target` are numeric node-array indices (confirmed
 * from `sankey-context.tsx`), so string ids from our data are mapped to
 * indices here. Links referencing an unknown id are dropped rather than
 * thrown — the only place this frame reads/reshapes `options.data`. */
export function toSankeyData(raw: SankeyRawData | undefined): SankeyData | null {
  if (!raw || raw.nodes.length === 0) return null;

  const indexById = new Map(raw.nodes.map((n, i) => [n.id, i]));

  return {
    nodes: raw.nodes.map((n) => ({ name: n.label })),
    links: raw.links
      .map((l) => ({
        source: indexById.get(l.source),
        target: indexById.get(l.target),
        value: l.value,
      }))
      .filter(
        (l): l is { source: number; target: number; value: number } =>
          l.source !== undefined && l.target !== undefined
      ),
  };
}

export function SankeyFrame({ spec }: { spec: ChartSpec }) {
  const data = toSankeyData(spec.options?.data as SankeyRawData | undefined);

  if (!data) return null;

  return (
    <SankeyChart data={data}>
      <SankeyLink />
      <SankeyNode />
    </SankeyChart>
  );
}

export default SankeyFrame;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test components/charts/registry/frames/SankeyFrame.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 7: Add `usesBklitTheme` to `FrameDef` and register the sankey entry**

Modify `components/charts/registry/registry.ts` — add the import:

```typescript
import { SankeyFrame } from "./frames/SankeyFrame";
```

Extend the `FrameDef` interface (add after the existing `fixtureOnly?: boolean;` field):

```typescript
  /**
   * This frame reads the full bklit-ui chart CSS-variable contract (not just
   * `--chart-primary`/`--chart-accent`) — `FrameRenderer` merges
   * `toBklitChartVars(spec.theme)` in addition to the existing 2-var
   * injection when this is `true`. Existing frames leave this unset/false and
   * are unaffected.
   */
  usesBklitTheme?: boolean;
```

Add the registry entry:

```typescript
  sankey: {
    component: SankeyFrame,
    accepts: ["composition"],
    label: "Sankey (flow)",
    usesBklitTheme: true,
  },
```

- [ ] **Step 8: Wire theme injection into `FrameRenderer.tsx`**

Modify `components/charts/registry/FrameRenderer.tsx`:

```typescript
"use client";

import { Component, type CSSProperties, type ReactNode } from "react";
import type { ChartSpec } from "./chart-spec";
import { getFrame } from "./registry";
import { ChartError } from "@/components/charts/ChartError";
import { toBklitChartVars } from "./bklit-theme";
```

Replace the `themeStyle` block:

```typescript
export function FrameRenderer({ spec }: { spec: ChartSpec }) {
  const frame = getFrame(spec.frameId);
  if (!frame) return null;
  const Frame = frame.component;

  // Inject brand theme as CSS custom properties so frame components can read
  // `var(--chart-primary)` / `var(--chart-accent)` without per-frame wiring.
  // Frames that read bklit-ui's fuller CSS-variable contract opt in via
  // `usesBklitTheme` and get that set merged in too.
  const themeStyle = spec.theme
    ? ({
        "--chart-primary": spec.theme.primary,
        "--chart-accent": spec.theme.accent,
        ...(frame.usesBklitTheme ? toBklitChartVars(spec.theme) : {}),
      } as CSSProperties)
    : frame.usesBklitTheme
      ? (toBklitChartVars(undefined) as CSSProperties)
      : undefined;

  return (
    <FrameBoundary>
      <div className="contents" style={themeStyle}>
        <Frame spec={spec} />
      </div>
    </FrameBoundary>
  );
}

export default FrameRenderer;
```

(The `frame.usesBklitTheme ? toBklitChartVars(undefined) : undefined` branch covers a `usesBklitTheme` frame rendered with no `spec.theme` at all — it still needs bklit's literal defaults, not `undefined`, or the chart renders with unset CSS vars.)

- [ ] **Step 9: Full typecheck + registry test**

Run:
```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "vendor/bklit|registry/(frames|FrameRenderer|bklit-theme)" 
bun test components/charts/registry
```
Expected: first command prints nothing; second command's existing `registry.test.ts` still passes plus the 3 new frame test files (all PASS).

- [ ] **Step 10: Commit**

```bash
git add components/charts/vendor/bklit/sankey components/charts/vendor/bklit/index.ts components/charts/registry/frames/SankeyFrame.tsx components/charts/registry/frames/SankeyFrame.test.ts components/charts/registry/registry.ts components/charts/registry/FrameRenderer.tsx
git commit -m "feat: vendor bklit sankey chart, add barrel export, wire brand theme into FrameRenderer"
```

---

## Task 7: Build verification

**Files:** none (verification only)

- [ ] **Step 1: Full project build**

Run: `bunx next build`
Expected: exits 0, no type errors, no lint errors referencing `components/charts/vendor/bklit` or the 3 new frames.

- [ ] **Step 2: Full test suite for the touched area**

Run: `bun test components/charts`
Expected: every test file passes, including the 4 new ones (`bklit-theme.test.ts`, `LiveLineFrame.test.ts`, `AnimatedPieFrame.test.ts`, `SankeyFrame.test.ts`) and every pre-existing one (unchanged pass count for those).

- [ ] **Step 3: Manual visual check**

Since `.storybook/` already exists in this repo, add (or reuse an existing fixture page) a quick manual render of all 3 new frames with 2 different `ChartSpec.theme` values (e.g. `{primary: "#0ea5e9", accent: "#f97316"}` and `{primary: "#7c3aed", accent: "#eab308"}`) to confirm the ramp actually re-colors and stays legible. This is a manual step, not an automated test — no code to write, just render + look.

- [ ] **Step 4: Close the live-verify check**

Run:
```bash
node scripts/check.mjs close bklit_chart_vendoring_live_verify
```
Expected: check closes (opened at the end of the brainstorming phase, `docs/superpowers/specs/2026-07-08-bklit-chart-vendoring-design.md`).

- [ ] **Step 5: Update SESSION_LOG.md and push**

Per CLAUDE.md RULE 0 / RULE 1 — append a SESSION_LOG entry describing what shipped (3 bklit-ui charts vendored + theme bridge), then:
```bash
node scripts/safe-push.mjs
```
(Only after the operator confirms the push — do not push unprompted.)

---

## Self-Review Notes

**Spec coverage:** Vendor directory + LICENSE/NOTICE (Task 1) ✓. All 3 chart types + shared infra (Tasks 2, 4, 5, 6) ✓. Theme bridge / OKLCH-space ramp (Task 3, refined to `color-mix(in oklch, …)` instead of hand-rolled JS conversion — simpler, same design intent, documented as a deliberate implementation choice) ✓. Data flow contracts explicit per frame ✓. License/attribution (Task 1) ✓. Non-goals from the spec (Studio, other 11 charts, no shadcn CLI) — respected, nothing in this plan touches them ✓. New addition beyond the original spec: the barrel export (Task 6, Step 2) — added in response to the operator's "make it so we can build whatever we want on the fly," so future composition doesn't require re-vendoring.

**Type consistency check:** `ChartSpec.options?.data` cast pattern matches `ZHVIAreaChartFrame`'s existing convention (per `chart-spec.ts` comment). `FrameDef.usesBklitTheme` name used consistently across Task 3's note, Task 4/5/6's registry entries, and Task 6's `FrameRenderer.tsx` edit. `toBklitChartVars` signature (`ChartTheme | undefined → CSSProperties`) matches its Task 3 definition and Task 6's two call sites.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 4, Task 5, Task 6 | `components/charts/registry/registry.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
