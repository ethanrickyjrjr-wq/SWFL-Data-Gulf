/**
 * pick-frames.ts — deterministic data-shape → frame mapper (Phase 2g).
 *
 * `pickFramesForData` inspects the shape of a brain's `detail_tables` and
 * `key_metrics` output and returns every registered frame whose `accepts` list
 * includes the inferred `DataShape`. Unknown or empty data → `[]` (caller falls
 * back to prose — never crashes).
 *
 * Resolution order matches chart-from-metrics.mts source preference:
 *   1. detail_tables (cross-sectional multi-bar comparisons)
 *   2. key_metrics (scalar fallback)
 *
 * The function reads CHART_REGISTRY at call time — new frames added to the
 * registry are automatically considered without touching this file.
 */
import type { BrainOutputDetailTable, BrainOutputMetric } from "@/refinery/types/brain-output.mts";
import type { DataShape } from "./chart-spec";
import { CHART_REGISTRY } from "./registry";

const MIN_POINTS = 3; // mirror chart-from-metrics.mts

// ---------------------------------------------------------------------------
// Shape inference helpers
// ---------------------------------------------------------------------------

const DATE_COLUMN_PATTERN = /date|year|month|period|quarter|week/i;

/** True when a column id looks like a date/time dimension. */
function isDateColumn(columnId: string): boolean {
  return DATE_COLUMN_PATTERN.test(columnId);
}

/** Count columns in a table whose rows have numeric values in that column. */
function numericColumns(table: BrainOutputDetailTable): { id: string; numericRowCount: number }[] {
  return table.columns
    .filter((col) => !isDateColumn(col.id))
    .map((col) => ({
      id: col.id,
      numericRowCount: table.rows.filter((r) => typeof r.cells[col.id] === "number").length,
    }))
    .filter(({ numericRowCount }) => numericRowCount >= MIN_POINTS);
}

/**
 * Infer all `DataShape`s that match the given detail tables.
 * A single table can match multiple shapes (e.g. two numeric cols → both
 * "ranked-categories" and "relationship").
 */
function shapesFromDetailTables(tables: readonly BrainOutputDetailTable[]): Set<DataShape> {
  const shapes = new Set<DataShape>();

  for (const t of tables) {
    // time-series: has a date/period dimension AND numeric values
    const hasDateCol = t.columns.some((c) => isDateColumn(c.id));
    const hasNumericRows =
      t.columns.some((c) => t.rows.some((r) => typeof r.cells[c.id] === "number")) &&
      t.rows.length >= MIN_POINTS;

    if (hasDateCol && hasNumericRows) {
      shapes.add("time-series");
    }

    const qualifyingNumericCols = numericColumns(t);

    if (qualifyingNumericCols.length >= 2) {
      // Two or more comparable numeric axes → scatter / relationship
      shapes.add("relationship");
    }
    if (qualifyingNumericCols.length >= 1) {
      // One numeric column over ≥3 label rows → ranked bar
      shapes.add("ranked-categories");
    }
  }

  return shapes;
}

/**
 * Infer `DataShape`s from scalar key_metrics when no detail_table qualified.
 * Uses the same grouping logic as chart-from-metrics.mts.
 */
function shapesFromKeyMetrics(metrics: readonly BrainOutputMetric[]): Set<DataShape> {
  const shapes = new Set<DataShape>();
  const numeric = metrics.filter(
    (m) => m.variable_type !== "categorical" && typeof m.value === "number",
  );

  if (numeric.length === 0) return shapes;

  // composition: 2+ percent metrics whose values sum to roughly 1.0
  const pctMetrics = numeric.filter(
    (m) =>
      m.display_format === "percent" ||
      (typeof m.value === "number" && m.value >= 0 && m.value <= 1 && m.display_format === "ratio"),
  );
  if (pctMetrics.length >= 2) {
    const total = pctMetrics.reduce((s, m) => s + (m.value as number), 0);
    if (total >= 0.9 && total <= 1.1) {
      shapes.add("composition");
    }
  }

  // single-vs-target: exactly 1 qualifying numeric metric
  if (numeric.length === 1) {
    shapes.add("single-vs-target");
  }

  // ranked-categories: ≥3 metrics with the same display_format (mirror chart-from-metrics)
  const groups = new Map<string, number>();
  for (const m of numeric) {
    const fmt = m.display_format ?? "raw";
    groups.set(fmt, (groups.get(fmt) ?? 0) + 1);
  }
  for (const count of groups.values()) {
    if (count >= MIN_POINTS) {
      shapes.add("ranked-categories");
      break;
    }
  }

  return shapes;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FrameCandidate {
  frameId: string;
  reason: string;
}

/**
 * Deterministically pick the best-matching registered frames for a brain
 * output's data shape. Returns every frame whose `accepts` intersects the
 * inferred shapes; `[]` when nothing qualifies (caller falls back to prose).
 *
 * Survival-rate surfaces (franchise-outcomes) come as prose, not `detail_tables`,
 * and will not match here — that is correct; the FranchiseSurvivalFrame is wired
 * directly by Phase 3 when the brain id is `franchise-outcomes`.
 */
export function pickFramesForData(
  detail_tables: BrainOutputDetailTable[] | undefined,
  key_metrics: BrainOutputMetric[],
): FrameCandidate[] {
  // Infer shapes — tables first, then fall back to key_metrics
  const tableShapes = detail_tables ? shapesFromDetailTables(detail_tables) : new Set<DataShape>();
  const metricShapes =
    tableShapes.size === 0 ? shapesFromKeyMetrics(key_metrics) : new Set<DataShape>();

  const allShapes = new Set<DataShape>([...tableShapes, ...metricShapes]);
  if (allShapes.size === 0) return [];

  const results: FrameCandidate[] = [];
  for (const [frameId, def] of Object.entries(CHART_REGISTRY)) {
    const matchedShape = def.accepts.find((s) => allShapes.has(s));
    if (matchedShape) {
      results.push({
        frameId,
        reason: `${matchedShape} shape detected (${def.label})`,
      });
    }
  }
  return results;
}
