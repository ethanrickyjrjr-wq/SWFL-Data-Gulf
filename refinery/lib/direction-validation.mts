/**
 * Validate a brain's AUTHORED direction against a fitted trend.
 *
 * Operator decision 08/11/2026, verbatim: *"Authored the direction validated
 * against a fitted trend."* The brain still authors the call — we are not replacing
 * judgment with arithmetic — but the call is checked against the slug's own history
 * before it is logged as a prediction.
 *
 * Pure: no I/O, no Supabase, no clock. The caller fetches the series and owns the
 * as-of instant; this module only decides. (The transitive import of
 * `computeDirection` pulls @supabase/supabase-js into the module graph but never
 * constructs a client at import time — same accepted shape as
 * `refinery/lib/backtest/decision-fn.mts`.)
 *
 * WHY POLARITY IS NOT RE-IMPLEMENTED HERE: a slope's sign is in metric units, and
 * on a `lower_is_bullish` slug a FALLING slope is BULLISH. `computeDirection` already
 * owns that mapping and is tested; this module calls it in `sign` basis (which grades
 * a value's own sign) with epsilon 0, because the significance gate is `established`
 * — the confidence interval already did the deadband's job.
 *
 * Design + failure modes: docs/superpowers/specs/2026-08-11-direction-validation-design.md
 */

import { computeDirection } from "../grade/grade-predictions.mts";
import type { ResolvedGradeConfig } from "../vocab/loader.mts";
import type { Fit, FitPoint } from "../../lib/charts/fit-line";

/**
 * `agree`        — an established trend, and its direction matches the authored call.
 * `disagree`     — an established trend pointing the other way. Still logged, still
 *                  gradeable (operator call 08/11/2026); the disagreement is recorded
 *                  so "does authored judgment beat the trend" becomes measurable.
 * `no_direction` — a real fit whose 95% CI straddles zero. We checked; there is no
 *                  readable trend. Per the crawled standard
 *                  (_RESEARCH/data-and-ingest/2026-08-11-direction-call-forecast-evaluation-standard.md
 *                  §4.1) a forecast must be allowed to return NO DIRECTION, so this
 *                  is NOT scored as a directional call.
 * `unvalidated`  — we could not fit at all (too few points, degenerate series, or a
 *                  failed read). NOT the same as `no_direction`, and never `agree`.
 */
export type DirectionVerdict = "agree" | "disagree" | "no_direction" | "unvalidated";

/** One row as read from `metric_observations`. */
export interface ObservationRow {
  observed_at: string;
  value: number;
}

/**
 * Series → fittable points, TRUNCATED AT THE AS-OF INSTANT.
 *
 * THE LOOK-AHEAD GUARD. An observation dated after the call was made was not
 * knowable then; fitting on it grades the call against its own answer. Same honesty
 * rule the backtest engine states at `flywheel-backtest.mts:18`. The boundary is
 * INCLUSIVE — an observation stamped exactly at the as-of instant was knowable.
 *
 * Unparseable dates and non-finite values are dropped here rather than passed on:
 * `fitLine` would reject them too, but dropping them at the edge keeps "we could not
 * fit" meaning "not enough real history", not "one bad row poisoned it".
 */
export function pointsAsOf(rows: readonly ObservationRow[], asOf: string): FitPoint[] {
  const cutoff = new Date(asOf).getTime();
  if (Number.isNaN(cutoff)) return [];

  // DEDUPE BY INSTANT. metric-observations-log.mts:11-13 — master's re-surfaced copy
  // of a leaf slug coexists with the leaf's own row at the SAME observed_at. Fitting
  // both doubles n, shrinks the confidence interval, and can flip `established` from
  // false to true — manufacturing significance out of a bookkeeping artifact. First
  // row per instant wins; the caller orders the query.
  const seen = new Set<number>();
  const out: FitPoint[] = [];
  for (const r of rows ?? []) {
    if (!r || !Number.isFinite(r.value)) continue;
    const when = new Date(r.observed_at);
    const t = when.getTime();
    if (Number.isNaN(t)) continue;
    if (t > cutoff) continue; // the future — never fittable
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ when, y: r.value });
  }
  return out;
}

/**
 * The verdict for one authored call against one fit. See `DirectionVerdict`.
 * A null fit is `unvalidated` — never `no_direction`, and never `agree`.
 */
export function validateDirection(
  authored: "bullish" | "bearish",
  fit: Fit | null,
  cfg: ResolvedGradeConfig,
): DirectionVerdict {
  // Could not fit at all — too few points, no variance, or the read failed.
  if (!fit) return "unvalidated";

  // A real fit whose CI straddles zero: the sign of the slope MAY NOT BE READ.
  if (!fit.established) return "no_direction";

  const fitted = computeDirection(fit.slope, 0, {
    ...cfg,
    grade_basis: "sign",
    epsilon: 0,
  });

  // `established` implies a non-zero slope, so `neutral` should be unreachable —
  // but if it ever is reached, the honest answer is "no direction", never a
  // disagreement we cannot justify.
  if (fitted === "neutral") return "no_direction";

  return fitted === authored ? "agree" : "disagree";
}

/** The metadata key the verdict is persisted under, inside `predictions.metadata`. */
export const VERDICT_KEY = "direction_validation";

/**
 * Read a row's verdict back out of `predictions.metadata`.
 *
 * ABSENT MEANS `unvalidated`, ALWAYS. The 40 rows logged before this shipped carry
 * no key, and they must never read as a check that passed — we did not perform one.
 * Never backfill a verdict onto them: that would be asserting a validation that
 * never ran.
 */
export function readVerdict(metadata: unknown): DirectionVerdict {
  if (!metadata || typeof metadata !== "object") return "unvalidated";
  const v = (metadata as Record<string, unknown>)[VERDICT_KEY];
  return v === "agree" || v === "disagree" || v === "no_direction" ? v : "unvalidated";
}

/**
 * Stamp the verdict onto a prediction row and apply its one structural consequence.
 *
 * `no_direction` DOWNGRADES the row to `ungradeable` — per the crawled standard §4.1
 * a forecast must be allowed to return no direction, and scoring a call we declined
 * to make is the thing that rule forbids. Expect the gradeable count to fall; §6
 * already called that the correct outcome.
 *
 * `disagree` deliberately stays gradeable (operator decision 08/11/2026): the
 * authored call still stands and is still scored, with the disagreement on the record
 * so authored-vs-fitted becomes a measurable comparison instead of an opinion.
 *
 * NEVER PROMOTES. A row that arrived `ungradeable` stays `ungradeable` — this
 * function only ever removes a call from scoring, never adds one.
 */
export function applyDirectionValidation<
  T extends { grade_status: "gradeable" | "ungradeable"; metadata: unknown },
>(row: T, verdict: DirectionVerdict): T {
  const metadata = {
    ...(row.metadata && typeof row.metadata === "object" ? (row.metadata as object) : {}),
    [VERDICT_KEY]: verdict,
  };
  const grade_status =
    verdict === "no_direction" && row.grade_status === "gradeable"
      ? ("ungradeable" as const)
      : row.grade_status;

  return { ...row, metadata, grade_status };
}
