"use client";

import { FrameRenderer } from "@/components/charts/registry/FrameRenderer";
import { getFrame } from "@/components/charts/registry/registry";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import { ChartUnavailable } from "./ChartUnavailable";

/**
 * The dock's single chart render path. The live chart arrives from the SSE
 * stream as a ready `ChartSpec` (built server-side by `buildChartForIntent`),
 * so there is NO normalization here — only a guard: a spec with a missing or
 * unknown `frameId` degrades to `<ChartUnavailable>` + a console error rather
 * than crashing the chat session or rendering a silent blank.
 *
 * `compact` is threaded onto the spec so the bar/table frame keeps its
 * space-constrained sizing inside the dock (other frames ignore it).
 */
export function DockChart({ spec, compact = false }: { spec: unknown; compact?: boolean }) {
  const s = spec as ChartSpec | null;
  if (!s || typeof s !== "object" || typeof s.frameId !== "string" || !s.frameId) {
    console.error("[DockChart] chart spec missing frameId", spec);
    return <ChartUnavailable reason="chart spec missing frameId" />;
  }
  if (!getFrame(s.frameId)) {
    console.error("[DockChart] unknown frameId", s.frameId);
    return <ChartUnavailable reason={`unknown frame '${s.frameId}'`} />;
  }
  return <FrameRenderer spec={{ ...s, compact }} />;
}

export default DockChart;
