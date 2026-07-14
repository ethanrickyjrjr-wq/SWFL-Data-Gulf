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
 * Luxury vs. starter indexed tracks with a 6-month linear look-ahead. Solid lines
 * are the published monthly medians. A dashed segment extrapolates a tier's
 * trailing-12-month least-squares trend (projectTierTrend — deterministic math, no
 * LLM) ONLY WHERE THAT TREND'S DIRECTION IS ESTABLISHED: a slope whose 95% interval
 * contains zero has no readable direction, and drawing it forward would be reading a
 * sign that isn't there. So the gate is per tier — an unestablished tier keeps its
 * solid history and gets no dashed line — and the [INFERENCE] caption names only the
 * tiers actually projected, saying plainly of the other that its direction can't be
 * called. The caption carries the tag, the audited base values, and the falsifier:
 * required visible copy for any projection (rules of engagement).
 *
 * Null (panel hidden) on loader error, under 24 months, or when NEITHER tier is
 * established. The panel's whole premise is its 6-month look-ahead — its own headline
 * says so — so with nothing projectable there is no chart. Hiding is honest.
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

  // THE GATE. `projectTierTrend` computes an endpoint for every tier — that is the
  // math's job. Whether an endpoint may be DRAWN is this component's job, and the
  // answer is no unless the tier's direction is established.
  const { luxuryEstablished, starterEstablished } = projection;
  if (!luxuryEstablished && !starterEstablished) return null;

  const anchorDate = rows[rows.length - 1].date;
  const luxPath = luxuryEstablished
    ? buildProjectionPath({
        sourceData: rows,
        seriesKey: "luxury_index",
        mode: "target",
        pathDensity: "endpoints",
        horizonPoints: projection.horizonMonths,
        endValue: projection.luxuryEnd,
      })
    : null;
  const starPath = starterEstablished
    ? buildProjectionPath({
        sourceData: rows,
        seriesKey: "starter_index",
        mode: "target",
        pathDensity: "endpoints",
        horizonPoints: projection.horizonMonths,
        endValue: projection.starterEnd,
      })
    : null;

  const fmt = (v: number) => Math.round(v);

  // Only the tiers actually carried forward may be named as projections.
  const carried: string[] = [];
  if (luxuryEstablished) {
    carried.push(`luxury ${fmt(projection.luxuryLatest)} → ${fmt(projection.luxuryEnd)}`);
  }
  if (starterEstablished) {
    carried.push(`starter ${fmt(projection.starterLatest)} → ${fmt(projection.starterEnd)}`);
  }
  // At most one tier can land here — both unestablished already returned null above.
  const unread = !luxuryEstablished ? "Luxury" : !starterEstablished ? "Starter" : null;
  const inference =
    `[INFERENCE] Trailing-12-month trend carried ${projection.horizonMonths} months past the ` +
    `last published month — ${carried.join(", ")}.` +
    (unread
      ? ` ${unread}'s recent movement is too noisy to call a direction, so it is not carried forward.`
      : "") +
    ` Falsifier: two consecutive published months moving against a tier's projected direction` +
    ` breaks that tier's projection.`;

  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}
    >
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">
        Luxury vs. Starter Home Price Index — With a 6-Month Look Ahead
      </h3>
      <p className="text-sm text-gray-500">
        Each tier set to 100 in Jan 2019. Solid lines are Zillow&apos;s published monthly medians; a
        dashed segment carries a tier forward only where its trend is clear enough to read.
      </p>
      <div className="mt-4 h-72">
        <LineChart data={rows} aspectRatio="" className="h-full">
          <Grid horizontal />
          <ReferenceArea x1={anchorDate} fill="#F0EDE6" fillOpacity={0.04} strokeStyle="dashed" />
          <Line dataKey="luxury_index" stroke={LUXURY} strokeWidth={2} />
          <Line dataKey="starter_index" stroke={STARTER} strokeWidth={2} />
          {luxPath && (
            <ProjectionLine data={luxPath} stroke={LUXURY} strokeDasharray="2,5" showEndMarker />
          )}
          {starPath && (
            <ProjectionLine data={starPath} stroke={STARTER} strokeDasharray="2,5" showEndMarker />
          )}
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
      <p className="mt-3 text-xs text-gray-400">{inference}</p>
      <p className="mt-2 text-xs text-gray-500 font-mono">
        {asOf ? `as of ${formatAsOf(asOf)} · ` : ""}Zillow Home Value Index (ZHVI), price-tier cuts
      </p>
    </div>
  );
}
