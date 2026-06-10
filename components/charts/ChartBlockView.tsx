"use client";

import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";
import { pickRenderer, adaptToHBar, adaptToTable } from "@/refinery/lib/chart-adapter.mts";
import { HBarChart } from "@/components/charts/HBarChart";
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

export function ChartBlockView({ block, compact = false, asOf }: ChartBlockViewProps) {
  const renderer = pickRenderer(block);

  if (renderer === "bar") {
    const props = adaptToHBar(block);
    return (
      <>
        <HBarChart {...props} compact={compact} />
        {asOf && <p style={captionStyle}>as of {asOf} · SWFL fixture sample</p>}
      </>
    );
  }

  if (renderer === "area") {
    return (
      <>
        {renderArea(block.title, block.columns, block.rows, compact)}
        {asOf && <p style={captionStyle}>as of {asOf} · SWFL fixture sample</p>}
      </>
    );
  }

  if (renderer === "scatter") {
    return (
      <>
        {renderScatter(block.title, block.columns, block.rows, compact)}
        {asOf && <p style={captionStyle}>as of {asOf} · SWFL fixture sample</p>}
      </>
    );
  }

  // table (default fallback)
  const { title, columns, rows } = adaptToTable(block);
  return (
    <>
      {renderTable(title, columns, rows)}
      {asOf && <p style={captionStyle}>as of {asOf} · SWFL fixture sample</p>}
    </>
  );
}

const AREA_COLORS = ["#00d4aa", "#f59e0b", "#a855f7", "#0ea5e9", "#ef4444"];

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
      <ResponsiveContainer width="100%" height={height}>
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
      <ResponsiveContainer width="100%" height={height}>
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
          <Scatter data={scatterData} fill="#00d4aa" />
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
