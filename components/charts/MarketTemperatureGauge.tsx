"use client";

import { Gauge } from "./vendor/bklit/gauge";
import type { MarketTempGaugeData } from "@/lib/charts/market-temperature-series";
import { formatAsOfDate } from "@/lib/charts/format";

export interface MarketTemperatureGaugeProps {
  gauge: MarketTempGaugeData;
  className?: string;
}

const GULF_TEAL = "#3DC9C0";
const TRACK = "rgba(240,237,230,0.10)";

/**
 * Regional market-temperature dial: median realtor.com market hotness (0–100)
 * across scored SWFL ZIPs. Deterministic — the median is computed in
 * mapMarketTemperature; this component only draws it. Explicit fills (this app
 * defines no shadcn chart CSS vars — see vendor/bklit/NOTICE.md).
 */
export function MarketTemperatureGauge({ gauge, className = "" }: MarketTemperatureGaugeProps) {
  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}
    >
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">Market Temperature</h3>
      <p className="text-sm text-gray-500">
        Median market hotness — 0 (cold) to 100 (hot) — across {gauge.zipCount} Lee &amp; Collier
        ZIP codes
      </p>
      <div className="mt-4 mx-auto max-w-md">
        <Gauge
          value={gauge.medianHotness}
          centerValue={gauge.medianHotness}
          defaultLabel="of 100 · market hotness"
          formatOptions={{ maximumFractionDigits: 1 }}
          activeFill={GULF_TEAL}
          inactiveFill={TRACK}
          inactiveFillOpacity={1}
          spacing={25}
        />
      </div>
      <p className="mt-3 text-xs text-gray-500 font-mono">
        {gauge.asOf ? `as of ${formatAsOfDate(gauge.asOf)} · ` : ""}realtor.com monthly ZIP
        aggregates
      </p>
    </div>
  );
}
