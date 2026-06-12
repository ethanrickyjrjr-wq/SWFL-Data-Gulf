/**
 * ChartSpec — the declarative chart contract for the Presentation Deliverable
 * Engine (Phase 2a). A typed SUPERSET of `ChartBlock` (the brain-output chart
 * primitive), NOT Vega-Lite — see `DECISION-engine.md`.
 *
 * The anti-handcuff core: every chart is one `ChartSpec` carrying its `frameId`,
 * and `CHART_REGISTRY[frameId]` resolves the React component that renders it.
 * Adding a chart = one frame file + one registry entry — never code surgery in a
 * dispatch switch (the thing this replaces: the hardcoded scope router in
 * `lib/build-chart-for-intent.mts`).
 *
 * `asOf` / `source` are INHERITED from `ChartBlock` (Phase 1 keystone) — they
 * are PROVENANCE (presence/shape-checked only, never content-policed) and are
 * deliberately NOT re-declared here.
 */
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

/**
 * Brand theming resolved at render time. Phase 6 fills this from the project's
 * branding; until then frames fall back to their built-in palette.
 */
export interface ChartTheme {
  primary?: string;
  accent?: string;
  logoUrl?: string;
}

/**
 * The coarse shape of the data a frame consumes — declared on each registry
 * entry's `accepts`. NOTE: `pickFramesForData` (Phase 2g) does NOT read
 * `accepts`; it returns one frameId from a hardcoded priority ladder. `accepts`
 * is descriptive metadata only. The `seasonal-radial`/`zhvi-area` `time-series`
 * overlap is defused by `FrameDef.fixtureOnly`: seasonal-radial is fixture-only,
 * and both the picker and the deliverable binder drop fixture-only frames via
 * `isFixtureOnly()` — so even a future `accepts`-matching picker can't surface it.
 */
export type DataShape =
  | "time-series"
  | "ranked-categories"
  | "relationship"
  | "composition"
  | "single-vs-target"
  | "timeline";

export interface ChartSpec extends ChartBlock {
  /** Which registry frame renders this spec (`CHART_REGISTRY[frameId]`). */
  frameId: string;
  /** Primary/accent/logo — resolved at render (Phase 6 fills it). */
  theme?: ChartTheme;
  /**
   * Compact sizing hint for space-constrained surfaces (the in-page chat dock).
   * Currently honored only by `ChartBlockFrame` → `ChartBlockView`; other frames
   * ignore it. Threads through `blockToSpec(block, theme?, compact?)`.
   */
  compact?: boolean;
  /**
   * Per-frame knobs: series keys, axis labels, and — for frames that wrap a
   * component taking a raw data array (ZHVI, scatter) — the data itself under
   * `options.data`. The frame wrapper is the only place that reads these.
   */
  options?: Record<string, unknown>;
}
