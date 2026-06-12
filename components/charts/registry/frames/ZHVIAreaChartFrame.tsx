import { ZHVIAreaChart } from "@/components/charts/ZHVIAreaChart";
import type { ZHVITrendEntry } from "@/types/viz";
import type { ChartSpec } from "../chart-spec";

/**
 * Adapter for `ZHVIAreaChart`, which takes a raw `ZHVITrendEntry[]` (not a
 * `ChartSpec`). Thin by contract: pull `options.data`, forward `asOf`, nothing
 * else. The underlying component stays `ChartSpec`-agnostic.
 */
export function ZHVIAreaChartFrame({ spec }: { spec: ChartSpec }) {
  const data = (spec.options?.data ?? []) as ZHVITrendEntry[];
  return <ZHVIAreaChart data={data} asOf={spec.asOf} />;
}
