"use client";

import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";
import {
  pickRenderer,
  adaptToHBar,
  adaptToArea,
  adaptToScatter,
  adaptToTable,
} from "@/refinery/lib/chart-adapter.mts";
import { HBarChart } from "@/components/charts/HBarChart";

interface ChartBlockViewProps {
  block: ChartBlock;
}

export function ChartBlockView({ block }: ChartBlockViewProps) {
  const renderer = pickRenderer(block);

  if (renderer === "bar") {
    const props = adaptToHBar(block);
    return <HBarChart {...props} />;
  }

  // area and scatter: stubs return table data until matching chart_type producers land
  if (renderer === "area") {
    const { title, columns, rows } = adaptToArea(block);
    return renderTable(title, columns, rows);
  }

  if (renderer === "scatter") {
    const { title, columns, rows } = adaptToScatter(block);
    return renderTable(title, columns, rows);
  }

  // table (default fallback)
  const { title, columns, rows } = adaptToTable(block);
  return renderTable(title, columns, rows);
}

function renderTable(
  title: string,
  columns: string[],
  rows: (string | number | null)[][],
) {
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
