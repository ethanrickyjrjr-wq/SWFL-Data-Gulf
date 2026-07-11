# Chart Picker Parity (12/12 registry frames) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Recommended model:** 🧠 Opus — 9 tasks, 16 files, keywords: refactor, architecture

**Goal:** Every frame in `CHART_REGISTRY` (12 total) is selectable in the Email Lab chart-type picker and renders correctly in a sent email — 12/12, not today's 5/12.

**Architecture:** Phase A exposes two already-working renderers (`spark-grid`, `line-band`) in the picker — pure config change. Phase B builds 5 missing PNG renderers in increasing-effort order (B1 pure-SVG, B2 recharts-SSR-bridge, B3 ECharts-SSR, vendor-verified in-session first) and wires each one's `chartTypeFits` gate + picker option alongside its renderer, one frame at a time, never big-bang.

**Tech Stack:** Next.js/TypeScript, `bun:test`, hand-authored SVG-string builders (resvg-rasterized), `@react-email/render` SSR bridge for recharts, ECharts (verification pending).

## Global Constraints

- Every plotted number is REAL — reshaping only relabels values already in the `ChartSpec`; it never invents one (`lib/email/reshape-chart-type.ts` header MOAT comment).
- A renderer that can't be built honestly from the picker's flat-point data must NOT be faked — `chartTypeFits` must return `false` and the caller shows a plain-English "showed a bar instead" reason (`build-doc.ts:262-267`).
- One renderer, two surfaces, always — the same builder function (or the same recharts JSX) draws both the live web frame and the email PNG. Never fork a chart into two hand-authored versions (`dot-plot.ts` header, `render-static.tsx` header).
- Dates render `MM/DD/YYYY` via `formatDisplayDate`/`friendlyAsOf` — never the raw ISO/SWFL token.
- No blockquotes/tables in anything user-visible (N/A here — chart-only build, no prose surfaces).
- `chartTypeFits`'s existing top guard (`if (pts.length < 2) return false`) and `isTimeSeries`'s existing frameId regex (`/zhvi|area|line-band|seasonal|timeline/i`) are SHARED control flow used by the 5 existing types — do not change their behavior for those 5; only add to them.

## ⚠️ Open design decisions surfaced during planning (read before Task 3)

Two findings came out of reading the actual data flow (`lib/assistant/chart-for-question.ts` → `buildChartForQuestion`, the ONLY producer that feeds `reshapeChartToType`) rather than trusting the spec's prose description. Both change what "Phase B fit-gates" can honestly mean, and both should be visible to Ricky, not silently resolved:

