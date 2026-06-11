import { ChartBlockView } from "@/components/charts/ChartBlockView";
import type { ChartSpec } from "../chart-spec";

/**
 * Generic bar / table frame. `ChartSpec` extends `ChartBlock`, so the spec is a
 * valid `block` — `ChartBlockView` reads only the `ChartBlock` fields (title,
 * columns, rows, chart_type, value_format, asOf, source) and picks bar vs table
 * internally. The registry adapter seam: the underlying view never knows about
 * `ChartSpec`.
 */
export function ChartBlockFrame({ spec }: { spec: ChartSpec }) {
  return <ChartBlockView block={spec} />;
}
