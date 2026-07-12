"use client";

import { BarChart } from "./vendor/bklit/bar-chart";
import { Bar } from "./vendor/bklit/bar";
import { Grid } from "./vendor/bklit/grid";
import type { PriceBandsData } from "@/lib/desk/types";

/**
 * Price-band affordability histogram for /desk. Counts come from
 * `data_lake.listing_price_bands` (aggregated in SQL — the loader never hauls
 * raw listing rows) and reconcile with the desk's Active-listings KPI by
 * construction (identical filter set). The vendored XAxis is date-hardwired
 * (time-series shell), so band labels + counts render as our own HTML row —
 * same treatment ZipMomentumHeatmap uses. Explicit fill: this app defines no
 * --chart-N CSS vars (NOTICE.md caveat).
 */
export function PriceBandHistogram({ bands }: { bands: PriceBandsData }) {
  const data = bands.bands.map((b) => ({ name: b.band, count: b.count }));
  const cols = bands.bands.length;
  return (
    <div>
      <BarChart
        data={data}
        xDataKey="name"
        aspectRatio="5 / 2"
        margin={{ top: 8, right: 0, bottom: 4, left: 0 }}
        barGap={0.25}
      >
        <Grid horizontal stroke="rgba(255,255,255,0.06)" />
        <Bar dataKey="count" fill="#3DC9C0" lineCap={3} />
      </BarChart>
      <div
        className="mt-2 grid gap-1 text-center"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {bands.bands.map((b) => (
          <div key={b.band} className="min-w-0">
            <p className="font-mono text-xs text-gray-300 tabular-nums">
              {b.count.toLocaleString()}
            </p>
            <p className="text-[10px] text-gray-500">{b.band}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        {bands.total.toLocaleString()} active listings across all asking-price bands, Lee + Collier
      </p>
    </div>
  );
}
