"use client";

import React, { useState, useMemo, useRef } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Calendar, HelpCircle, Eye, EyeOff, AreaChart as ChartIcon, Sparkles } from "lucide-react";
import type { ZHVITrendEntry, MetroTrendEntry } from "@/types/viz";

export type { ZHVITrendEntry };

export interface MetroAreaChartProps {
  data: MetroTrendEntry[];
  loading?: boolean;
  className?: string;
  asOf?: string;
  /** Small uppercase eyebrow above the title. Defaults to the ZHVI source line. */
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  /** Y-axis + tooltip value formatter. Defaults to ZHVI currency ($1.15M / $420k). */
  formatValue?: (value: number) => string;
  /** Trailing note in the "as of …" caption. Defaults to "SWFL fixture sample". */
  asOfNote?: string;
  /** Empty-state heading + body. */
  emptyTitle?: string;
  emptyHint?: string;
  /** Root element id — override so two charts on one page stay unique. */
  rootId?: string;
}

/** @deprecated Prefer {@link MetroAreaChart}; alias kept so ZHVI call sites are unchanged. */
export type ZHVIAreaChartProps = MetroAreaChartProps;

type TimeRangeOption = "6M" | "1Y" | "2Y" | "ALL";

const defaultFormatValue = (value: number) => {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  return `$${value.toLocaleString()}`;
};

