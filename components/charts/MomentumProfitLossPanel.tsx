"use client";

import { curveLinear } from "@visx/curve";
import { LineChart } from "./vendor/bklit/line-chart";
import { Line } from "./vendor/bklit/line";
import { Grid } from "./vendor/bklit/grid";
import { XAxis } from "./vendor/bklit/x-axis";
import { ChartTooltip } from "./vendor/bklit/tooltip";
import { ProfitLossLine } from "./vendor/bklit/profit-loss-line";
import type { ChartRow } from "@/types/viz";
import { formatAsOf } from "@/lib/charts/format";

export interface MomentumProfitLossPanelProps {
  /** {month, cape_coral, fort_myers, naples} YoY % rows (mapPivotedCityYoY). */
  data: ChartRow[];
  asOf?: string; // "YYYY-MM"
  error?: string | null;
  className?: string;
}

const POSITIVE = "#5bc97a"; // mangrove
const NEGATIVE = "#E08158"; // sunset-coral — never stock-market red/green

const METROS = [
  { key: "cape_coral", label: "Cape Coral" },
  { key: "fort_myers", label: "Fort Myers" },
  { key: "naples", label: "Naples" },
] as const;

/**
 * YoY home-value momentum as sign-colored small multiples — one mini chart per
 * metro (Profit/Loss Line is single-series; three multiples beat one averaged
 * composite, which would hide the per-metro story). Hidden `Line` registers the
 * series for y-domain/tooltip; `Grid highlightRowValues={[0]}` draws the
 * break-even baseline (verbatim upstream usage). Returns null (panel hidden)
 * on loader error or under 13 months — never sample data.
 */
export function MomentumProfitLossPanel({
  data,
  asOf,
  error,
  className = "",
}: MomentumProfitLossPanelProps) {
  if (error || data.length < 13) return null;

  const perMetro = METROS.map((m) => ({
    ...m,
    rows: data
      .filter((r) => typeof r[m.key] === "number")
      .map((r) => ({ date: new Date(`${r.month}-01T00:00:00Z`), pnl: r[m.key] as number })),
  }));

  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}
    >
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">Home Value Year-Over-Year Growth</h3>
      <p className="text-sm text-gray-500">
        Yearly change in each metro&apos;s typical home value — green above zero, coral below; the
        sign flip is the story
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {perMetro.map((m) => (
          <div key={m.key}>
            <p className="text-xs font-mono text-gray-400">{m.label}</p>
            <div className="mt-1 h-44">
              {/* aspectRatio="" (falsy, non-undefined) skips the "2 / 1" default so the
                  chart fills the sized h-44 parent instead. */}
              <LineChart data={m.rows} aspectRatio="" className="h-full">
                <Grid horizontal highlightRowValues={[0]} />
                <Line
                  curve={curveLinear}
                  dataKey="pnl"
                  fadeEdges={false}
                  showHighlight={false}
                  stroke="transparent"
                  strokeWidth={0}
                />
                <ProfitLossLine dataKey="pnl" positiveColor={POSITIVE} negativeColor={NEGATIVE} />
                <XAxis />
                <ChartTooltip
                  rows={(point) => {
                    const value = typeof point.pnl === "number" ? point.pnl : 0;
                    return [
                      {
                        color: value >= 0 ? POSITIVE : NEGATIVE,
                        label: "YoY change",
                        value: `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`,
                      },
                    ];
                  }}
                />
              </LineChart>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500 font-mono">
        {asOf ? `as of ${formatAsOf(asOf)} · ` : ""}Zillow Home Value Index (ZHVI)
      </p>
    </div>
  );
}
