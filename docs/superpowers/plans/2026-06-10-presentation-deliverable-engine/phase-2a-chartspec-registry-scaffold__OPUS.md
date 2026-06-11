# Phase 2a — ChartSpec registry scaffold · OPUS · SERIAL, EXCLUSIVE (type seam)

> **STATUS: ✅ SHIPPED + PUSHED 2026-06-11.** Files under `components/charts/registry/`. 2b–2f are now
> UNBLOCKED. Exact shipped field names + the add-a-frame recipe are in the **§SHIPPED — hand-off to
> 2b–2f** block at the bottom of this file.

> **Contract (inherited):** own ChartSpec registry extending `ChartBlock` (not Vega-Lite); per-visual
> as-of; NO `git push`. **This defines the `ChartSpec` type every Phase-2 frame imports — run EXCLUSIVE;
> the 5 frame ports (2b–2f) start only AFTER this lands.**

## Why
The hardcoded 4-scope chat router doesn't scale. Replace it with a **registry**: a typed declarative
spec + a `frameId → component` map. Then each new chart is one file in one folder, instantly available
to every project and template. This is the anti-handcuff core (`DECISION-engine.md`).

## Depends on
Phase 1 (uses the `asOf`/`source` fields now on `ChartBlock`).

## Task
1. Create `components/charts/registry/` with:
   - **`chart-spec.ts`** — `ChartSpec`, a **superset of `ChartBlock`** (import `type ChartBlock` from
     `refinery/validate/chart-block-lint.mts`, NOT `refinery/types`). Add at minimum:
     ```ts
     export interface ChartSpec extends ChartBlock {
       frameId: string;                 // which registry frame renders this
       // asOf: string — inherited from ChartBlock (Phase 1); do NOT re-declare
       // source?: {...} — inherited from ChartBlock (Phase 1); do NOT re-declare
       theme?: ChartTheme;              // primary/accent/logo — resolved at render (Phase 6 fills it)
       options?: Record<string, unknown>; // per-frame knobs (series keys, axis labels, etc.)
     }
     export interface ChartTheme { primary?: string; accent?: string; logoUrl?: string; }
     export type DataShape = "time-series" | "ranked-categories" | "relationship" | "composition" | "single-vs-target" | "timeline";
     ```
   - **`registry.ts`** — `export const CHART_REGISTRY: Record<string, FrameDef>` where
     ```ts
     interface FrameDef { component: React.ComponentType<{ spec: ChartSpec }>; accepts: DataShape[]; label: string; }
     ```
     Register the **already-built** frames first: the generic `ChartBlockView`/`HBarChart` bar+table,
     `ZHVIAreaChart` (area/time-series), `CorridorMarketScatter` (scatter/relationship — UI-Kit #01).

   > **CONFIRMED CONSTRAINT — do NOT skip:** `ZHVIAreaChart` (`components/viz/ZHVIAreaChart.tsx`) and
   > `CorridorMarketScatter` (`components/viz/CorridorMarketScatter.tsx`) accept **raw data arrays**
   > (`ZHVITrendEntry[]` and `JoinedCorridorRow[]`), not `{ spec: ChartSpec }`. You cannot register them
   > directly as `FrameDef` — TypeScript will error. You must write **thin wrapper components** first:
   >
   > ```ts
   > // components/charts/registry/frames/ZHVIAreaChartFrame.tsx
   > import { ZHVIAreaChart } from "@/components/viz/ZHVIAreaChart";
   > import type { ChartSpec } from "../chart-spec";
   > export function ZHVIAreaChartFrame({ spec }: { spec: ChartSpec }) {
   >   const data = (spec.options?.data ?? []) as ZHVITrendEntry[];
   >   return <ZHVIAreaChart data={data} asOf={spec.asOf} />;
   > }
   >
   > // components/charts/registry/frames/CorridorMarketScatterFrame.tsx
   > export function CorridorMarketScatterFrame({ spec }: { spec: ChartSpec }) {
   >   const data = (spec.options?.data ?? []) as JoinedCorridorRow[];
   >   return <CorridorMarketScatter data={data} asOf={spec.asOf} />;
   > }
   > ```
   >
   > Register **the wrapper** (not the underlying component) in `CHART_REGISTRY`. The wrapper is the
   > adapter seam — the underlying component never knows about `ChartSpec`. Keep wrappers thin: extract
   > `spec.options.data`, forward `spec.asOf`, nothing else.
   - **`FrameRenderer.tsx`** — given a `ChartSpec`, look up `CHART_REGISTRY[spec.frameId]` and render
     its component (with an error boundary, mirroring `ReportChart.tsx`). This is the single render
     entry the assembly engine (Phase 3) and `/p/[id]` use.
2. **Do NOT delete** the existing `ChartBlockView`/component dispatch yet — wrap/adapt it so `/r/` keeps
   working. The registry is additive; migration of `/r/` onto `FrameRenderer` can be a later cleanup.

## Acceptance
- `tsc --noEmit` clean; `FrameRenderer` renders each pre-registered frame from a fixture spec.
- A unit test: every `frameId` in `CHART_REGISTRY` resolves to a component; `accepts` is non-empty.
- No change to `/r/` behavior (existing pages still render).

## Hand-off to 2b–2f
Each frame port adds ONE entry to `CHART_REGISTRY` + ONE component file. The five are independent and
parallel-safe once this file set exists. **Tell the frame builders the exact `ChartSpec` field names you
shipped** so their `options`/`source` usage matches.

## Wrap
- Commit locally. SESSION_LOG + build-queue. Update README status row 2a. **No push.**

---

## §SHIPPED — hand-off to 2b–2f (read this before porting a frame)

**Files shipped (`components/charts/registry/`):**
- `chart-spec.ts` — `ChartSpec`, `ChartTheme`, `DataShape`.
- `registry.ts` — `CHART_REGISTRY`, `FrameDef`, `getFrame(frameId)`.
- `FrameRenderer.tsx` — `<FrameRenderer spec={...} />` (error-boundary'd lookup + render).
- `frames/ChartBlockFrame.tsx`, `frames/ZHVIAreaChartFrame.tsx`, `frames/CorridorMarketScatterFrame.tsx`.
- `registry.test.ts` — 5 pure tests (no DOM by repo design).

**`ChartSpec` exact shape** (superset of `ChartBlock` — import `type ChartBlock` from
`@/refinery/validate/chart-block-lint.mts`):
```ts
interface ChartSpec extends ChartBlock {
  frameId: string;                    // which registry frame renders this
  theme?: { primary?: string; accent?: string; logoUrl?: string };
  options?: Record<string, unknown>;  // per-frame knobs; raw-array data rides at options.data
}
// inherited from ChartBlock: title, columns, rows, chart_type?, value_format?,
//   asOf (REQUIRED ISO YYYY-MM-DD), source? { citation; url? }
type DataShape = "time-series" | "ranked-categories" | "relationship"
               | "composition" | "single-vs-target" | "timeline";
```

**To add YOUR frame (one entry + one file, no surgery):**
1. `components/charts/registry/frames/<YourFrame>.tsx` — a component typed
   `({ spec }: { spec: ChartSpec }) => JSX`. If the underlying viz takes a raw data array
   (the UI-Kit pattern), read it from `spec.options?.data` and forward `spec.asOf` — keep the
   wrapper thin (this is the adapter seam; the viz never sees `ChartSpec`).
2. In `registry.ts`, add ONE `CHART_REGISTRY` entry:
   `"<frame-id>": { component: <YourFrame>, accepts: [<DataShape...>], label: "<human label>" }`.
   `accepts` MUST be non-empty (Phase 2g `pickFramesForData` maps `DataShape → frames`).
3. The registry test auto-covers your frame (it iterates `CHART_REGISTRY`); add a frame-specific
   data-shaping test next to your file if you transform `options` into the viz's array.

**Already registered (do NOT re-add):** `bar-table` (ranked-categories, generic `ChartBlockView`),
`zhvi-area` (time-series), `corridor-scatter` (relationship). The 5 UI-Kit frames cover the
remaining shapes: `composition`, `single-vs-target`, `timeline`.

**Render contract:** the assembly engine (Phase 3) + `/p/[id]` render via `<FrameRenderer spec />`,
NOT by importing your component directly. An unknown `frameId` or a render fault degrades to nothing —
never throws into a client-facing deck.
