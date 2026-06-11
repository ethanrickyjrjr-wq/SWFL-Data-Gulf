/**
 * lib/deliverable/print-vintage.ts
 *
 * Vintage-uniformity guard for the PDF/print export path.
 *
 * Deliverables compose frames from multiple brains — ZHVI, rents, and flood AAL
 * never share an as-of date. Per the anchoring spec, a single cover stamp is
 * permitted ONLY when all visual items share the same vintage. If vintages
 * differ, callers MUST preserve per-visual asOf captions and MUST NOT collapse
 * them to a single stamp.
 *
 * assertUniformVintage() is the gate: call it before rendering any cover-level
 * asOf in place of per-visual captions. If the set is mixed, it throws so the
 * caller surfaces the error rather than silently misrepresenting freshness.
 */

import type { SnapshotItem, ResolvedFrameItem, ResolvedChartItem } from "./templates";

function isVisualItem(item: SnapshotItem): item is ResolvedFrameItem | ResolvedChartItem {
  return item.kind === "frame" || item.kind === "chart";
}

function getAsOf(item: ResolvedFrameItem | ResolvedChartItem): string | null {
  if (item.kind === "frame") return item.chart_spec.asOf ?? null;
  return item.chart_block.asOf ?? null;
}

/**
 * Returns the set of distinct asOf dates (YYYY-MM-DD) across all frame and
 * chart items in the snapshot. Items without an asOf are silently skipped —
 * they are legacy blocks that predate the keystone (ChartBlock.asOf is
 * conditionally required; missing = lint warning, not a hard error on read).
 */
export function vintageSet(items: SnapshotItem[]): Set<string> {
  const dates = new Set<string>();
  for (const item of items) {
    if (!isVisualItem(item)) continue;
    const asOf = getAsOf(item);
    if (asOf) dates.add(asOf);
  }
  return dates;
}

/**
 * Returns true when all visual items in the snapshot share a single vintage,
 * or when no dated visual items are present (empty deliverable / all legacy).
 *
 * A uniform vintage is the ONLY condition under which a cover-level asOf stamp
 * may replace per-visual captions. Use this as the predicate before rendering
 * any such stamp; use assertUniformVintage() to hard-fail when the contract is
 * about to be violated.
 */
export function isUniformVintage(items: SnapshotItem[]): boolean {
  return vintageSet(items).size <= 1;
}

/**
 * Asserts that collapsing to a single cover-level asOf stamp is safe.
 *
 * Throws when the snapshot contains visual items (frames/charts) with more
 * than one distinct asOf date — a single stamp would misrepresent the data
 * freshness of a mixed-vintage deliverable.
 *
 * Call this guard before emitting any cover-level asOf that would replace
 * per-visual captions. If it throws, keep per-visual captions and do NOT emit
 * a cover stamp.
 */
export function assertUniformVintage(items: SnapshotItem[]): void {
  const vs = vintageSet(items);
  if (vs.size > 1) {
    const sorted = [...vs].sort().join(", ");
    throw new Error(
      `Mixed vintage: cannot collapse to a single cover stamp. ` +
        `Frames span vintages: ${sorted}. ` +
        `Per-visual asOf captions must remain on every frame.`,
    );
  }
}
