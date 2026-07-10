"use client";

import { LineChart } from "./vendor/bklit/line-chart";
import { Line } from "./vendor/bklit/line";
import { Grid } from "./vendor/bklit/grid";
import { XAxis } from "./vendor/bklit/x-axis";
import { ChartTooltip } from "./vendor/bklit/tooltip";
import { ProjectionLine } from "./vendor/bklit/projection-line";
import { buildProjectionPath } from "./vendor/bklit/projection-utils";
import { ReferenceArea } from "./vendor/bklit/reference-area";
import type { ChartRow } from "@/types/viz";
import { projectTierTrend } from "@/lib/charts/tier-projection-series";
import { formatAsOf } from "@/lib/charts/format";

export interface TierProjectionChartProps {
  /** {month, luxury_index, starter_index} rows (mapTierIndexed). */
  data: ChartRow[];
  asOf?: string; // "YYYY-MM"
  error?: string | null;
  className?: string;
}

const LUXURY = "#3DC9C0"; // gulf-teal (matches TIER_INDEXED_SERIES)
const STARTER = "#5bc97a"; // mangrove

/**
 * Luxury vs. starter indexed tracks with a 6-month linear look-ahead. Solid
 * lines are the published monthly medians; the dashed segments extrapolate each
 * tier's trailing-12-month least-squares trend (projectTierTrend — deterministic
 * math, no LLM). The [INFERENCE] caption below the plot carries the tag, the
 * audited base values, and the falsifier — required visible copy for any
 * projection (rules of engagement). Null (panel hidden) on loader error or
 * under 24 months.
 */
export function TierProjectionChart({
  data,
  asOf,
  error,
  className = "",
}: TierProjectionChartProps) {
  if (error || data.length < 24) return null;

  const rows = data
    .filter((r) => typeof r.luxury_index === "number" && typeof r.starter_index === "number")
    .map((r) => ({
      date: new Date(`${r.month}-01T00:00:00Z`),
      luxury_index: r.luxury_index as number,
      starter_index: r.starter_index as number,
    }));
  const projection = projectTierTrend(data);
  if (rows.length < 24 || !projection) return null;

  const anchorDate = rows[rows.length - 1].date;
  const luxPath = buildProjectionPath({
    sourceData: rows,
    seriesKey: "luxury_index",
    mode: "target",
    pathDensity: "endpoints",
    horizonPoints: projection.horizonMonths,
    endValue: projection.luxuryEnd,
  });
  const starPath = buildProjectionPath({
    sourceData: rows,
    seriesKey: "starter_index",
    mode: "target",
    pathDensity: "endpoints",
    horizonPoints: projection.horizonMonths,
    endValue: projection.starterEnd,
  });

  const fmt = (v: number) => Math.round(v);

  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}
    >
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">
        Luxury vs. Starter Home Price Index — With a 6-Month Look Ahead
      </h3>
      <p className="text-sm text-gray-500">
        Each tier set to 100 in Jan 2019. Solid lines are Zillow&apos;s published monthly medians;
        dashed segments are a projection.
      </p>
      <div className="mt-4 h-72">
        <LineChart data={rows} aspectRatio="" className="h-full">
          <Grid horizontal />
          <ReferenceArea x1={anchorDate} fill="#F0EDE6" fillOpacity={0.04} strokeStyle="dashed" />
          <Line dataKey="luxury_index" stroke={LUXURY} strokeWidth={2} />
          <Line dataKey="starter_index" stroke={STARTER} strokeWidth={2} />
          <ProjectionLine data={luxPath} stroke={LUXURY} strokeDasharray="2,5" showEndMarker />
          <ProjectionLine data={starPath} stroke={STARTER} strokeDasharray="2,5" showEndMarker />
          <XAxis />
          <ChartTooltip
            rows={(point) => [
              {
                color: LUXURY,
                label: "Luxury homes",
                value: fmt(typeof point.luxury_index === "number" ? point.luxury_index : 0),
              },
              {
                color: STARTER,
                label: "Starter homes",
                value: fmt(typeof point.starter_index === "number" ? point.starter_index : 0),
              },
            ]}
          />
        </LineChart>
      </div>
      <p className="mt-3 text-xs text-gray-400">
        [INFERENCE] The dashed segments extend each tier&apos;s trailing-12-month linear trend{" "}
        {projection.horizonMonths} months past the last published month: luxury{" "}
        {fmt(projection.luxuryLatest)} → {fmt(projection.luxuryEnd)}, starter{" "}
        {fmt(projection.starterLatest)} → {fmt(projection.starterEnd)}. Falsifier: two consecutive
        months of slope reversal in either tier&apos;s published series breaks this projection.
      </p>
      <p className="mt-2 text-xs text-gray-500 font-mono">
        {asOf ? `as of ${formatAsOf(asOf)} · ` : ""}Zillow Home Value Index (ZHVI), price-tier cuts
      </p>
    </div>
  );
}
