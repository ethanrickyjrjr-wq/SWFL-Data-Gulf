"use client";

import {
  ChartStatFlow,
  type ChartStatFlowFormat,
} from "@/components/charts/vendor/bklit/chart-stat-flow";
import type { DeskDatum } from "@/lib/desk/types";
import { PinToEmail, type FramePinSpec } from "./PinToEmail";

const UP = "#5bc97a"; // mangrove
const DOWN = "#e08158"; // sunset-coral

export interface KpiTile {
  datum: DeskDatum;
  /** Present only when a brain mirrors this figure — enables the live pin. */
  pin?: FramePinSpec;
}

function flowProps(d: DeskDatum): {
  format: ChartStatFlowFormat;
  prefix?: string;
  suffix?: string;
} {
  if (d.unit === "USD") return { format: { maximumFractionDigits: 0 }, prefix: "$" };
  if (d.unit === "%") {
    const digits = Number.isInteger(d.value) ? 0 : d.value < 10 ? 2 : 1;
    return {
      format: { minimumFractionDigits: digits, maximumFractionDigits: digits },
      suffix: "%",
    };
  }
  return { format: { maximumFractionDigits: 0 } };
}

/**
 * Count-up KPI row. Each tile's label is a HEADING (h3) on purpose: the
 * site-wide highlighter derives a selection's context from the nearest
 * heading, so selecting a value here resolves to this tile's label and
 * "File this figure" captures the tile's real provenance (via the
 * DeskHighlightBridge-carried metric suggestions).
 */
export function DeskKpiRow({ tiles }: { tiles: KpiTile[] }) {
  if (tiles.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {tiles.map(({ datum, pin }) => {
        const fp = flowProps(datum);
        return (
          <div
            key={datum.label}
            className="flex flex-col rounded-xl border border-[#22414f] bg-[#0f1d24] p-3 sm:p-4"
          >
            <div className="flex items-start justify-between gap-1">
              <h3 className="text-[11px] uppercase tracking-wider text-gray-500">{datum.label}</h3>
              {pin ? <PinToEmail pin={pin} /> : null}
            </div>
            <div className="mt-1 flex flex-col">
              <ChartStatFlow
                value={datum.value}
                label={`${datum.sourceLabel}${datum.asOf ? ` · as of ${datum.asOf}` : ""}`}
                formatOptions={fp.format}
                prefix={fp.prefix}
                suffix={fp.suffix}
                valueClassName="text-xl sm:text-2xl font-bold tracking-tight"
                labelClassName="text-[10px] text-gray-500 font-mono"
              />
            </div>
            {datum.direction && datum.direction !== "flat" && datum.deltaDisplay ? (
              <p
                className="mt-1 font-mono text-[11px] tabular-nums"
                style={{ color: datum.direction === "up" ? UP : DOWN }}
              >
                {datum.direction === "up" ? "▲" : "▼"} {datum.deltaDisplay}
                {datum.deltaNote ? (
                  <span className="ml-1 text-gray-500">{datum.deltaNote}</span>
                ) : null}
              </p>
            ) : datum.deltaNote ? (
              <p className="mt-1 font-mono text-[11px] text-amber-400/80">{datum.deltaNote}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
