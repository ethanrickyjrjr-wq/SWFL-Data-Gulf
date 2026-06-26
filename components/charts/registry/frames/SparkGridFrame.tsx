"use client";

import type { ChartSpec } from "../chart-spec";
import { sparkGridSvg, type SparkCard } from "@/lib/charts/svg/spark-grid";
import type { ValueFormat } from "@/lib/charts/format";

/**
 * SparkGridFrame — a row of small KPI cards, each a big formatted value + a tiny
 * sparkline trend.
 *
 * This frame is a THIN wrapper: it pulls its data from `spec.options`, the accent
 * from `spec.theme`, and renders the SAME pure SVG string that the email PNG path
 * rasterizes (`lib/charts/svg/spark-grid.ts`). One renderer, two surfaces — the
 * web frame and the email image never fork.
 *
 * spec.options shape:
 *   cards: Array<{ label: string; value: number; series: number[]; valueFormat?: ValueFormat }>
 *
 * Up to 4 cards are laid across the width (the builder caps at 4).
 */
const VALUE_FORMATS = new Set<ValueFormat>(["usd", "rent", "count", "pct", "index"]);

/** Pure adapter — exported so tests can validate extraction without a DOM. */
export function extractSparkCards(options: Record<string, unknown> | undefined): SparkCard[] {
  const raw = options?.cards;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (c): c is Record<string, unknown> => c !== null && typeof c === "object" && !Array.isArray(c),
    )
    .map((c) => {
      const fmt = c.valueFormat;
      return {
        label: typeof c.label === "string" ? c.label : "",
        value: typeof c.value === "number" ? c.value : 0,
        series: Array.isArray(c.series)
          ? c.series.filter((v): v is number => typeof v === "number")
          : [],
        valueFormat:
          typeof fmt === "string" && VALUE_FORMATS.has(fmt as ValueFormat)
            ? (fmt as ValueFormat)
            : undefined,
      };
    });
}

export function SparkGridFrame({ spec }: { spec: ChartSpec }) {
  const cards = extractSparkCards(spec.options);
  const accent = spec.theme?.accent ?? "#e05c2e";

  if (cards.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: 13 }}>
        No metrics to display.
      </div>
    );
  }

  const svg = sparkGridSvg(cards, {
    title: spec.title ?? "",
    accent,
    source: spec.source?.citation,
    asOf: spec.asOf,
  });

  return (
    <div
      style={{ width: "100%" }}
      // The SVG string is built by our own pure builder from typed data and every
      // data label is escaped via esc() — no untrusted HTML reaches the DOM.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
