import { ChartBlockView } from "@/components/charts/ChartBlockView";
import type { ChartSpec } from "../chart-spec";

/**
 * Generic bar / table frame. `ChartSpec` extends `ChartBlock`, so the spec is a
 * valid `block` — `ChartBlockView` reads only the `ChartBlock` fields (title,
 * columns, rows, chart_type, value_format, asOf, source) and picks bar vs table
 * internally. The registry adapter seam: the underlying view never knows about
 * `ChartSpec`. `spec.compact` (set by the dock via `blockToSpec`) threads through
 * to the view so the chat-dock chart keeps its compact sizing.
 */
export function ChartBlockFrame({ spec }: { spec: ChartSpec }) {
  return <ChartBlockView block={spec} compact={spec.compact} />;
}
