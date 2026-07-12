// lib/concoctions/guards.ts — distribution guard evaluator. Pure.
import type { ColumnSpec, ConcoctionRow } from "./types";

/** Evaluate a column's distribution guards against live rows. A failing guard
 *  makes the measure unavailable to shapes that need it (the materializer
 *  degrades to a fallback shape — never a refusal, never a lying axis). */
export function evaluateGuards(
  rows: ConcoctionRow[],
  col: ColumnSpec,
): { ok: boolean; reasons: string[] } {
  const g = col.guards;
  if (!g || rows.length === 0) return { ok: true, reasons: [] };
  const reasons: string[] = [];
  const raw = rows.map((r) => r[col.key]);
  const nonNull = raw.filter((v): v is number | string => v !== null && v !== undefined);
  const nullShare = raw.length === 0 ? 0 : (raw.length - nonNull.length) / raw.length;

  if (g.maxNullShare !== undefined && nullShare > g.maxNullShare) {
    reasons.push(`null share ${nullShare.toFixed(2)} exceeds ${g.maxNullShare}`);
  }
  if (g.minDistinct !== undefined && new Set(nonNull).size < g.minDistinct) {
    reasons.push(`distinct values ${new Set(nonNull).size} below ${g.minDistinct}`);
  }
  if (g.minSpreadRatio !== undefined) {
    const nums = nonNull.filter((v): v is number => typeof v === "number");
    if (nums.length < 2) {
      reasons.push("fewer than 2 numeric values — no spread");
    } else {
      const max = Math.max(...nums);
      const min = Math.min(...nums);
      const denom = Math.max(Math.abs(max), Math.abs(min));
      const spread = denom === 0 ? 0 : (max - min) / denom;
      if (spread < g.minSpreadRatio) {
        reasons.push(`spread ratio ${spread.toFixed(3)} below ${g.minSpreadRatio}`);
      }
    }
  }
  return { ok: reasons.length === 0, reasons };
}
