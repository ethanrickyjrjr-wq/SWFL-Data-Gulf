// lib/concoctions/guards.ts — distribution + GRAIN guards. Pure.
//
// Two different failures live here, and conflating them is what shipped the
// 07/13/2026 corridor bug:
//   DISTRIBUTION — the values are real but the shape would lie about them
//                  (a near-constant cap rate drawn as an axis). Gates AXES.
//   GRAIN        — the value isn't held at the grain of the row, so ranking or
//                  crowning rows on it invents an order the source never made.
//                  Gates RANKING. Distribution guards cannot see this: on the
//                  corridor data, spread/distinctness/null-share all PASSED.
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

/**
 * Collapse rows to the grain a measure is actually held at — one row per distinct
 * grain value, in first-seen order. Rows whose grain value is null are DROPPED:
 * on the corridor data those are the four corridors whose figures match no
 * published submarket row and carry no source URL, and an uncited figure may not
 * be rendered as a figure at all (four-lane rule — the one hard block is a number
 * with no named source).
 *
 * The collapsed row keeps the grain value in the grain column and carries
 * `_members` (how many rows shared it) so a shape can say "shared by 3" instead
 * of silently pretending one of them won.
 */
export function collapseToGrain(rows: ConcoctionRow[], grainKey: string): ConcoctionRow[] {
  const groups = new Map<string, ConcoctionRow>();
  for (const row of rows) {
    const g = row[grainKey];
    if (g === null || g === undefined || g === "") continue;
    const key = String(g);
    const seen = groups.get(key);
    if (seen) {
      seen._members = (typeof seen._members === "number" ? seen._members : 1) + 1;
      continue;
    }
    groups.set(key, { ...row, _members: 1 });
  }
  return [...groups.values()];
}

/**
 * Is the top value a tie? A shape that CROWNS one row (hero, metric card) must
 * not name a winner when the winning value is shared — that is the generalized
 * form of the zip-report fix (a trace permit count can't be crowned or
 * top-ranked). Returns true when ≥2 rows hold the maximum.
 */
export function topValueIsTied(rows: ConcoctionRow[], measureKey: string): boolean {
  const nums = rows
    .map((r) => r[measureKey])
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length < 2) return false;
  const max = Math.max(...nums);
  return nums.filter((v) => v === max).length > 1;
}
