import { SeasonalRadialChart } from "@/components/charts/SeasonalRadialChart";
import type { SeasonalRadialEntry } from "@/types/viz";
import type { ChartSpec } from "../chart-spec";

/**
 * Adapter for `SeasonalRadialChart`, which takes a raw `SeasonalRadialEntry[]`
 * (not a `ChartSpec`). Thin by contract: pull `options.data`, forward `asOf`,
 * nothing else. The underlying component stays `ChartSpec`-agnostic.
 */
export function SeasonalRadialFrame({ spec }: { spec: ChartSpec }) {
  const data = (spec.options?.data ?? []) as SeasonalRadialEntry[];
  return <SeasonalRadialChart data={data} asOf={spec.asOf} />;
}
