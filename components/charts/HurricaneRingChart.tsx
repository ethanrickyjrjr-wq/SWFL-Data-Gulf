"use client";

import Image from "next/image";
import { HelpCircle } from "lucide-react";
import { RingChart } from "./vendor/bklit/ring-chart";
import { Ring } from "./vendor/bklit/ring";
import { RingCenter } from "./vendor/bklit/ring-center";
import {
  HURRICANE_STORM_DAMAGE,
  HURRICANE_TOTAL_NFIP_PAID_USD,
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

function formatUsdCompact(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

/**
 * SWFL hurricane damage by named storm — Charley (2004), Irma (2017), Ian
 * (2022), Helene + Milton (2024) — real FEMA NFIP claims paid, chronological
 * rings innermost to outermost. Real numbers, see lib/charts/hurricane-series.ts.
 */
export function HurricaneRingChart({ className = "" }: HurricaneRingChartProps) {
  const ringData = HURRICANE_STORM_DAMAGE.map((s) => ({
    label: `${s.name} ('${String(s.year).slice(2)})`,
    value: s.nfipPaidUsd,
    maxValue: HURRICANE_TOTAL_NFIP_PAID_USD,
    color: s.color,
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
        Hurricane Damage by Storm
      </h2>
      <p className="text-sm text-[#807e76] mt-0.5">
        FEMA NFIP claims paid — Charley, Irma, Ian, Helene + Milton — Lee · Collier · Hendry ·
        Charlotte* · Sarasota*
      </p>

      {/* Rings + legend */}
      <div className="flex flex-col sm:flex-row items-center gap-6 sm:gap-10 mt-6 bg-[#0a1419]/20 rounded-xl border border-[#22414f]/40 p-4 sm:p-6">
        <div
          className="flex-none w-[220px] h-[220px] sm:w-[260px] sm:h-[260px]"
          style={RING_TRACK_VARS}
        >
          <RingChart data={ringData} strokeWidth={18} ringGap={6} baseInnerRadius={36}>
            {ringData.map((_, i) => (
              <Ring key={HURRICANE_STORM_DAMAGE[i].name} index={i} />
            ))}
            <RingCenter
              defaultLabel="NFIP Paid · 4 Storms"
              formatOptions={{ style: "currency", currency: "USD", notation: "compact" }}
            />
          </RingChart>
        </div>

        <div className="flex-1 w-full space-y-2">
          {HURRICANE_STORM_DAMAGE.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-[#b8b4a8]">
                <span
                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
                <span className="text-[#807e76] text-xs">{s.year}</span>
              </span>
              <span className="font-mono font-bold text-[#f0ede6] tabular-nums">
                {formatUsdCompact(s.nfipPaidUsd)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-start gap-2 mt-4 bg-[#0a1419]/20 p-3 rounded-lg border border-[#22414f]/30 text-xs text-[#807e76]">
        <HelpCircle className="h-4 w-4 text-[#807e76] mt-0.5 flex-shrink-0" />
        <span>
          Hover a ring for its exact figure. Ian alone accounts for more paid claims than the other
          three storms combined.
        </span>
      </div>
      <p className="mt-2 font-mono text-[11px] tracking-wide text-[#807e76]">
        {HURRICANE_SERIES_SOURCE.citation} · as of {HURRICANE_SERIES_SOURCE.asOf}
      </p>
      <p className="mt-1 font-mono text-[11px] tracking-wide text-[#807e76]">
        {HURRICANE_SERIES_SOURCE.footnote}
      </p>
    </div>
  );
}
