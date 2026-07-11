"use client";

import { Gauge } from "@/components/charts/vendor/bklit/gauge";
import type { DeskDatum } from "@/lib/desk/types";

const GOLD = "#d4b370";
const TRACK = "rgba(240,237,230,0.10)";

/**
 * Price-cut pressure dial — the share of active listings carrying a price
 * reduction, 0–100%. Same vendored Gauge as the market-temperature dial so
 * the cluster reads as one instrument bank.
 */
export function DeskGaugePanel({ datum }: { datum: DeskDatum }) {
  return (
    <div className="rounded-2xl border border-[#22414f] bg-[#0f1d24] p-4 text-[#f0ede6] sm:p-6">
      <p className="text-xs uppercase tracking-wider text-gray-400">Southwest Florida</p>
      <h3 className="mt-1 text-lg font-semibold">Price-Cut Pressure</h3>
      <p className="text-sm text-gray-500">{datum.label}</p>
      <div className="mx-auto mt-4 max-w-md">
        <Gauge
          value={datum.value}
          centerValue={datum.value}
          defaultLabel="% of active listings"
          formatOptions={{ maximumFractionDigits: 1 }}
          activeFill={GOLD}
          inactiveFill={TRACK}
          inactiveFillOpacity={1}
          spacing={25}
        />
      </div>
      <p className="mt-3 font-mono text-xs text-gray-500">
        {datum.asOf ? `as of ${datum.asOf} · ` : ""}
        {datum.sourceLabel}
      </p>
    </div>
  );
}