1. **The spec's stated seasonal-radial gate ("needs a cyclical/monthly series... 12-ish periodic points") doesn't match the real data.** `SeasonalRadialChart` takes `SeasonalRadialEntry[]` = one `{corridor, seasonal_index}` reading **per corridor** (a cross-sectional snapshot), not a month-by-month trend for one corridor (confirmed by reading `components/charts/SeasonalRadialChart.tsx` and the registry's own comment: "cre-swfl now emits a `corridor_seasonality` detail_table, one row per corridor"). A "≈12 points" count gate would be backwards — it would reject the real live data whenever SWFL's corridor count isn't ~12, and it has nothing to do with the actual per-corridor shape. **Resolution used below:** treat this gate as pure passthrough (see #2), not a count heuristic. If Ricky wants a genuine "is this actually seasonal" gate later, that requires a different signal than point-count.

2. **`buildChartForQuestion` can only ever emit 4 frameIds: `ranked-delta`, `zhvi-area`, `corridor-scatter`, `bar-table`.** Traced every branch (`chart-for-question.ts` layers 0–2, `build-chart-for-intent.mts`'s `case` list, `chart-from-metrics.mts`'s `computeMetricChart`). That means:
   - **`corridor-scatter`** is live-reachable TODAY — `buildChartForIntent`'s `corridor-scatter` case already emits a genuine `frameId: "corridor-scatter"` spec (`scatterChartSpecFromRows`, real `JoinedCorridorRow[]` under `options.data`) when a question routes there. Its picker fit-gate is a **passthrough** check (`spec.frameId === "corridor-scatter"`), not fabrication from bar data — there's no way to invent an x/y pair from a flat `(label, value)` list, and none is needed because the real shape sometimes already arrives.
   - **`z-gauge`, `seasonal-radial`, `storm-timeline`** are **not** produced by `buildChartForQuestion` today, and none is fabricatable from a flat bar-table (no bound/target for a gauge, no per-corridor snapshot from a ZIP-price list, no per-event date from a category list). Their picker fit-gates are also passthrough-only (`spec.frameId === type`) — but since nothing upstream emits those frameIds through this path, **these 3 picker options will be selectable in the UI but will practically always fall back to "showed a bar instead" until a producer emits that shape.** This is not a bug to fix in this build — it's the honest, non-fabricating behavior the spec's own MOAT rule requires — but it means Phase B ships 5 real renderers + 5 real gates, of which today only 2 (`composition` via fabrication, `corridor-scatter` via live passthrough) can actually produce something other than the bar fallback through the Email Lab picker. `storm-timeline` additionally needs the env-swfl per-storm emit (already known, spec's own non-goal). Flagging this now so it isn't rediscovered as "the picker option does nothing" in a future session.

Only `composition`'s gate is genuine fabrication (mirrors `donut`'s existing "additive count data" test). The other 4 are passthrough. This plan builds all 5 renderers and gates as specified — the passthrough ones are still correct, tested, and forward-compatible with a future producer; they're just not live-wired to real data through *this* path yet.

---

## File structure

| File | Change |
|---|---|
| `lib/email/reshape-chart-type.ts` | Add 7 `ChartType` members, 7 `CHART_TYPE_OPTIONS` entries (Phase A: 2 now, Phase B: 5 alongside their renderers), a generic frameId-passthrough guard, `chartTypeFits` cases, `reshapeChartToType` cases |
| `components/charts/registry/chart-spec.ts` | Drive-by: fix stale `fixtureOnly` comment (line 35) |
| `lib/charts/svg/composition.ts` | NEW — pure SVG builder + data adapter + color resolver (moved out of `CompositionFrame.tsx`) |
| `lib/charts/svg/z-gauge.ts` | NEW — pure SVG builder + data adapter + color helper (moved out of `ZGaugeFrame.tsx`) |
| `components/charts/registry/frames/CompositionFrame.tsx` | Refactor to thin wrapper over `lib/charts/svg/composition.ts` (mirrors `DotPlotFrame.tsx`) |
| `components/charts/registry/frames/ZGaugeFrame.tsx` | Refactor to thin wrapper over `lib/charts/svg/z-gauge.ts` |
| `components/charts/registry/frames/TimelineFrame.tsx` | Extract chart-only JSX into exported `TimelineChartCore` (shared with the email SSR path) |
| `components/charts/SeasonalRadialChart.tsx` | Extract chart-only JSX into exported `SeasonalRadialChartCore` |
| `lib/email/spec-to-png.ts` | Add 5 new `case`s to the frame switch: `composition`, `z-gauge`, `storm-timeline`, `seasonal-radial`, `corridor-scatter` |
| `lib/email/reshape-chart-type.test.ts` | Extend with 7 new cases |
| `lib/email/spec-to-png.test.ts` | Extend with 5 new renderer cases |

No new build registration needed — `chart_picker_parity_live_verify` (check) and `docs/superpowers/specs/2026-07-11-chart-picker-parity-design.md` (spec) already exist from the prior session (confirmed via `node scripts/check.mjs list`). Task 8's `bun test` full pass is what closes that check.

---

### Task 1: Drive-by fix — stale `fixtureOnly` doc comment

**Files:**
- Modify: `components/charts/registry/chart-spec.ts:28-36`

**Interfaces:** None — doc-comment-only change, no runtime behavior.

- [ ] **Step 1: Fix the stale comment**

Current text (line 33-35 area) wrongly claims `seasonal-radial` is fixture-only. `registry.ts`'s own comment says that flag was flipped off when `cre-swfl` started emitting `corridor_seasonality` live. Update the `DataShape` doc comment:

```typescript
/**
 * The coarse shape of the data a frame consumes — declared on each registry
 * entry's `accepts`. NOTE: `pickFramesForData` (Phase 2g) does NOT read
 * `accepts`; it returns one frameId from a hardcoded priority ladder. `accepts`
 * is descriptive metadata only. A `time-series`-labeled frame that is ALSO
 * `fixtureOnly` (see `FrameDef.fixtureOnly`) is excluded from both the picker
 * and the deliverable binder via `isFixtureOnly()` — the single source of
 * truth for "cannot bind to live data" lives on the registry entry itself,
 * never inferred from `accepts` overlap.
 */
```

- [ ] **Step 2: Verify no other file references the old claim**

Run: `grep -rn "seasonal-radial is fixture-only" components/ lib/ docs/superpowers/specs/2026-07-11-chart-picker-parity-design.md`
Expected: no matches outside the spec doc itself (which already documents this as a drive-by fix, not a claim to preserve).

- [ ] **Step 3: Commit**

```bash
git add components/charts/registry/chart-spec.ts
git commit -m "docs(charts): fix stale seasonal-radial fixtureOnly comment in chart-spec.ts"
```

---

### Task 2: Phase A — spark-grid + line-band picker options

**Files:**
- 🔴 Modify: `lib/email/reshape-chart-type.ts`
- 🔴 Modify: `lib/email/reshape-chart-type.test.ts`

**Interfaces:**
- Consumes: `SparkCard` from `lib/charts/svg/spark-grid.ts` (existing), `LineBandPoint` from `lib/charts/svg/line-band.ts` (existing) — for type reference only, not imported (the reshape function builds plain object literals matching those shapes).
- Produces: `ChartType` gains `"spark-grid" | "line-band"`; `reshapeChartToType` produces `frameId: "spark-grid"` / `"line-band"` specs consumable by `chartSpecToEmailSvg`'s existing cases (`spec-to-png.ts:126-133`, unchanged).

Both frameIds already have working PNG renderers (`sparkGridSvg`/`lineBandSvg`, wired in `spec-to-png.ts`). This task ONLY touches the picker/reshape layer — no renderer code changes. Since any ≥2-point categorical data can honestly become a row of KPI cards (each card's sparkline degenerates to a single-point series, which `sparkGridSvg` already renders as a plain card with no polyline when `series.length < 2` — never fabricated history) or a plain line (no lo/hi band, since there's no confidence data to plot — `lineBandSvg` already omits the band when fewer than 2 points carry both `lo` and `hi`), neither needs a new `chartTypeFits` gate; both fall into the existing "always fits ≥2 points" bucket alongside `bar`/`dotplot`/`composed`.

- [ ] **Step 1: Write the failing tests**

Add to `lib/email/reshape-chart-type.test.ts` (after the existing `composed` tests, before the time-series tests):

```typescript
test("chartTypeFits: spark-grid + line-band always fit ≥2 points (degenerate series/no band, never fabricated)", () => {
  expect(chartTypeFits(usdSpec, "spark-grid")).toBe(true);
  expect(chartTypeFits(usdSpec, "line-band")).toBe(true);
});

test("usd → spark-grid maps each point to a KPI card with a single-value (degenerate) series", () => {
  const out = reshapeChartToType(usdSpec, "spark-grid");
  expect(out.frameId).toBe("spark-grid");
  const cards = out.options?.cards as { label: string; value: number; series: number[] }[];
  expect(cards).toHaveLength(3);
  expect(cards[0]).toEqual({ label: "33921", value: 2975000, series: [2975000], valueFormat: "usd" });
});

test("spark-grid caps at 4 cards (matches sparkGridSvg's own cap)", () => {
  const wide: ChartSpec = {
    ...countSpec,
    rows: [
      ["A", 1],
      ["B", 2],
      ["C", 3],
      ["D", 4],
      ["E", 5],
    ],
  };
  const out = reshapeChartToType(wide, "spark-grid");
  expect((out.options?.cards as unknown[]).length).toBe(4);
});

test("usd → line-band maps each point to a plain point with no lo/hi (no fabricated confidence band)", () => {
  const out = reshapeChartToType(usdSpec, "line-band");
  expect(out.frameId).toBe("line-band");
  const data = out.options?.data as { label: string; value: number; lo?: number; hi?: number }[];
  expect(data).toHaveLength(3);
  expect(data[0]).toEqual({ label: "33921", value: 2975000 });
  expect(data[0].lo).toBeUndefined();
  expect(data[0].hi).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test lib/email/reshape-chart-type.test.ts`
Expected: FAIL — `chartTypeFits(usdSpec, "spark-grid")` is a TypeScript error today (`"spark-grid"` is not assignable to `ChartType`); once that's worked around for the test run, the reshape cases fail because they fall through the `default` (bar) case.

- [ ] **Step 3: Add the two new `ChartType` members + picker labels**

In `lib/email/reshape-chart-type.ts`, update:

```typescript
export type ChartType =
  | "bar"
  | "ranked"
  | "donut"
  | "dotplot"
  | "composed"
  | "spark-grid"
  | "line-band";

export const CHART_TYPE_OPTIONS: { type: ChartType; label: string }[] = [
  { type: "bar", label: "Bar" },
  { type: "ranked", label: "Bar + change" },
  { type: "donut", label: "Donut / share" },
  { type: "dotplot", label: "Dot vs average" },
  { type: "composed", label: "Bar + trend line" },
  { type: "spark-grid", label: "KPI cards" },
  { type: "line-band", label: "Line" },
];
```

- [ ] **Step 4: Add the two cases to `chartTypeFits`'s switch**

```typescript
export function chartTypeFits(spec: ChartSpec, type: ChartType): boolean {
  const pts = extractPoints(spec);
  if (pts.length < 2) return false;
  switch (type) {
    case "donut":
      return spec.value_format === "count";
    case "ranked":
      return pts.some((p) => typeof p.delta === "number");
    case "bar":
    case "dotplot":
    case "composed":
    case "spark-grid":
    case "line-band":
    default:
      return true;
  }
}
```

- [ ] **Step 5: Add the two cases to `reshapeChartToType`'s switch**

```typescript
    case "spark-grid":
      return {
        ...base,
        columns: cols,
        rows: pts.map((p) => [p.label, p.value]),
        chart_type: "bar",
        frameId: "spark-grid",
        options: {
          // Each card's "series" is the point's own value alone — a degenerate
          // 1-length sparkline (sparkGridSvg renders no polyline below 2 points).
          // No fabricated history: a flat category list has no per-item past.
          cards: pts.slice(0, 4).map((p) => ({
            label: p.label,
            value: p.value,
            series: [p.value],
            valueFormat: spec.value_format,
          })),
        },
      } as ChartSpec;
    case "line-band":
      return {
        ...base,
        columns: cols,
        rows: pts.map((p) => [p.label, p.value]),
        // "bar" (not "area"): keeps this spec re-reshapeable — `isTimeSeries`
        // would treat chart_type "area" as a trend and freeze further reshapes,
        // but these labels are categories (ZIPs/cities), not real dates.
        chart_type: "bar",
        frameId: "line-band",
        options: {
          // No lo/hi — there is no confidence interval in a flat category
          // list; lineBandSvg already renders a plain line when absent.
          data: pts.map((p) => ({ label: p.label, value: p.value })),
          valueFormat: spec.value_format,
        },
      } as ChartSpec;
```

Add these cases immediately above the existing `case "bar": default:` block (order doesn't matter functionally, but keep the file's existing top-to-bottom shape grouping: ranked → donut → dotplot → composed → spark-grid → line-band → bar).

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test lib/email/reshape-chart-type.test.ts`
Expected: PASS — all existing + 4 new tests green.

- [ ] **Step 7: Commit**

```bash
git add lib/email/reshape-chart-type.ts lib/email/reshape-chart-type.test.ts
git commit -m "feat(email-lab): expose spark-grid + line-band in the chart-type picker (Phase A)"
```

---

### Task 3: Phase B1a — `composition` pure-SVG builder + picker wiring

**Files:**
- Create: `lib/charts/svg/composition.ts`
- Modify: `components/charts/registry/frames/CompositionFrame.tsx`
- 🔴 Modify: `lib/email/spec-to-png.ts`
- 🔴 Modify: `lib/email/reshape-chart-type.ts`
- Test: `lib/charts/svg/composition.test.ts` (new)
- 🔴 Test: `lib/email/spec-to-png.test.ts`
- 🔴 Test: `lib/email/reshape-chart-type.test.ts`

**Interfaces:**
- Produces: `compositionSvg(segments: CompositionSegment[], colors: string[], opts: CompositionOpts): string`, `extractCompositionData(options): CompositionData`, `resolveCompositionColors(segments, theme?): string[]` — all moved from `CompositionFrame.tsx` into the new pure module (mirrors `dot-plot.ts`'s ownership pattern: the pure builder module owns its own types + extraction + drawing; the React frame is a thin wrapper).
- Consumes (this task only): `extendPalette` from `lib/charts/palette.ts` (existing, unchanged), `formatDisplayDate` from `lib/format-date.ts` (existing).

This is the first Phase-B frame and also introduces the shared **frameId-passthrough guard** in `reshapeChartToType`, which Tasks 4–7 all reuse.

- [ ] **Step 1: Write the failing pure-builder test**

Create `lib/charts/svg/composition.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { compositionSvg, extractCompositionData, resolveCompositionColors } from "./composition";

test("extractCompositionData reads segments + optional callout", () => {
  const out = extractCompositionData({
    segments: [
      { label: "SFHA (in flood zone)", valuePct: 32 },
      { label: "Outside SFHA", valuePct: 68 },
    ],
    callout: "357× AAL multiplier",
  });
  expect(out.segments).toHaveLength(2);
  expect(out.segments[0]).toEqual({ label: "SFHA (in flood zone)", valuePct: 32, color: undefined });
  expect(out.callout).toBe("357× AAL multiplier");
});

test("resolveCompositionColors: explicit segment color wins over the generated palette", () => {
  const colors = resolveCompositionColors(
    [
      { color: "#ff0000" },
      {},
    ],
    { accent: "#3dc9c0" },
  );
  expect(colors[0]).toBe("#ff0000");
  expect(colors[1]).not.toBe("#ff0000");
});

test("compositionSvg draws a segmented bar + legend + optional callout", () => {
  const svg = compositionSvg(
    [
      { label: "SFHA", valuePct: 32 },
      { label: "Outside SFHA", valuePct: 68 },
    ],
    ["#e05c2e", "#3dc9c0"],
    { title: "Flood exposure composition", callout: "357× AAL multiplier", source: "env-swfl", asOf: "2026-06-30" },
  );
  expect(svg).toContain("<svg");
  expect(svg).toContain("Flood exposure composition");
  expect(svg).toContain("357× AAL multiplier");
  expect(svg).toContain("SFHA");
  expect(svg).toContain("32.0%");
  expect(svg).toContain("06/30/2026");
});

test("compositionSvg renders no callout box when callout is absent", () => {
  const svg = compositionSvg([{ label: "A", valuePct: 100 }], ["#e05c2e"], { title: "Share" });
  expect(svg).not.toContain("×");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/charts/svg/composition.test.ts`
Expected: FAIL — module `./composition` does not exist.

- [ ] **Step 3: Write the pure builder module**

Create `lib/charts/svg/composition.ts`:

```typescript
// lib/charts/svg/composition.ts
//
// PURE SVG BUILDER — no React, no DOM, no I/O. Returns a self-contained,
// email-safe <svg> STRING (system fonts only, no <script>/<style>/<canvas>,
// ≤600px). CompositionFrame.tsx wraps this string for the web frame; the
// email PNG path (lib/email/spec-to-png.ts) rasterizes the SAME string. One
// builder, two surfaces — never fork the renderer.
//
// SHAPE: parts-of-a-whole — a segmented horizontal bar (each segment's width
// is its valuePct) plus a legend and an optional big magnitude callout
// (e.g. "357× AAL multiplier"). chartTypeFits gates this to additive (count)
// data only — the same test donut-share uses (lib/email/reshape-chart-type.ts).
//
// Style copied from dot-plot.ts: GRID/AXIS_TEXT palette, esc(), formatDisplayDate.

import { formatDisplayDate } from "@/lib/format-date";
import { extendPalette } from "@/lib/charts/palette";
import type { ChartTheme } from "@/components/charts/registry/chart-spec";

const AXIS_TEXT = "#9CA3AF";
const CALLOUT_BG = "#262626"; // neutral-800
const CANVAS_BG = "#171717"; // neutral-900 — matches CompositionFrame's dark canvas

export interface CompositionSegment {
  label: string;
  valuePct: number;
  color?: string;
}

export interface CompositionData {
  segments: CompositionSegment[];
  callout: string | undefined;
}

export interface CompositionOpts {
  title: string;
  callout?: string;
  source?: string;
  asOf?: string;
  width?: number;
}

/** Pure data-adapter — exported so tests can import it without a DOM. */
export function extractCompositionData(options: Record<string, unknown>): CompositionData {
  const rawSegments = options.segments;
  const callout = typeof options.callout === "string" ? options.callout : undefined;
  if (!Array.isArray(rawSegments)) return { segments: [], callout };

  const segments: CompositionSegment[] = rawSegments
    .filter(
      (s): s is Record<string, unknown> => s !== null && typeof s === "object" && !Array.isArray(s),
    )
    .map((s) => ({
      label: typeof s.label === "string" ? s.label : "",
      valuePct: typeof s.valuePct === "number" ? s.valuePct : 0,
      color: typeof s.color === "string" ? s.color : undefined,
    }));

  return { segments, callout };
}

/** Resolved fill per segment: explicit `color` wins, else on-brand distinct
 *  extras from `extendPalette` (grayscale-distinct, visible on the dark
 *  canvas). Pure + DOM-free so it's unit-testable without jsdom. */
export function resolveCompositionColors(
  segments: { color?: string }[],
  theme?: ChartTheme,
): string[] {
  const anchor = theme?.accent ?? theme?.primary ?? "#3dc9c0";
  const gen = extendPalette([anchor], segments.length, { background: CANVAS_BG });
  return segments.map((s, i) => s.color ?? gen[i] ?? anchor);
}

/**
 * Email-safe composition (segmented bar + legend) chart as a self-contained
 * SVG string. `colors[i]` must already be resolved (call
 * `resolveCompositionColors` first) — this function only draws.
 */
export function compositionSvg(
  segments: CompositionSegment[],
  colors: string[],
  opts: CompositionOpts,
): string {
  const W = opts.width ?? 600;
  const padX = 24;
  const titleY = 32;
  const calloutH = opts.callout ? 56 : 0;
  const calloutGap = opts.callout ? 16 : 0;
  const barY = titleY + 24 + calloutH + calloutGap;
  const barH = 32;
  const legendTop = barY + barH + 20;
  const legendRowH = 22;
  const legendH = segments.length * legendRowH;
  const padB = 34;
  const H = legendTop + legendH + padB;
  const barW = W - 2 * padX;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${CANVAS_BG}"/>`,
    `<text x="${padX}" y="${titleY}" font-family="Arial" font-size="16" font-weight="600" fill="#ffffff">${esc(opts.title)}</text>`,
  ];

  if (opts.callout) {
    const calloutY = titleY + 24;
    parts.push(
      `<rect x="${padX}" y="${calloutY}" width="${barW}" height="${calloutH}" rx="8" fill="${CALLOUT_BG}"/>`,
      `<text x="${W / 2}" y="${calloutY + calloutH / 2 + 8}" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold" fill="#fbbf24">${esc(opts.callout)}</text>`,
    );
  }

  // Segmented horizontal bar — each segment's width is its share of barW.
  let x = padX;
  segments.forEach((seg, i) => {
    const w = Math.max(0, (Math.max(seg.valuePct, 0) / 100) * barW);
    parts.push(`<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${esc(colors[i] ?? "#3dc9c0")}"/>`);
    x += w;
  });

  // Legend — swatch + label + pct, one row per segment.
  segments.forEach((seg, i) => {
    const ly = legendTop + i * legendRowH + 14;
    const label = seg.label.length > 40 ? `${seg.label.slice(0, 39)}…` : seg.label;
    parts.push(
      `<rect x="${padX}" y="${(ly - 10).toFixed(1)}" width="12" height="12" rx="2" fill="${esc(colors[i] ?? "#3dc9c0")}"/>`,
      `<text x="${padX + 20}" y="${ly.toFixed(1)}" font-family="Arial" font-size="13" fill="#e5e5e5">${esc(label)}</text>`,
      `<text x="${(W - padX).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="end" font-family="Arial" font-size="13" font-weight="bold" fill="#ffffff">${seg.valuePct.toFixed(1)}%</text>`,
    );
  });

  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  if (captionParts.length)
    parts.push(
      `<text x="${padX}" y="${H - 12}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`,
    );

  parts.push(`</svg>`);
  return parts.join("");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/charts/svg/composition.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `CompositionFrame.tsx` to a thin wrapper**

Replace the full contents of `components/charts/registry/frames/CompositionFrame.tsx`:

```typescript
import type { ChartSpec } from "../chart-spec";
import {
  compositionSvg,
  extractCompositionData,
  resolveCompositionColors,
} from "@/lib/charts/svg/composition";

/**
 * CompositionFrame — the React wrapper for the parts-of-a-whole segmented-bar
 * shape. It does NOT draw the chart: it pulls `segments`/`callout` from
 * `spec.options`, resolves colors from `spec.theme`, and renders the SAME
 * pure SVG string the email PNG path rasterizes (`lib/charts/svg/composition.ts`).
 * One renderer, two surfaces — never forked (mirrors DotPlotFrame.tsx).
 *
 * spec.options shape:
 *   segments: Array<{ label: string; valuePct: number; color?: string }>
 *   callout?: string   — big-bold emphasis text, e.g. "357× AAL multiplier"
 */
export function CompositionFrame({ spec }: { spec: ChartSpec }) {
  const { segments, callout } = extractCompositionData(spec.options ?? {});
  const colors = resolveCompositionColors(segments, spec.theme);

  const svg = compositionSvg(segments, colors, {
    title: spec.title,
    callout,
    source: spec.source?.citation,
    asOf: spec.asOf,
  });

  return (
    <div
      className="h-full w-full bg-neutral-900"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
```

- [ ] **Step 6: Wire the `composition` case into `spec-to-png.ts`**

In `lib/email/spec-to-png.ts`, add the import:

```typescript
import {
  compositionSvg,
  extractCompositionData,
  resolveCompositionColors,
} from "@/lib/charts/svg/composition";
```

Add the case inside the `switch (spec.frameId)` block, after the `composed-bar-line` case:

```typescript
      case "composition": {
        const { segments, callout } = extractCompositionData(o);
        if (segments.length) {
          const colors = resolveCompositionColors(segments, spec.theme);
          svg = compositionSvg(segments, colors, {
            title,
            callout,
            source: baseOpts.source,
            asOf: baseOpts.asOf,
          });
        }
        break;
      }
```

- [ ] **Step 7: Write the failing `spec-to-png.test.ts` case**

Add to `lib/email/spec-to-png.test.ts`:

```typescript
test("composition renders a real segmented-bar SVG from share-style options", async () => {
  const spec = {
    frameId: "composition",
    title: "Flood exposure composition",
    chart_type: "bar",
    value_format: "count",
    source: { citation: "env-swfl" },
    asOf: "2026-06-30",
    options: {
      segments: [
        { label: "SFHA (in flood zone)", valuePct: 32 },
        { label: "Outside SFHA", valuePct: 68 },
      ],
      callout: "357× AAL multiplier",
    },
  } as ChartSpec;

  const svg = await chartSpecToEmailSvg(spec, "#0ea5e9");

  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Flood exposure composition");
  expect(svg).toContain("357");
});
```

- [ ] **Step 8: Run test to verify it fails, then implement, then pass**

Run: `bun test lib/email/spec-to-png.test.ts`
Expected first: FAIL (case not yet reachable if Step 6 wasn't done yet — do Step 6 before this run). After Step 6: PASS.

- [ ] **Step 9: Add the shared frameId-passthrough guard + `composition`'s fabricate gate to `reshape-chart-type.ts`**

In `reshape-chart-type.ts`, extend `ChartType`:

```typescript
export type ChartType =
  | "bar"
  | "ranked"
  | "donut"
  | "dotplot"
  | "composed"
  | "spark-grid"
  | "line-band"
  | "composition"
  | "z-gauge"
  | "seasonal-radial"
  | "storm-timeline"
  | "corridor-scatter";
```

Add the picker label (only `composition` this task — the other 4 land in Tasks 4-7 alongside their own renderers, per the spec's "three pieces per frame, ship together" rule):

```typescript
  { type: "composition", label: "Composition" },
```

Add the fabricate gate to `chartTypeFits` (mirrors `donut`'s existing test — parts-of-a-whole needs additive count data):

```typescript
    case "donut":
    case "composition":
      return spec.value_format === "count";
```

Add the shared passthrough guard near the top of `reshapeChartToType`, right after the `isTimeSeries` early return (this benefits `composition` not at all — it fabricates — but Tasks 4-7's passthrough-only types need it, so it's introduced once here as shared infrastructure):

```typescript
export function reshapeChartToType(spec: ChartSpec, type: ChartType): ChartSpec {
  const pts = extractPoints(spec);
  if (pts.length < 2) return spec;
  if (isTimeSeries(spec)) return spec;
  // PASSTHROUGH: some target types (z-gauge, corridor-scatter, seasonal-radial,
  // storm-timeline) can never be honestly fabricated from a flat bar-table —
  // there is no bound/target, no x/y pair, no per-corridor snapshot, no per-
  // event date in a generic (label, value) list. When the routed spec is
  // ALREADY that shape (e.g. buildChartForIntent's corridor-scatter case),
  // keep it as-is rather than force it through the categorical reshape below.
  if (spec.frameId === type) return spec;
  if (type !== "bar" && !chartTypeFits(spec, type)) return reshapeChartToType(spec, "bar");
  ...
```

Add the `composition` fabricate case to the switch (parts-of-a-whole from count data — the segments ARE the points, valuePct computed from each point's share of the total):

```typescript
    case "composition": {
      const total = pts.reduce((a, p) => a + p.value, 0) || 1;
      return {
        ...base,
        columns: cols,
        rows: pts.map((p) => [p.label, p.value]),
        chart_type: "bar",
        frameId: "composition",
        options: {
          segments: pts.map((p) => ({ label: p.label, valuePct: (p.value / total) * 100 })),
        },
      } as ChartSpec;
    }
```

- [ ] **Step 10: Write the failing reshape test, then verify it passes**

Add to `lib/email/reshape-chart-type.test.ts`:

```typescript
test("chartTypeFits: composition needs additive (count) data, same test as donut", () => {
  expect(chartTypeFits(countSpec, "composition")).toBe(true);
  expect(chartTypeFits(usdSpec, "composition")).toBe(false);
});

test("count data → composition computes each point's share of the total (never invents a percent)", () => {
  const out = reshapeChartToType(countSpec, "composition");
  expect(out.frameId).toBe("composition");
  const segs = out.options?.segments as { label: string; valuePct: number }[];
  const total = 7412 + 2749 + 298;
  expect(segs[0].valuePct).toBeCloseTo((7412 / total) * 100, 5);
});

test("GUARDRAIL: composition on price (usd) data falls back to a bar", () => {
  expect(reshapeChartToType(usdSpec, "composition").frameId).toBe("bar-table");
});

test("PASSTHROUGH: a spec already in the target frameId is returned unchanged", () => {
  const already: ChartSpec = { ...usdSpec, frameId: "corridor-scatter" };
  expect(reshapeChartToType(already, "corridor-scatter")).toBe(already);
});
```

Run: `bun test lib/email/reshape-chart-type.test.ts`
Expected: PASS.

- [ ] **Step 11: Full-file typecheck + test run**

Run: `bunx tsc --noEmit` (or the project's existing typecheck script if one exists — check `package.json` `scripts.typecheck` first)
Expected: no new errors.

Run: `bun test lib/charts/svg/composition.test.ts lib/email/spec-to-png.test.ts lib/email/reshape-chart-type.test.ts`
Expected: all PASS.

- [ ] **Step 12: Commit**

```bash
git add lib/charts/svg/composition.ts lib/charts/svg/composition.test.ts \
  components/charts/registry/frames/CompositionFrame.tsx \
  lib/email/spec-to-png.ts lib/email/spec-to-png.test.ts \
  lib/email/reshape-chart-type.ts lib/email/reshape-chart-type.test.ts
git commit -m "feat(charts): composition PNG renderer + picker option (Phase B1a)"
```

---

### Task 4: Phase B1b — `z-gauge` pure-SVG builder + picker wiring

**Files:**
- Create: `lib/charts/svg/z-gauge.ts`
- Modify: `components/charts/registry/frames/ZGaugeFrame.tsx`
- 🔴 Modify: `lib/email/spec-to-png.ts`
- 🔴 Modify: `lib/email/reshape-chart-type.ts`
- Test: `lib/charts/svg/z-gauge.test.ts` (new)
- 🔴 Test: `lib/email/spec-to-png.test.ts`
- 🔴 Test: `lib/email/reshape-chart-type.test.ts`

**Interfaces:**
- Produces: `zGaugeSvg(gauge: GaugeData, opts: ZGaugeOpts): string`, `extractGaugeData(options): GaugeData | null` — moved from `ZGaugeFrame.tsx`.
- Per the open decision above: `z-gauge`'s `chartTypeFits` is **passthrough-only** (`spec.frameId === "z-gauge"`) — no live producer emits this shape through `buildChartForQuestion` today, so this picker option will show "showed a bar instead" until one does. The renderer and gate are still built and tested — they're correct and forward-compatible, just not live-wired yet.

- [ ] **Step 1: Write the failing pure-builder test**

Create `lib/charts/svg/z-gauge.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { zGaugeSvg, extractGaugeData } from "./z-gauge";

test("extractGaugeData returns null when value is missing", () => {
  expect(extractGaugeData(undefined)).toBeNull();
  expect(extractGaugeData({})).toBeNull();
});

test("extractGaugeData computes segment indices from value/baseline/min/max", () => {
  const g = extractGaugeData({ value: 75, baseline: 50, min: 0, max: 100, unit: "index", segments: 10 });
  expect(g).not.toBeNull();
  expect(g!.valueSegmentIndex).toBe(7);
  expect(g!.baselineSegmentIndex).toBe(5);
});

test("zGaugeSvg draws the value, the segmented bar, and the baseline marker", () => {
  const g = extractGaugeData({ value: 75, baseline: 50, min: 0, max: 100, unit: "index" })!;
  const svg = zGaugeSvg(g, { title: "Market heat index", source: "market-heat-swfl", asOf: "2026-06-30" });
  expect(svg).toContain("<svg");
  expect(svg).toContain("Market heat index");
  expect(svg).toContain("75");
  expect(svg).toContain("06/30/2026");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/charts/svg/z-gauge.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the pure builder module**

Create `lib/charts/svg/z-gauge.ts`:

```typescript
// lib/charts/svg/z-gauge.ts
//
// PURE SVG BUILDER — no React, no DOM, no I/O. Mirrors dot-plot.ts /
// composition.ts: a self-contained email-safe <svg> string, wrapped by
// ZGaugeFrame.tsx for the web frame and rasterized directly by
// lib/email/spec-to-png.ts for the email PNG. One builder, two surfaces.
//
// SHAPE: a single value against a segmented min..max scale with a baseline
// marker (e.g. a market-heat index vs its historical baseline). Gate: this
// frame's picker option is PASSTHROUGH-ONLY (lib/email/reshape-chart-type.ts)
// — a single-value-vs-bound shape cannot be honestly fabricated from a flat
// multi-point bar-table; reshaping a multi-point series into a gauge would
// pick an arbitrary needle. This builder renders correctly whenever a
// producer emits genuine gauge-shaped options.

import { formatDisplayDate } from "@/lib/format-date";

const AXIS_TEXT = "#6B7280";

export interface GaugeData {
  value: number;
  baseline: number;
  min: number;
  max: number;
  unit: string;
  segments: number;
  valueSegmentIndex: number;
  baselineSegmentIndex: number;
  valueFraction: number;
}

export interface ZGaugeOpts {
  title: string;
  source?: string;
  asOf?: string;
  width?: number;
}

/** Extract + validate gauge parameters from `spec.options`. Returns `null`
 *  when `value` is absent — the caller renders a graceful fallback instead
 *  of crashing (moved verbatim from ZGaugeFrame.tsx). */
export function extractGaugeData(options: Record<string, unknown> | undefined): GaugeData | null {
  if (!options) return null;
  const value = typeof options.value === "number" ? options.value : null;
  if (value === null) return null;

  const baseline = typeof options.baseline === "number" ? options.baseline : 0;
  const min = typeof options.min === "number" ? options.min : 0;
  const max = typeof options.max === "number" ? options.max : 100;
  const unit = typeof options.unit === "string" ? options.unit : "";
  const segments =
    typeof options.segments === "number" && options.segments > 0 ? Math.round(options.segments) : 9;

  const range = max - min || 1;
  const valueFraction = Math.min(1, Math.max(0, (value - min) / range));
  const baselineFraction = Math.min(1, Math.max(0, (baseline - min) / range));
  const valueSegmentIndex = Math.min(segments - 1, Math.floor(valueFraction * segments));
  const baselineSegmentIndex = Math.min(segments - 1, Math.floor(baselineFraction * segments));

  return { value, baseline, min, max, unit, segments, valueSegmentIndex, baselineSegmentIndex, valueFraction };
}

/** Below baseline = orange spectrum, above = emerald spectrum, at baseline =
 *  neutral slate. Moved verbatim from ZGaugeFrame.tsx. */
function segmentColor(segIndex: number, baselineSegmentIndex: number, segments: number): string {
  const distFromBaseline = segIndex - baselineSegmentIndex;
  if (distFromBaseline < 0) {
    const intensity = Math.abs(distFromBaseline) / Math.max(1, baselineSegmentIndex);
    return `rgba(234, 88, 12, ${(0.35 + intensity * 0.65).toFixed(2)})`;
  }
  if (distFromBaseline === 0) return "rgba(100, 116, 139, 0.70)";
  const maxAbove = segments - 1 - baselineSegmentIndex;
  const intensity = distFromBaseline / Math.max(1, maxAbove);
  return `rgba(5, 150, 105, ${(0.35 + intensity * 0.65).toFixed(2)})`;
}

export function zGaugeSvg(gauge: GaugeData, opts: ZGaugeOpts): string {
  const W = opts.width ?? 600;
  const { value, baseline, min, max, unit, segments, valueSegmentIndex, baselineSegmentIndex } = gauge;
  const padX = 24;
  const titleY = 28;
  const valueY = 72;
  const barY = 92;
  const barH = 24;
  const scaleY = barY + barH + 20;
  const deltaY = scaleY + 26;
  const padB = 34;
  const H = deltaY + padB;
  const barW = W - 2 * padX;
  const segW = barW / segments;

  const displayValue = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  const displayBaseline = baseline % 1 === 0 ? baseline.toFixed(0) : baseline.toFixed(1);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#1e293b"/>`,
    `<text x="${padX}" y="${titleY}" font-family="Arial" font-size="15" font-weight="bold" fill="#e2e8f0">${esc(opts.title)}</text>`,
    `<text x="${padX}" y="${valueY}" font-family="Arial" font-size="32" font-weight="bold" fill="#ffffff">${displayValue}${unit ? ` <tspan font-size="12" fill="#94a3b8">${esc(unit)}</tspan>` : ""}</text>`,
  ];

  for (let i = 0; i < segments; i++) {
    const sx = padX + i * segW;
    const isActive = i === valueSegmentIndex;
    parts.push(
      `<rect x="${sx.toFixed(1)}" y="${barY}" width="${(segW - 2).toFixed(1)}" height="${barH}" fill="${segmentColor(i, baselineSegmentIndex, segments)}" ${isActive ? 'stroke="#ffffff" stroke-width="2"' : ""}/>`,
    );
  }

  const baselineX = padX + (baselineSegmentIndex + 0.5) * segW;
  parts.push(
    `<line x1="${baselineX.toFixed(1)}" y1="${barY + barH}" x2="${baselineX.toFixed(1)}" y2="${barY + barH + 8}" stroke="#94a3b8" stroke-width="1"/>`,
    `<text x="${baselineX.toFixed(1)}" y="${scaleY}" text-anchor="middle" font-family="Arial" font-size="9" fill="${AXIS_TEXT}">base ${displayBaseline}</text>`,
    `<text x="${padX}" y="${scaleY}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${min}</text>`,
    `<text x="${(W - padX).toFixed(1)}" y="${scaleY}" text-anchor="end" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${max}</text>`,
  );

  const delta = value - baseline;
  const sign = delta >= 0 ? "+" : "";
  const deltaColor = delta > 0 ? "#34d399" : delta < 0 ? "#fb923c" : "#94a3b8";
  parts.push(
    `<text x="${W / 2}" y="${deltaY}" text-anchor="middle" font-family="Arial" font-size="11" fill="${deltaColor}">${sign}${delta.toFixed(1)} vs baseline ${displayBaseline}</text>`,
  );

  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  if (captionParts.length)
    parts.push(
      `<text x="${padX}" y="${H - 10}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`,
    );

  parts.push(`</svg>`);
  return parts.join("");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/charts/svg/z-gauge.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `ZGaugeFrame.tsx` to a thin wrapper**

Replace the full contents of `components/charts/registry/frames/ZGaugeFrame.tsx`:

```typescript
"use client";

import type { ChartSpec } from "../chart-spec";
import { zGaugeSvg, extractGaugeData } from "@/lib/charts/svg/z-gauge";
import { friendlyAsOf } from "@/lib/project/as-of";

/**
 * ZGaugeFrame — the React wrapper for the single-value-vs-bound gauge shape.
 * Renders the SAME pure SVG string the email PNG path rasterizes
 * (`lib/charts/svg/z-gauge.ts`). One renderer, two surfaces.
 */
export function ZGaugeFrame({ spec }: { spec: ChartSpec }) {
  const gauge = extractGaugeData(spec.options);

  if (!gauge) {
    return (
      <div className="rounded-xl bg-slate-800 p-5 text-slate-300">
        <p className="text-sm font-medium mb-2">{spec.title}</p>
        <p className="text-xs text-slate-500">Gauge data unavailable.</p>
        <p className="mt-3 text-xs text-slate-400 text-center">
          As of {friendlyAsOf(spec.asOf)}
          {spec.source?.citation ? ` · ${spec.source.citation}` : ""}
        </p>
      </div>
    );
  }

  const svg = zGaugeSvg(gauge, {
    title: spec.title,
    source: spec.source?.citation,
    asOf: spec.asOf,
  });

  return <div className="rounded-xl overflow-hidden" dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

- [ ] **Step 6: Wire the `z-gauge` case into `spec-to-png.ts`**

Add the import:

```typescript
import { zGaugeSvg, extractGaugeData } from "@/lib/charts/svg/z-gauge";
```

Add the case after `composition`:

```typescript
      case "z-gauge": {
        const gauge = extractGaugeData(o);
        if (gauge) svg = zGaugeSvg(gauge, { title, source: baseOpts.source, asOf: baseOpts.asOf });
        break;
      }
```

- [ ] **Step 7: Write the failing `spec-to-png.test.ts` case, implement, verify it passes**

Add to `lib/email/spec-to-png.test.ts`:

```typescript
test("z-gauge renders a real gauge SVG from single-value-vs-bound options", async () => {
  const spec = {
    frameId: "z-gauge",
    title: "Market heat index",
    chart_type: "bar",
    value_format: "index",
    source: { citation: "market-heat-swfl" },
    asOf: "2026-06-30",
    options: { value: 75, baseline: 50, min: 0, max: 100, unit: "index" },
  } as ChartSpec;

  const svg = await chartSpecToEmailSvg(spec, "#0ea5e9");

  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Market heat index");
});
```

Run: `bun test lib/email/spec-to-png.test.ts`
Expected: FAIL before Step 6, PASS after.

- [ ] **Step 8: Add `z-gauge` picker label + passthrough gate to `reshape-chart-type.ts`**

Add the label:

```typescript
  { type: "z-gauge", label: "Gauge / index" },
```

Add the gate (passthrough-only — see the open design decision):

```typescript
    case "z-gauge":
      // PASSTHROUGH ONLY: a single-value-vs-bound shape cannot be fabricated
      // from a flat multi-point list — there is no bound/target to invent.
      // buildChartForQuestion does not emit this frameId today (2026-07-11);
      // this evaluates true only once/if a producer does.
      return spec.frameId === "z-gauge";
```

- [ ] **Step 9: Write the failing reshape test, verify it passes**

```typescript
test("chartTypeFits: z-gauge is passthrough-only — false for any fabricated (multi-point) spec", () => {
  expect(chartTypeFits(usdSpec, "z-gauge")).toBe(false);
  expect(chartTypeFits(countSpec, "z-gauge")).toBe(false);
});

test("PASSTHROUGH: a spec already frameId z-gauge stays z-gauge when re-requested", () => {
  const already: ChartSpec = { ...usdSpec, frameId: "z-gauge" };
  expect(reshapeChartToType(already, "z-gauge")).toBe(already);
});
```

Run: `bun test lib/email/reshape-chart-type.test.ts`
Expected: PASS.

- [ ] **Step 10: Full test + typecheck pass, then commit**

```bash
bun test lib/charts/svg/z-gauge.test.ts lib/email/spec-to-png.test.ts lib/email/reshape-chart-type.test.ts
git add lib/charts/svg/z-gauge.ts lib/charts/svg/z-gauge.test.ts \
  components/charts/registry/frames/ZGaugeFrame.tsx \
  lib/email/spec-to-png.ts lib/email/spec-to-png.test.ts \
  lib/email/reshape-chart-type.ts lib/email/reshape-chart-type.test.ts
git commit -m "feat(charts): z-gauge PNG renderer + passthrough-only picker option (Phase B1b)"
```

---

### Task 5: Phase B2a — `storm-timeline` recharts SSR renderer + picker wiring

**Files:**
- Modify: `components/charts/registry/frames/TimelineFrame.tsx` (extract chart-only JSX)
- 🔴 Modify: `lib/email/spec-to-png.ts`
- 🔴 Modify: `lib/email/reshape-chart-type.ts`
- 🔴 Test: `lib/email/spec-to-png.test.ts`
- 🔴 Test: `lib/email/reshape-chart-type.test.ts`

**Interfaces:**
- Produces: `TimelineChartCore(props): ReactElement` — extracted from `TimelineFrame`, importable by both the client frame and the email SSR path (one recharts tree, not two).
- Consumes: `renderBklitStaticSvg` from `components/charts/vendor/bklit/render-static.tsx` (existing — the SSR bridge is generic `@react-email/render` + SVG-extraction; despite its name it isn't bklit-component-specific, and reusing it here avoids a second bridge function).
- Per the open decision above: passthrough-only gate. `storm-timeline` also carries its OWN known dependency (env-swfl's per-storm `detail_table` emit) — this task builds the renderer against fixture data; it does not bind live until that emit ships (tracked separately, matching the spec's non-goal).

- [ ] **Step 1: Extract the chart-only JSX into `TimelineChartCore`**

Replace `components/charts/registry/frames/TimelineFrame.tsx` with (the only change: the `<ResponsiveContainer>...</ResponsiveContainer>` block becomes an exported `TimelineChartCore` function; `TimelineFrame` calls it):

```typescript
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { ChartSpec } from "../chart-spec";
import { friendlyAsOf } from "@/lib/project/as-of";

export interface TimelineEvent {
  label: string;
  date: string;
  amount_usd: number;
}

function isoToYear(iso: string): number {
  return parseInt(iso.slice(0, 4), 10);
}

function friendlyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export interface TimelineChartCoreProps {
  events: TimelineEvent[];
  baseline: number | null;
  yLabel: string;
  accent: string;
  /** Fixed dims for the SSR path; the client path relies on ResponsiveContainer's
   *  normal 100%-width behavior and only needs `initialDimension` as a same-pass
   *  server-render seed (both paths pass it — see NOTICE.md). */
  width?: number;
  height?: number;
}

/** The recharts tree ONLY — no title/caption chrome (those differ between the
 *  web frame's plain <div> header and the email PNG's <text> chrome, added by
 *  each caller). Shared by TimelineFrame (client) and spec-to-png.ts (SSR) so
 *  there is exactly one chart definition, never two. */
export function TimelineChartCore({ events, baseline, yLabel, accent, width, height }: TimelineChartCoreProps) {
  const sorted = events.slice().sort((a, b) => a.date.localeCompare(b.date));
  const chartData = sorted.map((e) => ({
    name: `${e.label} ${isoToYear(e.date)}`,
    amount_usd: e.amount_usd,
    date: e.date,
    label: e.label,
  }));
  const maxVal = Math.max(...sorted.map((e) => e.amount_usd));
  const H = height ?? 260;

  return (
    <ResponsiveContainer width="100%" height={H} initialDimension={{ width: width ?? 800, height: H }}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 28, left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf0" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "#4a5a6a" }}
          tickLine={false}
          axisLine={{ stroke: "#d1d8e0" }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={48}
        />
        <YAxis
          tickFormatter={fmtUsd}
          tick={{ fontSize: 10, fill: "#4a5a6a" }}
          tickLine={false}
          axisLine={false}
          label={{ value: yLabel, angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#8898aa" } }}
          domain={[0, maxVal * 1.15]}
        />
        <Tooltip
          formatter={(value, _name, props) => [
            fmtUsd(Number(value ?? 0)),
            (props as { payload?: { label?: string } }).payload?.label ?? "Amount",
          ]}
          labelFormatter={(label, payload) => {
            const entry = (payload as unknown as Array<{ payload?: { date?: string } }>)?.[0];
            const date = entry?.payload?.date;
            return date ? friendlyDate(date) : String(label ?? "");
          }}
          contentStyle={{ background: "#fff", border: "1px solid #e5eaf0", borderRadius: 6, fontSize: 12 }}
        />
        {baseline !== null && (
          <ReferenceLine
            y={baseline}
            stroke="#60a5fa"
            strokeDasharray="6 3"
            label={{ value: `Baseline ${fmtUsd(baseline)}`, position: "right", style: { fontSize: 10, fill: "#60a5fa" } }}
          />
        )}
        <Bar dataKey="amount_usd" radius={[3, 3, 0, 0]} maxBarSize={56}>
          {chartData.map((entry, i) => (
            <Cell key={`cell-${i}`} fill={entry.amount_usd === maxVal ? accent : `${accent}99`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const captionStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  color: "#4a5a6a",
  marginTop: 6,
  letterSpacing: "0.02em",
};

export function TimelineFrame({ spec }: { spec: ChartSpec }) {
  const events = (spec.options?.events ?? []) as TimelineEvent[];
  const baseline = typeof spec.options?.baseline_usd === "number" ? (spec.options.baseline_usd as number) : null;
  const yLabel = typeof spec.options?.y_label === "string" ? (spec.options.y_label as string) : "Amount (USD)";
  const accent =
    typeof spec.options?.accent === "string" ? (spec.options.accent as string) : (spec.theme?.accent ?? "#e05c2e");

  if (events.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
        No events to display.
      </div>
    );
  }

  return (
    <div>
      {spec.title && (
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#1a2636" }}>{spec.title}</div>
      )}
      <TimelineChartCore events={events} baseline={baseline} yLabel={yLabel} accent={accent} />
      {spec.asOf && (
        <p style={captionStyle}>
          As of {friendlyAsOf(spec.asOf)}
          {spec.source?.citation ? ` · ${spec.source.citation}` : ""}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Confirm the web frame still renders identically**

Run: `bun run typecheck` (or `bunx tsc --noEmit`) — `TimelineFrame`'s public interface (`{ spec }`) is unchanged, so no caller needs updating.

- [ ] **Step 3: Write the failing `spec-to-png.test.ts` case**

Add to `lib/email/spec-to-png.test.ts`:

```typescript
test("storm-timeline renders a real recharts BarChart SVG (fixture data — env-swfl per-storm emit not yet live)", async () => {
  const spec = {
    frameId: "storm-timeline",
    title: "Storm claims by year",
    chart_type: "bar",
    value_format: "usd",
    source: { citation: "NFIP / FEMA OpenFEMA" },
    asOf: "2026-06-30",
    options: {
      events: [
        { label: "Ian", date: "2022-09-28", amount_usd: 450_000_000 },
        { label: "Irma", date: "2017-09-10", amount_usd: 120_000_000 },
      ],
      y_label: "Paid claims (USD)",
    },
  } as ChartSpec;

  const svg = await chartSpecToEmailSvg(spec, "#e05c2e");

  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Storm claims by year");
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test lib/email/spec-to-png.test.ts`
Expected: FAIL — `storm-timeline` not yet handled, falls through to the bar fallback (renders SOME svg via `specToBars`, but won't contain "Storm claims by year" as chrome text since the bar fallback's title is drawn differently — check actual failure mode before assuming; if it happens to pass by coincidence via the bar fallback, tighten the assertion to `svg).toContain("<rect")` verifying real bar geometry from `TimelineChartCore`, not the hand-rolled `barChartSvg` fallback).

- [ ] **Step 5: Wire the `storm-timeline` case into `spec-to-png.ts`**

Add the imports:

```typescript
import { TimelineChartCore, type TimelineEvent } from "@/components/charts/registry/frames/TimelineFrame";
```

Add the case (reuses `renderBklitStaticSvg` as the generic SSR bridge — it wraps any element in `@react-email/render`'s `render()` and extracts the `<svg>`; its `StaticChartPreviewProvider` wrapper is a no-op for a non-bklit recharts tree, so no fork is needed):

```typescript
      case "storm-timeline": {
        const events = o.events as TimelineEvent[] | undefined;
        if (Array.isArray(events) && events.length) {
          const baseline = typeof o.baseline_usd === "number" ? (o.baseline_usd as number) : null;
          const yLabel = typeof o.y_label === "string" ? (o.y_label as string) : "Amount (USD)";
          const rendered = await renderBklitStaticSvg(
            <TimelineChartCore events={events} baseline={baseline} yLabel={yLabel} accent={accent} width={600} height={280} />,
          );
          if (rendered) {
            const chrome = [
              `<text x="16" y="26" font-family="Arial" font-size="15" font-weight="bold" fill="#1F2937">${escXmlChrome(title)}</text>`,
              baseOpts.source || baseOpts.asOf
                ? `<text x="16" y="270" font-family="Arial" font-size="10" fill="#6B7280">${escXmlChrome([baseOpts.source, baseOpts.asOf ? `as of ${formatDisplayDate(baseOpts.asOf)}` : ""].filter(Boolean).join(" · "))}</text>`
                : "",
            ].join("");
            svg = rendered.replace(/<svg([^>]*)>/, `<svg$1><rect width="600" height="280" fill="#ffffff"/>${chrome}`);
          }
        }
        break;
      }
```

Add the small local escape helper + `formatDisplayDate` import if not already present (it is — `spec-to-png.ts` already imports `formatDisplayDate` at the top):

```typescript
function escXmlChrome(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

Note: `renderBklitStaticSvg` is imported from `@/components/charts/vendor/bklit/render-static` (check the exact existing import path used elsewhere in this file, or add a fresh import — `spec-to-png.ts` does not currently import it directly since `bklitTrendSvg`/`bklitComposedSvg` wrap it internally; add: `import { renderBklitStaticSvg } from "@/components/charts/vendor/bklit/render-static";`).

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test lib/email/spec-to-png.test.ts`
Expected: PASS.

- [ ] **Step 7: Add `storm-timeline` picker label + passthrough gate**

```typescript
  { type: "storm-timeline", label: "Event timeline" },
```

```typescript
    case "storm-timeline":
      // PASSTHROUGH ONLY: needs a real per-event date the flat (label, value)
      // picker source doesn't carry. Also gated on env-swfl's per-storm
      // detail_table emit shipping (tracked separately) before this is ever
      // live-reachable even via passthrough.
      return spec.frameId === "storm-timeline";
```

- [ ] **Step 8: Write the failing reshape test, verify it passes**

```typescript
test("chartTypeFits: storm-timeline is passthrough-only — no per-event date in flat picker data", () => {
  expect(chartTypeFits(usdSpec, "storm-timeline")).toBe(false);
});

test("PASSTHROUGH: a spec already frameId storm-timeline stays storm-timeline (isTimeSeries regex + explicit guard both cover it)", () => {
  const already: ChartSpec = { ...usdSpec, frameId: "storm-timeline" };
  expect(reshapeChartToType(already, "storm-timeline")).toBe(already);
});
```

Run: `bun test lib/email/reshape-chart-type.test.ts`
Expected: PASS.

- [ ] **Step 9: Full test pass + commit**

```bash
bun test components lib/email lib/charts
git add components/charts/registry/frames/TimelineFrame.tsx \
  lib/email/spec-to-png.ts lib/email/spec-to-png.test.ts \
  lib/email/reshape-chart-type.ts lib/email/reshape-chart-type.test.ts
git commit -m "feat(charts): storm-timeline PNG renderer via recharts SSR bridge + picker option (Phase B2a)"
```

---

### Task 6: Phase B2b — `seasonal-radial` recharts SSR renderer + picker wiring

**Files:**
- Modify: `components/charts/SeasonalRadialChart.tsx` (extract chart-only JSX)
- 🔴 Modify: `lib/email/spec-to-png.ts`
- 🔴 Modify: `lib/email/reshape-chart-type.ts`
- 🔴 Test: `lib/email/spec-to-png.test.ts`
- 🔴 Test: `lib/email/reshape-chart-type.test.ts`

**Interfaces:**
- Produces: `SeasonalRadialChartCore(props): ReactElement` — extracted from `SeasonalRadialChart`.
- Per the open decision above: passthrough-only gate, and the gate is intentionally NOT a "≈12 points" heuristic (that would reject the real per-corridor data) — it's the same `spec.frameId === type` check as the other passthrough types.

- [ ] **Step 1: Extract the chart-only JSX into `SeasonalRadialChartCore`**

Replace `components/charts/SeasonalRadialChart.tsx` with:

```typescript
"use client";

import { RadialBarChart, RadialBar, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { SeasonalRadialEntry } from "@/types/viz";
import { friendlyAsOf } from "@/lib/project/as-of";

export type { SeasonalRadialEntry };

export interface SeasonalRadialChartProps {
  data: SeasonalRadialEntry[];
  asOf?: string;
}

function fillFor(idx: number): string {
  if (idx < 0.35) return "#14b8a6";
  if (idx < 0.65) return "#38bdf8";
  return "#d4b370";
}

function shortName(name: string): string {
  const trimmed = name.replace(/^[^-]+-\s*/, "");
  return trimmed.length > 24 ? trimmed.slice(0, 22) + "…" : trimmed;
}

export interface SeasonalRadialChartCoreProps {
  data: SeasonalRadialEntry[];
  width?: number;
  height?: number;
}

/** The recharts tree ONLY — no title/caption/card chrome (the client wraps
 *  it in its dark card; the email PNG path adds plain-text chrome outside
 *  the SVG, same pattern as bklitTrendSvg/TimelineChartCore). Shared so
 *  there is exactly one radial-chart definition. */
export function SeasonalRadialChartCore({ data, width, height }: SeasonalRadialChartCoreProps) {
  const chartData = [...data]
    .sort((a, b) => a.seasonal_index - b.seasonal_index)
    .map((d) => ({
      name: shortName(d.corridor),
      fullName: d.corridor,
      value: Math.round(d.seasonal_index * 100),
      fill: fillFor(d.seasonal_index),
    }));

  return (
    <ResponsiveContainer
      width="100%"
      height={height ?? 300}
      initialDimension={{ width: width ?? 600, height: height ?? 300 }}
    >
      <RadialBarChart
        cx="50%"
        cy="50%"
        innerRadius="10%"
        outerRadius="92%"
        barSize={11}
        data={chartData}
        startAngle={180}
        endAngle={-180}
      >
        <RadialBar
          background={{ fill: "#1e293b" }}
          dataKey="value"
          label={{ position: "insideStart", fill: "#64748b", fontSize: 9 }}
        >
          {chartData.map((entry, i) => (
            <Cell key={`${entry.fullName}-${i}`} fill={entry.fill} />
          ))}
        </RadialBar>
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 11, color: "#e2e8f0" }}
          formatter={(v) => [`${v}%`, "Seasonality"] as [string, string]}
          labelFormatter={(_, payload) => (payload?.[0]?.payload?.fullName as string | undefined) ?? ""}
        />
      </RadialBarChart>
    </ResponsiveContainer>
  );
}

export function SeasonalRadialChart({ data, asOf }: SeasonalRadialChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-slate-500 text-xs font-mono">
        No seasonality data available.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-slate-100 shadow-xl">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-mono tracking-widest text-[#d4b370] uppercase">
          Corridor Seasonality Index
        </span>
        {asOf && <span className="text-[10px] font-mono text-slate-500">as of {friendlyAsOf(asOf)}</span>}
      </div>
      <div style={{ height: 300 }}>
        <SeasonalRadialChartCore data={data} />
      </div>
      <p className="text-[10px] font-mono text-slate-500 mt-1">
        Scale 0% (no seasonality) → 100% (extreme) · SWFL corridors
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Confirm the web component still renders identically**

Run: `bunx tsc --noEmit` — `SeasonalRadialFrame` (`components/charts/registry/frames/SeasonalRadialFrame.tsx`) imports `SeasonalRadialChart` unchanged, so no caller update needed.

- [ ] **Step 3: Write the failing `spec-to-png.test.ts` case**

```typescript
test("seasonal-radial renders a real recharts RadialBarChart SVG", async () => {
  const spec = {
    frameId: "seasonal-radial",
    title: "Corridor seasonality index",
    chart_type: "bar",
    value_format: "pct",
    source: { citation: "cre-swfl" },
    asOf: "2026-06-30",
    options: {
      data: [
        { corridor: "US 41 - Downtown Fort Myers", seasonal_index: 0.72 },
        { corridor: "SR 82 - Corkscrew", seasonal_index: 0.31 },
      ],
    },
  } as ChartSpec;

  const svg = await chartSpecToEmailSvg(spec, "#0ea5e9");

  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
  expect(svg).toContain("Corridor seasonality index");
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `bun test lib/email/spec-to-png.test.ts`
Expected: FAIL.

- [ ] **Step 5: Wire the `seasonal-radial` case into `spec-to-png.ts`**

Add the import:

```typescript
import { SeasonalRadialChartCore } from "@/components/charts/SeasonalRadialChart";
import type { SeasonalRadialEntry } from "@/types/viz";
```

Add the case:

```typescript
      case "seasonal-radial": {
        const data = o.data as SeasonalRadialEntry[] | undefined;
        if (Array.isArray(data) && data.length) {
          const rendered = await renderBklitStaticSvg(
            <SeasonalRadialChartCore data={data} width={600} height={300} />,
          );
          if (rendered) {
            const chrome = [
              `<text x="16" y="26" font-family="Arial" font-size="15" font-weight="bold" fill="#1F2937">${escXmlChrome(title)}</text>`,
              baseOpts.source || baseOpts.asOf
                ? `<text x="16" y="292" font-family="Arial" font-size="10" fill="#6B7280">${escXmlChrome([baseOpts.source, baseOpts.asOf ? `as of ${formatDisplayDate(baseOpts.asOf)}` : ""].filter(Boolean).join(" · "))}</text>`
                : "",
            ].join("");
            svg = rendered.replace(/<svg([^>]*)>/, `<svg$1><rect width="600" height="300" fill="#1e293b"/>${chrome}`);
          }
        }
        break;
      }
```

(`#1e293b` matches the card's dark canvas so the chrome text and radial chart share one background, avoiding a jarring white box.)

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test lib/email/spec-to-png.test.ts`
Expected: PASS.

- [ ] **Step 7: Add `seasonal-radial` picker label + passthrough gate (NOT a point-count heuristic)**

```typescript
  { type: "seasonal-radial", label: "Seasonality ring" },
```

```typescript
    case "seasonal-radial":
      // PASSTHROUGH ONLY — deliberately NOT a "~12 points" count heuristic.
      // The real data is one ratio per corridor (a cross-sectional snapshot,
      // confirmed by reading SeasonalRadialChart.tsx), not a monthly trend —
      // a count gate would reject the real live shape whenever SWFL's
      // corridor count isn't ~12. buildChartForQuestion doesn't emit this
      // frameId today; this evaluates true only if/when a producer does.
      return spec.frameId === "seasonal-radial";
```

- [ ] **Step 8: Write the failing reshape test, verify it passes**

```typescript
test("chartTypeFits: seasonal-radial is passthrough-only, NOT a point-count heuristic (would wrongly reject real per-corridor data)", () => {
  const twelvePoints: ChartSpec = {
    ...countSpec,
    rows: Array.from({ length: 12 }, (_, i) => [`Cat ${i}`, i + 1]),
  };
  expect(chartTypeFits(twelvePoints, "seasonal-radial")).toBe(false);
});

test("PASSTHROUGH: a spec already frameId seasonal-radial stays seasonal-radial", () => {
  const already: ChartSpec = { ...usdSpec, frameId: "seasonal-radial" };
  expect(reshapeChartToType(already, "seasonal-radial")).toBe(already);
});
```

Run: `bun test lib/email/reshape-chart-type.test.ts`
Expected: PASS.

- [ ] **Step 9: Full test pass + commit**

```bash
bun test components lib/email lib/charts
git add components/charts/SeasonalRadialChart.tsx \
  lib/email/spec-to-png.ts lib/email/spec-to-png.test.ts \
  lib/email/reshape-chart-type.ts lib/email/reshape-chart-type.test.ts
git commit -m "feat(charts): seasonal-radial PNG renderer via recharts SSR bridge + picker option (Phase B2b)"
```

---

### Task 7: Phase B3 — ECharts SSR research spike (RULE 0.4, blocking gate before any corridor-scatter code)

**Files:**
- Modify: `SESSION_LOG.md` (findings, per RULE 0.4 step 2)

No code changes in this task — CLAUDE.md RULE 0.4 requires vendor-surface verification IN-SESSION via crawl4ai before writing any code against the ECharts SSR API. `CorridorMarketScatter.tsx` is also structurally different from the other 4 frames: it's fully client-only (`useEffect`, `echarts.init(realDOMContainer)`, GSAP `ScrollTrigger`, a live `ResizeObserver`) — there is no `initialDimension`-style prop to lean on like recharts' `ResponsiveContainer`. ECharts' own SSR mode (`ssr: true` at init + `renderToSVGString()`) is a genuinely different API surface than anything used elsewhere in this codebase, so this must be confirmed against current docs, not assumed from training memory.

- [ ] **Step 1: Run the crawl4ai research pass**

```bash
crawl4ai https://echarts.apache.org/en/tutorial.html#Server%20Side%20Rendering
```

If that anchor 404s or redirects, fall back to a search-first pass:

```bash
crawl4ai "https://echarts.apache.org/handbook/en/how-to/cross-platform/server/"
```

Capture the EXACT verbatim API: the `echarts.init(null, null, { ssr: true, width, height })` (or current equivalent) call signature, whether `renderToSVGString()` exists on the returned chart instance today, any required polyfills (`echarts` SSR mode historically needed `document`/`window` shims removed or a `renderer: 'svg'` option), and the currently-documented Node/version compatibility notes.

- [ ] **Step 2: Write findings to `SESSION_LOG.md`**

Append a new top-of-file entry documenting the verbatim API found (or the discovery that it's changed/deprecated/requires a different package), per RULE 0.4 step 2 ("write findings to SESSION_LOG.md so the next session inherits evidence, not guesses"). Do not proceed to Task 8 until this entry exists.

- [ ] **Step 3: Decide feasibility and hand off to Task 8**

If the verified API supports a clean headless SVG string render server-side: proceed to Task 8 with the exact call shape now known.
If it does NOT (e.g., requires a canvas-based renderer incompatible with server SVG output, or the feature was removed): stop, do not fabricate a workaround — flag to the operator that `corridor-scatter`'s PNG renderer needs a different approach (e.g., a `resvg`-unrelated static screenshot pipeline, or descoping to "picker option ships, PNG stays unsupported until a real path exists") rather than shipping fabricated/broken code. This is a legitimate stopping point per RULE 0.7 (never invent a number) applied to rendering technique, not just data.

---

### Task 8: Phase B3 — `corridor-scatter` PNG renderer + picker wiring (contingent on Task 7's findings)

**Files:**
- Create: `lib/charts/svg/corridor-scatter.ts` (or the alternate approach Task 7 identifies)
- 🔴 Modify: `lib/email/spec-to-png.ts`
- 🔴 Modify: `lib/email/reshape-chart-type.ts`
- Test: `lib/charts/svg/corridor-scatter.test.ts` (new)
- 🔴 Test: `lib/email/spec-to-png.test.ts`
- 🔴 Test: `lib/email/reshape-chart-type.test.ts`

**Interfaces:**
- Consumes: `JoinedCorridorRow[]` (existing, `types/viz.ts:53`) — the SAME shape `CorridorMarketScatter.tsx` and `scatterChartSpecFromRows` (`lib/build-chart-for-intent.mts:352`) already produce/consume.
- Per the open design decision: this gate is **live-reachable passthrough** today — `buildChartForIntent`'s `corridor-scatter` case already emits `frameId: "corridor-scatter"` specs with real data, so this is the one Phase-B type (besides `composition`) that can actually produce something other than the bar fallback through the Email Lab picker right now.

Exact code for the builder depends on Task 7's verified API and is intentionally not written here — writing it now would violate RULE 0.4 (verify before code). Once Task 7 confirms the API:

- [ ] **Step 1: Write the failing pure-builder test** (structure only — fill in the exact ECharts SSR call from Task 7's findings)

```typescript
import { test, expect } from "bun:test";
import { corridorScatterSvg } from "./corridor-scatter";
import type { JoinedCorridorRow } from "@/types/viz";

const rows: JoinedCorridorRow[] = [
  {
    id: "us41-downtown-ftm",
    name: "US 41 - Downtown Fort Myers",
    submarket: "Fort Myers",
    nnn_asking_rent_per_sqft: 28.5,
    vacancy_pct: 6.2,
    absorption_sqft: 12000,
    permits: { corridor_id: "us41-downtown-ftm", headline_z: 1.4, n_current: 22, last_refined_at: "2026-06-01" },
    centroid: null,
  },
  {
    id: "sr82-corkscrew",
    name: "SR 82 - Corkscrew",
    submarket: "Lehigh Acres",
    nnn_asking_rent_per_sqft: 18.2,
    vacancy_pct: 9.8,
    absorption_sqft: 4200,
    permits: { corridor_id: "sr82-corkscrew", headline_z: -0.6, n_current: 9, last_refined_at: "2026-06-01" },
    centroid: null,
  },
];

test("corridorScatterSvg renders a real scatter SVG from paired vacancy/rent data", async () => {
  const svg = await corridorScatterSvg(rows, { title: "Corridor market scatter", source: "cre-swfl / permits-swfl", asOf: "2026-06-30" });
  expect(svg).not.toBeNull();
  expect(svg).toContain("<svg");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test lib/charts/svg/corridor-scatter.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `corridorScatterSvg` per Task 7's verified ECharts SSR API**

Build the `option` object from the SAME field mapping `CorridorMarketScatter.tsx` uses (`vacancy_pct` → x, `nnn_asking_rent_per_sqft` → y, `permits.headline_z` → color intensity via `intensityFromZ`) but WITHOUT the GSAP entrance animation, `ResizeObserver`, or click-to-select side panel (those are client-only interaction affordances with no email equivalent — the email PNG is a static snapshot of the scatter itself). Filter to rows with non-null `nnn_asking_rent_per_sqft`/`vacancy_pct`/`permits`, matching `CorridorMarketScatter`'s existing `cleanData` filter. Call the verified `echarts.init(..., { ssr: true })` + `renderToSVGString()` (or documented equivalent) from Task 7, wrap in a `<rect>` background + chrome `<text>` matching the existing pattern (`bklitTrendSvg`'s chrome style).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test lib/charts/svg/corridor-scatter.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `spec-to-png.ts`, add picker label + live passthrough gate**

```typescript
  { type: "corridor-scatter", label: "Corridor scatter" },
```

```typescript
    case "corridor-scatter":
      // PASSTHROUGH, live-reachable: buildChartForIntent's corridor-scatter
      // case (lib/build-chart-for-intent.mts:400) already emits this exact
      // frameId with real JoinedCorridorRow[] data when a question routes
      // there — unlike the other 4 Phase-B types, this one isn't waiting on
      // a future producer.
      return spec.frameId === "corridor-scatter";
```

- [ ] **Step 6: Write the failing reshape test, verify it passes**

```typescript
test("PASSTHROUGH: a spec already frameId corridor-scatter stays corridor-scatter (buildChartForIntent already emits this shape live)", () => {
  const already: ChartSpec = { ...usdSpec, frameId: "corridor-scatter" };
  expect(reshapeChartToType(already, "corridor-scatter")).toBe(already);
});
```

- [ ] **Step 7: Full test + typecheck pass, then commit**

```bash
bun test lib/charts/svg/corridor-scatter.test.ts lib/email/spec-to-png.test.ts lib/email/reshape-chart-type.test.ts
bunx tsc --noEmit
git add lib/charts/svg/corridor-scatter.ts lib/charts/svg/corridor-scatter.test.ts \
  lib/email/spec-to-png.ts lib/email/spec-to-png.test.ts \
  lib/email/reshape-chart-type.ts lib/email/reshape-chart-type.test.ts
git commit -m "feat(charts): corridor-scatter PNG renderer via verified ECharts SSR API + live-reachable picker option (Phase B3)"
```

---

### Task 9: Full regression pass + close the check

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun test`
Expected: PASS — no regressions across any of the 12 frames or their existing consumers (`build-doc.ts`'s callers, `chart-coherence.test.ts`'s author-time template audit).

- [ ] **Step 2: Run the project's build/typecheck gate**

Run: `bunx next build` (per this session's operator memory: verify with `next build`, not `npx tsc`, since that's the gate that actually catches RSC/prerender issues this codebase has hit before).
Expected: PASS.

- [ ] **Step 3: Manual picker smoke check**

Start the dev server and open `/email-lab`; confirm all 12 chart-type buttons now render in the "Chart type" row (Auto + 12, previously Auto + 5). Select each of the 5 Phase-B types on a sample bar-table doc and confirm either a real render (`composition`, `corridor-scatter` when the underlying question already routed there) or the "showed a bar instead" fallback note (the other 3, expected today per the open design decision).

- [ ] **Step 4: Close the check**

```bash
node scripts/check.mjs close chart_picker_parity_live_verify
```

- [ ] **Step 5: SESSION_LOG entry + push**

Append a SESSION_LOG.md entry summarizing: 12/12 frames now picker-selectable, which 2 of the 5 new types are live-reachable today (`composition` via fabrication, `corridor-scatter` via passthrough) vs. which 3 are correct-but-cosmetic pending a future producer (`z-gauge`, `seasonal-radial`, `storm-timeline`), and the seasonal-radial spec-vs-code discrepancy found during planning. Then run `node scripts/safe-push.mjs` (ask the operator first, per standing instructions — do not push autonomously).

---

## Non-goals (unchanged from the spec)

- Not migrating `EmailChartSpec` (outreach/listing-flyer) — tracked as `retire_emailchartspec_outreach`.
- Not touching the social composer — that's `docs/superpowers/specs/2026-07-11-social-chart-registry-design.md`.
- Not changing `CHART_REGISTRY`'s `fixtureOnly` semantics.
- Not wiring `assertHeroChartCoherence` into `buildPromptChart` — that function exists and is tested (`lib/deliverable/chart-coherence.ts`) but is NOT yet called from `build-doc.ts` (confirmed via grep — only `SESSION_LOG.md`/spec docs/its own test reference it). This build's job is simply to not add a bypass; since every new case lives inside the SAME `chartSpecToEmailSvg` switch the 7 existing frames already go through, no new seam is created. The wiring itself belongs to whatever build implements `docs/superpowers/specs/2026-07-11-deliverable-coherence-gate-design.md`.

---

## Parallel Safety

> Tasks sharing a color badge touch overlapping files and **cannot run in parallel**.

| Group | Tasks | Shared Files |
|-------|-------|--------------|
| 🔴 | Task 2, Task 3, Task 4, Task 5, Task 6, Task 8 | `lib/email/reshape-chart-type.ts`, `lib/email/reshape-chart-type.test.ts`, `lib/email/spec-to-png.ts`, `lib/email/spec-to-png.test.ts` |

Tasks with no color badge have no file conflicts — safe to parallelize freely.