export function MetroAreaChart({
  data,
  loading = false,
  className = "",
  asOf,
  eyebrow = "Zillow Home Value Index (ZHVI)",
  title = "SWFL Residential Valuations",
  subtitle = "Typical middle-tier market estimates across standard coastal metros.",
  formatValue = defaultFormatValue,
  asOfNote = "SWFL fixture sample",
  emptyTitle = "No Market Trends Loaded",
  emptyHint = "Supply a historical sequence of Zillow Home Value Index records to graph home valuations.",
  rootId = "zhvi-area-chart-root",
}: MetroAreaChartProps) {
  const [range, setRange] = useState<TimeRangeOption>("ALL");
  const containerRef = useRef<HTMLDivElement>(null);

  // Custom interactive state to toggle specific city curves on/off in the graph
  const [visibleCities, setVisibleCities] = useState({
    cape_coral: true,
    fort_myers: true,
    naples: true,
  });

  // Track if the chart element is in view to trigger the Framer Motion draw-in
  const isInView = useInView(containerRef, { once: true, amount: 0.1 });
  const prefersReducedMotion = useReducedMotion();

  // 1. Sort and slice chronological ranges in a stable, memoized array
  const sortedAndFilteredData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Sort chronologically ascending
    const sorted = [...data].sort((a, b) => a.month.localeCompare(b.month));

    switch (range) {
      case "6M":
        return sorted.slice(-6);
      case "1Y":
        return sorted.slice(-12);
      case "2Y":
        return sorted.slice(-24);
      case "ALL":
      default:
        return sorted;
    }
  }, [data, range]);

  // Translate "YYYY-MM" code to beautiful "MMM 'YY" human label
  const formatXAxis = (tickItem: string) => {
    try {
      const [year, month] = tickItem.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1, 1);
      return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    } catch {
      return tickItem;
    }
  };

  // Skeleton framework
  if (loading) {
    return (
      <div
        className={`p-4 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-4 animate-pulse ${className}`}
      >
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            <div className="h-6 w-52 bg-slate-800 rounded"></div>
            <div className="h-4 w-72 bg-slate-800 rounded"></div>
          </div>
          <div className="h-9 w-40 bg-slate-800 rounded"></div>
        </div>
        <div className="h-[280px] sm:h-[380px] w-full bg-slate-900 rounded border border-slate-800/40 mt-4"></div>
      </div>
    );
  }

  // Beautiful empty states
  if (!data || data.length === 0) {
    return (
      <div
        className={`p-12 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-center gap-3 ${className}`}
      >
        <ChartIcon className="h-10 w-10 text-slate-500" />
        <h3 className="text-slate-200 font-medium text-lg">{emptyTitle}</h3>
        <p className="text-slate-400 text-sm max-w-sm">{emptyHint}</p>
      </div>
    );
  }

  // Toggle visible city series handler
  const handleToggleCity = (city: "cape_coral" | "fort_myers" | "naples") => {
    setVisibleCities((prev) => ({
      ...prev,
      [city]: !prev[city],
    }));
  };

  return (
    <div
      ref={containerRef}
      id={rootId}
      className={`p-4 sm:p-6 rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 shadow-xl select-none ${className}`}
    >
      {/* Header Controller Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-medium text-sky-450 uppercase tracking-wider">
            <Sparkles className="h-3 w-3 animate-pulse text-sky-400" />
            <span>{eyebrow}</span>
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-white mt-1">{title}</h2>
          <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>
        </div>

        {/* Chronological Range Selector */}
        <div className="flex items-center bg-slate-950/80 rounded-lg p-1 border border-slate-800/80 select-none text-xs font-mono">
          {(["6M", "1Y", "2Y", "ALL"] as TimeRangeOption[]).map((opt) => (
            <button
              key={opt}
              onClick={() => setRange(opt)}
              className={`px-3 py-1.5 rounded transition-all duration-200 font-medium cursor-pointer ${
                range === opt
                  ? "bg-slate-800 text-white shadow"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/40"
              }`}
            >
              {opt === "ALL" ? "ALL" : opt}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Interactive Legend Pill Toggles */}
      <div className="flex flex-wrap gap-2 sm:gap-2.5 mb-6 bg-slate-950/25 p-2 sm:p-3 rounded-xl border border-slate-800/20">
        <button
          onClick={() => handleToggleCity("naples")}
          className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-[10px] sm:text-xs font-mono font-medium transition-all duration-200 cursor-pointer ${
            visibleCities.naples
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-sm"
              : "bg-transparent border-slate-800/30 text-slate-500 decoration-line-through"
          }`}
        >
          {visibleCities.naples ? (
            <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          ) : (
            <EyeOff className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          )}
          <span>Naples (Gold Coast)</span>
        </button>
        <button
          onClick={() => handleToggleCity("cape_coral")}
          className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-[10px] sm:text-xs font-mono font-medium transition-all duration-200 cursor-pointer ${
            visibleCities.cape_coral
              ? "bg-sky-500/10 border-sky-500/30 text-sky-400 shadow-sm"
              : "bg-transparent border-slate-800/30 text-slate-500 decoration-line-through"
          }`}
        >
          {visibleCities.cape_coral ? (
            <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          ) : (
            <EyeOff className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          )}
          <span>Cape Coral (Waterways)</span>
        </button>
        <button
          onClick={() => handleToggleCity("fort_myers")}
          className={`flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border text-[10px] sm:text-xs font-mono font-medium transition-all duration-200 cursor-pointer ${
            visibleCities.fort_myers
              ? "bg-purple-500/10 border-purple-500/30 text-purple-400 shadow-sm"
              : "bg-transparent border-slate-800/30 text-slate-500 decoration-line-through"
          }`}
        >
          {visibleCities.fort_myers ? (
            <Eye className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          ) : (
            <EyeOff className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
          )}
          <span>Fort Myers</span>
        </button>
      </div>

      {/* Chart Canvas Area */}
      <div className="w-full h-[280px] sm:h-[380px] bg-slate-950/20 rounded-xl border border-slate-800/40 p-3 pt-6 relative overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={sortedAndFilteredData}
            margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
          >
            <defs>
              {/* Grand Gradients Definitions */}
              <linearGradient id="colorNaples" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorCapeCoral" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="colorFortMyers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
              </linearGradient>

              {/* Framer Motion clipPath: Generates a gorgeous scroll-triggered draw-in reveal */}
              <clipPath id="rechartsDrawInClip">
                <motion.rect
                  x="0"
                  y="0"
                  height="100%"
                  initial={{ width: 0 }}
                  animate={isInView || prefersReducedMotion ? { width: "100%" } : { width: 0 }}
                  transition={{ duration: 1.4, ease: "easeInOut" }}
                />
              </clipPath>
            </defs>

            {/* Subtle dashboard lines */}
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

            <XAxis
              dataKey="month"
              tickFormatter={formatXAxis}
              stroke="#3b4252"
              tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: "monospace" }}
              dy={10}
              tickLine={false}
              axisLine={false}
            />

            <YAxis
              tickFormatter={formatValue}
              stroke="#3b4252"
              tick={{ fill: "#94a3b8", fontSize: 10, fontFamily: "monospace" }}
              dx={-5}
              domain={["auto", "auto"]}
              tickLine={false}
              axisLine={false}
            />

            {/* Premium custom HTML Tooltip */}
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-slate-900 border border-slate-800 p-3 shadow-2xl rounded-lg text-xs space-y-1.5 font-mono">
                      <p className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-sky-400" />
                        <span>{formatXAxis(String(label ?? ""))}</span>
                      </p>
                      <div className="h-px bg-slate-800" />
                      {payload.map((item: unknown, i) => {
                        const it = item as { stroke: string; name: string; value: number };
                        return (
                          <div key={i} className="flex items-center justify-between gap-6">
                            <span
                              style={{ color: it.stroke }}
                              className="font-sans flex items-center gap-1.5"
                            >
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: it.stroke }}
                              />
                              {it.name}
                            </span>
                            <span className="font-bold text-white tracking-tight">
                              {formatValue(it.value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                return null;
              }}
            />

            {/* Naples Gold Coast */}
            {visibleCities.naples && (
              <Area
                type="monotone"
                name="Naples"
                dataKey="naples"
                stroke="#f59e0b"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorNaples)"
                isAnimationActive={false} // Disable Recharts default to let Framer Motion clipPath draw
                clipPath="url(#rechartsDrawInClip)"
              />
            )}

            {/* Cape Coral */}
            {visibleCities.cape_coral && (
              <Area
                type="monotone"
                name="Cape Coral"
                dataKey="cape_coral"
                stroke="#0ea5e9"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorCapeCoral)"
                isAnimationActive={false}
                clipPath="url(#rechartsDrawInClip)"
              />
            )}

            {/* Fort Myers */}
            {visibleCities.fort_myers && (
              <Area
                type="monotone"
                name="Fort Myers"
                dataKey="fort_myers"
                stroke="#a855f7"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorFortMyers)"
                isAnimationActive={false}
                clipPath="url(#rechartsDrawInClip)"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer Info Box */}
      <div className="flex items-start gap-2 mt-4 bg-slate-950/20 p-3 rounded-lg border border-slate-800/30 text-xs text-slate-400">
        <HelpCircle className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
        <span>
          Curves are fully interactive. Toggle names above to isolate metros. Selection defaults:{" "}
          <strong>{range}</strong> duration.
        </span>
      </div>
      {asOf && (
        <p className="mt-2 font-mono text-[11px] tracking-wide" style={{ color: "#4a5a6a" }}>
          as of {asOf} · {asOfNote}
        </p>
      )}
    </div>
  );
}

// Back-compat alias: existing ZHVI call sites (embed/demo/charts/registry frame) import
// `ZHVIAreaChart`; the prop defaults above reproduce the original ZHVI look exactly.
export const ZHVIAreaChart = MetroAreaChart;
