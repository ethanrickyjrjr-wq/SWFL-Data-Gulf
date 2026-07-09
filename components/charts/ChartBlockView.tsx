"use client";

import { useMemo } from "react";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";
import { pickRenderer, adaptToHBar, adaptToTable } from "@/refinery/lib/chart-adapter.mts";
import { HBarChart } from "@/components/charts/HBarChart";
import { friendlyAsOf } from "@/lib/project/as-of";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ScatterChart,
  Scatter,
  ResponsiveContainer,
} from "recharts";

interface ChartBlockViewProps {
  block: ChartBlock;
  compact?: boolean;
  asOf?: string;
}

const captionStyle: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 11,
  color: "#4a5a6a",
  marginTop: 6,
  letterSpacing: "0.02em",
};

/**
 * The bottom-of-chart vintage caption. The KEYSTONE date lives on `block.asOf`
 * (ISO) and carries its own provenance via `block.source.citation`. The legacy
 * sibling `asOfProp` (a pre-keystone display string like "Jun 2026") is the
 * back-compat fallback for callers that have not yet moved the date onto the
 * block. Returns null when neither is present (no caption).
 */
function captionFor(block: ChartBlock, asOfProp?: string): string | null {
  if (block.asOf) {
    const cite = block.source?.citation;
    return `as of ${friendlyAsOf(block.asOf)}${cite ? ` · ${cite}` : ""}`;
  }
  if (asOfProp) return `as of ${asOfProp}`;
  return null;
}

export function ChartBlockView({ block, compact = false, asOf }: ChartBlockViewProps) {
  const renderer = pickRenderer(block);
  const caption = captionFor(block, asOf);
  const captionEl = caption ? <p style={captionStyle}>{caption}</p> : null;

  // Memoized on `block`, not recomputed every render: adaptToHBar() builds a
  // fresh `corridors` array each call, and HBarChart's count-up animation
  // restarts whenever that array's REFERENCE changes (its useLayoutEffect
  // depends on it). Without this, any incidental parent re-render during an
  // active chat (streaming, scroll, hover elsewhere on the page) resets the
  // animation for every bar — and a bar whose stagger delay hasn't elapsed
  // yet when that happens is left showing the static "$0.00" placeholder
  // indefinitely instead of its real value (07/07/2026 live repro: a ZIP
  // home-value bar chart stuck one row at $0.00 under normal interaction).
  // Computed unconditionally (not just when renderer === "bar") because hooks
  // can't be called behind a branch — cost is a no-op array pass for non-bar
  // charts, which is negligible next to a broken/suppressed hooks rule.
  const hbarProps = useMemo(() => adaptToHBar(block), [block]);

  if (renderer === "bar") {
    return (
      <>
        <HBarChart {...hbarProps} compact={compact} />
        {captionEl}
      </>
    );
  }

  if (renderer === "area") {
    return (
      <>
        {renderArea(block.title, block.columns, block.rows, compact)}
        {captionEl}
      </>
    );
  }

  if (renderer === "scatter") {
    return (
      <>
        {renderScatter(block.title, block.columns, block.rows, compact)}
        {captionEl}
      </>
    );
  }

  // table (default fallback)
  const { title, columns, rows } = adaptToTable(block);
  return (
    <>
      {renderTable(title, columns, rows)}
      {captionEl}
    </>
  );
}

const AREA_COLORS = ["#3DC9C0", "#f59e0b", "#a855f7", "#0ea5e9", "#ef4444"];

function renderArea(
  title: string,
  columns: string[],
  rows: (string | number | null)[][],
  compact: boolean,
) {
  const xKey = columns[0] ?? "x";
  const seriesKeys = columns.slice(1);
  const chartData = rows.map((row) => {
    const entry: Record<string, string | number | null> = {};
    columns.forEach((col, i) => {
      entry[col] = row[i] ?? null;
    });
    return entry;
  });
  const height = compact ? 160 : 240;
  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        color: "#F0EDE6",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 800, height }}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "#0d1527", border: "1px solid #1e293b", fontSize: 11 }}
          />
          {seriesKeys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stroke={AREA_COLORS[i % AREA_COLORS.length]}
              fill={`${AREA_COLORS[i % AREA_COLORS.length]}22`}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function renderScatter(
  title: string,
  columns: string[],
  rows: (string | number | null)[][],
  compact: boolean,
) {
  // col[0] = x-axis, col[1] = y-axis
  const xKey = columns[0] ?? "x";
  const yKey = columns[1] ?? "y";
  const scatterData = rows
    .filter((r) => typeof r[0] === "number" && typeof r[1] === "number")
    .map((r) => ({ [xKey]: r[0], [yKey]: r[1] }));
  const height = compact ? 160 : 240;
  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        color: "#F0EDE6",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 800, height }}>
        <ScatterChart margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey={xKey}
            name={xKey}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            dataKey={yKey}
            name={yKey}
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={{ background: "#0d1527", border: "1px solid #1e293b", fontSize: 11 }}
          />
          <Scatter data={scatterData} fill="#3DC9C0" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

function renderTable(title: string, columns: string[], rows: (string | number | null)[][]) {
  return (
    <div
      style={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        color: "#F0EDE6",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>{title}</div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{
                  textAlign: "left",
                  padding: "4px 12px 4px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.1)",
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 600,
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    padding: "4px 12px 4px 0",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  {cell === null ? "—" : String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ChartBlockView;
