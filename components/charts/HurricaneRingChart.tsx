"use client";

import Image from "next/image";
import { HelpCircle } from "lucide-react";
import { useState } from "react";
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

// Legend reads highest-spend-first: Ian, Helene, Milton, Irma, Charley.
// Ring geometry uses the exact reverse — index 0 (innermost/center) to
// index 4 (outermost) — so the rings read Charley (center) -> Irma ->
// Milton -> Helene -> Ian (outermost), matching that same order spatially.
const LEGEND_STORMS = [...HURRICANE_STORM_DAMAGE].sort((a, b) => b.nfipPaidUsd - a.nfipPaidUsd);
const RING_STORMS = [...LEGEND_STORMS].reverse();

/**
 * SWFL hurricane damage by named storm — Charley (2004), Irma (2017), Ian
 * (2022), Helene (2024), Milton (2024) — real FEMA NFIP claims paid, rings
 * ordered Charley (center) -> Irma -> Milton -> Helene -> Ian (outermost),
 * legend sorted highest-spend-first. Real numbers, see
 * lib/charts/hurricane-series.ts.
 */
export function HurricaneRingChart({ className = "" }: HurricaneRingChartProps) {
  const ringData = RING_STORMS.map((s) => ({
    label: s.name,
    value: s.nfipPaidUsd,
    maxValue: HURRICANE_TOTAL_NFIP_PAID_USD,
    color: s.color,
  }));

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const hoveredStorm = hoveredIndex === null ? null : RING_STORMS[hoveredIndex];

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
        FEMA NFIP claims paid — Charley, Irma, Ian, Helene, Milton — Lee · Collier · Hendry ·
        Charlotte* · Sarasota*
      </p>

      {/* Rings + legend */}
      <div className="flex flex-col sm:flex-row items-center gap-8 sm:gap-10 mt-6 bg-[#0a1419]/20 rounded-xl border border-[#22414f]/40 p-4 sm:p-6">
        <div
          className="relative flex-none w-[220px] h-[220px] sm:w-[260px] sm:h-[260px]"
          style={RING_TRACK_VARS}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          }}
        >
          <RingChart
            data={ringData}
            strokeWidth={16}
            ringGap={5}
            baseInnerRadius={52}
            hoveredIndex={hoveredIndex}
            onHoverChange={setHoveredIndex}
          >
            {ringData.map((_, i) => (
              <Ring key={RING_STORMS[i].name} index={i} />
            ))}
            <RingCenter
              defaultLabel={`5 storms · ${HURRICANE_STORM_DAMAGE[0].year}–${HURRICANE_STORM_DAMAGE[HURRICANE_STORM_DAMAGE.length - 1].year}`}
              formatOptions={{ style: "currency", currency: "USD", notation: "compact" }}
            />
          </RingChart>

          {hoveredStorm && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md border border-[#22414f] bg-[#0a1419] px-2.5 py-1 text-xs font-semibold text-[#f0ede6] shadow-lg"
              style={{ left: cursorPos.x, top: cursorPos.y }}
            >
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ backgroundColor: hoveredStorm.color }}
              />
              {hoveredStorm.name} ({hoveredStorm.year})
            </div>
          )}
        </div>

        <div className="flex-1 w-full space-y-3.5">
          {LEGEND_STORMS.map((s) => {
            const pct = (s.nfipPaidUsd / HURRICANE_TOTAL_NFIP_PAID_USD) * 100;
            return (
              <div key={s.name}>
                <div className="flex items-center gap-2 text-sm leading-none">
                  <span
                    className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="font-medium text-[#f0ede6]">{s.name}</span>
                  <span className="font-mono font-bold text-[#f0ede6] tabular-nums">
                    {formatUsdCompact(s.nfipPaidUsd)}
                  </span>
                  <span className="font-mono text-[#807e76] tabular-nums">
                    {pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden mt-1.5 ml-[18px]"
                  style={{ backgroundColor: "rgba(240,237,230,0.08)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.max(pct, 1.5)}%`, backgroundColor: s.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-start gap-2 mt-4 bg-[#0a1419]/20 p-3 rounded-lg border border-[#22414f]/30 text-xs text-[#807e76]">
        <HelpCircle className="h-4 w-4 text-[#807e76] mt-0.5 flex-shrink-0" />
        <span>
          Hover a ring for its exact figure. Ian alone accounts for more paid claims than the other
          four storms combined.
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
