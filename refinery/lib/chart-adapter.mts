/**
 * chart-adapter.mts — shared adapter between ChartBlock (refinery) and
 * chart components (Next.js). Importable from both refinery/Node and Next
 * server/client contexts.
 *
 * Pattern mirrors refinery/lib/corridor-aliases.mts.
 */

import type { ChartBlock } from "../validate/chart-block-lint.mts";
import type {
  HBarCorridor,
  HBarChartProps,
  HBarTier,
} from "../../components/charts/HBarChart";
import { medianOf } from "../../lib/stats";

// ---------------------------------------------------------------------------
// Constants (extracted from asking-rent/page.tsx so one source of truth)
// ---------------------------------------------------------------------------

export const BULLISH_MULTIPLIER = 1.2;
export const BEARISH_MULTIPLIER = 0.7;

// ---------------------------------------------------------------------------
// Tier helper
// ---------------------------------------------------------------------------

/** Determines HBar tier for a value relative to market median. */
export function tierFor(value: number, median: number): HBarTier {
  if (value >= median * BULLISH_MULTIPLIER) return "bullish";
  if (value <= median * BEARISH_MULTIPLIER) return "bearish";
  return "neutral";
}

// ---------------------------------------------------------------------------
// adaptToHBar
// ---------------------------------------------------------------------------

/**
 * Derives HBarChartProps from a ChartBlock.
 * columns[0] = label string (corridor name), columns[1] = primary numeric
 * metric ($/sqft). Rows where columns[1] is not a number are skipped.
 */
export function adaptToHBar(block: ChartBlock): HBarChartProps {
  const numericRows = block.rows.filter(
    (row) => typeof row[1] === "number",
  ) as [string | number | null, number, ...(string | number | null)[]][];

  if (numericRows.length === 0) {
    return {
      title: block.title,
      corridors: [],
      median: 0,
      range: { min: 0, max: 0 },
    };
  }

  const numericValues = numericRows.map((row) => row[1]);
  const median = medianOf(numericValues) ?? 0;
  const range = {
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
  };

  const corridors: HBarCorridor[] = numericRows.map((row) => {
    const value = row[1];
    return {
      name: String(row[0]),
      value,
      tier: tierFor(value, median),
    };
  });

  return { title: block.title, corridors, median, range };
}

// ---------------------------------------------------------------------------
// adaptToTable — trivial pass-through for table fallback rendering
// ---------------------------------------------------------------------------

export function adaptToTable(block: ChartBlock): {
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
} {
  return {
    title: block.title,
    columns: block.columns,
    rows: block.rows as (string | number | null)[][],
  };
}

// ---------------------------------------------------------------------------
// pickRenderer
// ---------------------------------------------------------------------------

const VALID_RENDERERS = new Set(["bar", "area", "scatter", "table"] as const);

/**
 * Returns block.chart_type if it is one of the four known renderer keys;
 * otherwise falls back to "table".
 */
export function pickRenderer(
  block: ChartBlock,
): "bar" | "area" | "scatter" | "table" {
  if (block.chart_type && VALID_RENDERERS.has(block.chart_type)) {
    return block.chart_type;
  }
  return "table";
}

// ---------------------------------------------------------------------------
// Stubs — return adaptToTable result until producers emit matching chart_type
// ---------------------------------------------------------------------------

export function adaptToArea(
  block: ChartBlock,
): ReturnType<typeof adaptToTable> {
  return adaptToTable(block);
}

export function adaptToScatter(
  block: ChartBlock,
): ReturnType<typeof adaptToTable> {
  return adaptToTable(block);
}
