"use client";

import Image from "next/image";
import { HelpCircle } from "lucide-react";
import { RingChart } from "./vendor/bklit/ring-chart";
import { Ring } from "./vendor/bklit/ring";
import { RingCenter } from "./vendor/bklit/ring-center";
import {
  HURRICANE_CATEGORY_BUCKETS,
  HURRICANE_TOTAL_STORMS_30YR,
  HURRICANE_SERIES_SOURCE,
} from "@/lib/charts/hurricane-series";

export interface HurricaneRingChartProps {
  className?: string;
}

// This app's Tailwind theme (app/globals.css) has no shadcn-style chart CSS
// vars (--chart-1..5, --border, --muted) — the vendored Ring component reads
// `--border` for each ring's background track. Scope it locally rather than
// touching the global theme (see vendor/bklit/NOTICE.md).
const RING_TRACK_VARS = { "--border": "rgba(240,237,230,0.08)" } as React.CSSProperties;

/**
 * SWFL hurricane category rings — distinct named storms passing within 50
 * statute miles of Lee/Collier/Hendry, trailing 30-year window (1996-2025),
 * bucketed by peak Saffir-Simpson category. One ring per category, innermost
 * (calmest) to outermost (most severe), each ring's fill share against the
 * 30-year corpus total. Real NOAA HURDAT2 data — see lib/charts/hurricane-series.ts.
 */
export function HurricaneRingChart({ className = "" }: HurricaneRingChartProps) {
  const ringData = HURRICANE_CATEGORY_BUCKETS.map((b) => ({
    label: b.label,
    value: b.count,
    maxValue: HURRICANE_TOTAL_STORMS_30YR,
    color: b.color,
  }));

  return (
    <div
      className={`p-4 sm:p-6 rounded-2xl bg-[#0f1d24] border border-[#22414f] text-[#f0ede6] shadow-xl select-none ${className}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Image
          src="/logo.png"
          alt=""
          aria-hidden
          width={14}
          height={14}
          className="h-3.5 w-3.5 rounded opacity-60"
        />
        <span className="text-xs font-mono font-medium uppercase tracking-wider text-gulf-teal">
          SWFL Data Gulf · Southwest Florida
        </span>
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-[#f0ede6] mt-1">
        Hurricane Impact by Category
      </h2>
      <p className="text-sm text-[#807e76] mt-0.5">
        Named storms within 50 miles of Lee · Collier · Hendry — trailing 30 years (1996-2025)
      </p>

      {/* Rings + legend */}
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10 mt-6 bg-[#0a1419]/20 rounded-xl border border-[#22414f]/40 p-4 sm:p-6">
        <div
          className="flex-none w-[220px] h-[220px] sm:w-[260px] sm:h-[260px]"
          style={RING_TRACK_VARS}
        >
          <RingChart data={ringData} strokeWidth={14} ringGap={5} baseInnerRadius={40}>
            {ringData.map((_, i) => (
              <Ring key={HURRICANE_CATEGORY_BUCKETS[i].category} index={i} />
            ))}
            <RingCenter defaultLabel="Storms · 30yr" />
          </RingChart>
        </div>

        <div className="flex-1 w-full space-y-2">
          {HURRICANE_CATEGORY_BUCKETS.map((b) => (
            <div key={b.category} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-[#b8b4a8]">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: b.color }}
                />
                {b.label}
              </span>
              <span className="font-mono font-bold text-[#f0ede6] tabular-nums">
                {b.count}
                <span className="text-[#807e76] font-normal"> / {HURRICANE_TOTAL_STORMS_30YR}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-start gap-2 mt-4 bg-[#0a1419]/20 p-3 rounded-lg border border-[#22414f]/30 text-xs text-[#807e76]">
        <HelpCircle className="h-4 w-4 text-[#807e76] mt-0.5 flex-shrink-0" />
        <span>
          Hover a ring to see its category and count. Cat 1/3/5 read zero — a real absence in this
          30-year corpus, not missing data.
        </span>
      </div>
      <p className="mt-2 font-mono text-[11px] tracking-wide text-[#807e76]">
        {HURRICANE_SERIES_SOURCE.citation} · as of {HURRICANE_SERIES_SOURCE.asOf}
      </p>
    </div>
  );
}
