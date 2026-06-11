import { CorridorMarketScatter } from "@/components/viz/CorridorMarketScatter";
import type { JoinedCorridorRow } from "@/types/viz";
import type { ChartSpec } from "../chart-spec";

/**
 * Adapter for `CorridorMarketScatter`, which takes a raw `JoinedCorridorRow[]`
 * (not a `ChartSpec`). Thin by contract: pull `options.data`, forward `asOf`,
 * nothing else. The underlying component stays `ChartSpec`-agnostic.
 */
export function CorridorMarketScatterFrame({ spec }: { spec: ChartSpec }) {
  const data = (spec.options?.data ?? []) as JoinedCorridorRow[];
  return <CorridorMarketScatter data={data} asOf={spec.asOf} />;
}
