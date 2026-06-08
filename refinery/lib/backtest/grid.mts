/**
 * Pure point-in-time grid math for the flywheel backtest (The Glass §2).
 *
 * No I/O — no DuckDB, no Supabase, no env reads. Everything here is deterministic
 * and unit-tested in grid.test.mts. The harness (refinery/tools/flywheel-backtest.mts)
 * does the parquet read + the DB write and calls into these functions; keeping the
 * math pure is what lets a look-ahead leak be caught by a test instead of in prod.
 *
 * THE ONE HONESTY INVARIANT this module enforces (flywheel guardrail 1):
 *   The DECISION (as-of value + its prior) may only see vintages published on or
 *   before the as-of date. We use the INITIAL vintage of each observation (the value
 *   as FIRST reported, realtime_start minimal) and gate it by realtime_start <= asOf,
 *   so the call never peeks at a later BLS revision. The OUTCOME is read the same
 *   point-in-time way (initial vintage gated by realtime_start <= window_end), so even
 *   the grade is free of revision look-ahead — the future is allowed, the revised
 *   re-write of the past is not.
 *
 * Mirrors, never re-implements, the live grading math: predicted direction comes
 * from computeBacktestCall (the same adapter the Ian demo used) and the realized
 * direction from computeDirection (the live forward grader). This module only
 * SELECTS the point-in-time values and MAPS the verdict.
 */

import { computeBacktestCall, type SourceTag } from "./decision-fn.mts";
import { computeDirection, type ObservedDirection } from "../../grade/grade-predictions.mts";
import type { ResolvedGradeConfig } from "../../vocab/loader.mts";

/** One ALFRED-style vintage row. Dates are YYYY-MM-DD (lexicographically ordered). */
export interface Vintage {
  observation_date: string;
  value: number;
  realtime_start: string;
}

export interface PitPoint {
  observation_date: string;
  value: number;
}

export type Grade = "hit" | "miss" | "partial" | "neutral";

/**
 * Collapse a vintage table to one row per observation_date: the INITIAL vintage
 * (minimum realtime_start = as-first-reported). Ties on realtime_start keep the
 * first seen — there is never a real tie since one observation is published once.
 */
export function initialVintages(rows: Vintage[]): Vintage[] {
  const byObs = new Map<string, Vintage>();
  for (const r of rows) {
    const cur = byObs.get(r.observation_date);
    if (!cur || r.realtime_start < cur.realtime_start) byObs.set(r.observation_date, r);
  }
  return [...byObs.values()];
}

/**
 * Point-in-time read: the freshest observation whose INITIAL vintage had been
 * published on or before `asOf`. Returns its as-first-reported value. Null when
 * nothing had been published yet at `asOf` (e.g. an as-of before ALFRED's archive
 * begins). Caller passes the output of initialVintages().
 */
export function pitInitial(initials: Vintage[], asOf: string): PitPoint | null {
  let best: Vintage | null = null;
  for (const v of initials) {
    if (v.realtime_start > asOf) continue; // not published yet at asOf — look-ahead guard
    if (!best || v.observation_date > best.observation_date) best = v;
  }
  return best ? { observation_date: best.observation_date, value: best.value } : null;
}

/**
 * Add `days` to a YYYY-MM-DD date in UTC, return YYYY-MM-DD. Pure. UTC so the grid
 * is identical on a dev box and the CI runner (same discipline as
 * predictions-log.addDaysUTC, which is private to that module).
 */
export function addDaysUTC(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * A regular as-of grid: the `day`-th of every `monthStep`-th month from `startYM`
 * to `endYM` inclusive (both "YYYY-MM").
 *
 * Choosing the step is a CORRECTNESS decision, not cosmetics. computeSkillScore's
 * persistence null at as-of T is the PRIOR grid point's realized window. If the step
 * is SMALLER than the grade window, that prior window overlaps the current target
 * window — the naive baseline then "peeks" past T (look-ahead) and is unbeatable for
 * the wrong reason. So the step must be >= the window (default monthStep=3 ⇒ ~90d,
 * non-overlapping for a 90d window). The call lookback must separately differ from
 * the window, else system ≡ persistence and lift is identically 0.
 */
export function monthlyGrid(startYM: string, endYM: string, day = 15, monthStep = 1): string[] {
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  const out: string[] = [];
  let y = sy;
  let m = sm;
  const dd = String(day).padStart(2, "0");
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${dd}`);
    m += monthStep;
    while (m > 12) {
      m -= 12;
      y++;
    }
  }
  return out;
}

/**
 * Map a (predicted, realized) pair to a backtest grade. Mirrors the live grader:
 * a realized neutral (move inside the deadband) is 'neutral' — the directional call
 * neither hit nor missed; a realized direction equal to the call is 'hit', opposite
 * is 'miss'. 'partial' is reserved in the schema for a future magnitude-aware verdict
 * and is intentionally not produced here (the live grader is direction-binary too).
 */
export function gradeFromDirections(
  predicted: "bullish" | "bearish",
  observed: ObservedDirection,
): Grade {
  if (observed === "neutral") return "neutral";
  return observed === predicted ? "hit" : "miss";
}

/**
 * Deterministic SIGNAL-STRENGTH confidence proxy in [0.5, 0.95].
 *
 * The retrodicted call has no LLM-stated confidence (guardrail: it is not a live
 * call). To give §3's calibration pane something to bucket, we derive confidence
 * from how far the as-of signal clears its own neutral deadband — a stronger move
 * is a more confident directional call. This is a PROXY, labeled as such; it tunes
 * NOTHING in the call itself (the direction is already decided) and never inflates a
 * live number. The only free parameter is the output range [0.5, 0.95] (a spread for
 * bucketing); the deadband is the already-justified grade-config epsilon, not a new
 * constant.
 *
 *   s = max(0, |signal| - deadband) / deadband        (deadbands cleared, ≥0)
 *   confidence = 0.5 + 0.45 * s / (1 + s)              (saturating, → 0.95)
 *
 * sign basis  → signal = |as_of_value|, deadband = epsilon
 * delta basis → signal = |as_of_value - prior_value|, deadband = epsilon (×|prior| if relative)
 */
export function signalConfidence(
  asOfValue: number,
  priorValue: number | null,
  cfg: ResolvedGradeConfig,
): number {
  const epsilon = cfg.epsilon ?? 0;
  let signal: number;
  let deadband: number;
  if (cfg.grade_basis === "sign") {
    signal = Math.abs(asOfValue);
    deadband = epsilon;
  } else {
    const prior = priorValue ?? 0;
    signal = Math.abs(asOfValue - prior);
    deadband = cfg.epsilon_mode === "relative" ? epsilon * Math.abs(prior) : epsilon;
  }
  if (deadband <= 0) return 0.5;
  const s = Math.max(0, signal - deadband) / deadband;
  return Math.min(0.95, 0.5 + 0.45 * (s / (1 + s)));
}

/** One fully-resolved, graded retrodicted call — the shape written to backtest_grades. */
export interface GradedBacktestCall {
  slug: string;
  family: string;
  as_of_date: string;
  predicted_direction: "bullish" | "bearish";
  baseline_value: number;
  prior_value: number | null;
  window_days: number;
  window_end_date: string;
  observed_value: number;
  observed_direction: ObservedDirection;
  grade: Grade;
  magnitude_error: number;
  confidence: number;
  source_tag: SourceTag;
}

export interface BuildGradedCallOpts {
  family: string;
  source_tag: SourceTag;
  /** Days back for the delta-basis prior_value (the call's lookback). Ignored for sign basis. */
  lookbackDays: number;
}

/**
 * Build one graded retrodicted call for (slug, asOf), or null when it cannot be
 * graded honestly. Null cases (each is a real drop, never a silent guess):
 *   • cfg not gradeable / no window_days
 *   • no vintage published by asOf (PIT prior/as-of unavailable)
 *   • delta basis but no prior published by asOf
 *   • no outcome published by window_end yet (the future hasn't been observed)
 *   • computeBacktestCall returns null OR a neutral call (not a directional bet)
 *
 * baseline_value = the as-of level; observed_value = the level at window close; the
 * realized direction is computeDirection(observed, baseline) — exactly the live
 * grader's comparison, only the inputs are point-in-time-reconstructed.
 */
export function buildGradedCall(
  slug: string,
  asOf: string,
  initials: Vintage[],
  cfg: ResolvedGradeConfig,
  opts: BuildGradedCallOpts,
): GradedBacktestCall | null {
  if (!cfg.gradeable || cfg.window_days == null) return null;

  const asOfPoint = pitInitial(initials, asOf);
  if (!asOfPoint) return null;

  const windowEnd = addDaysUTC(asOf, cfg.window_days);
  const observedPoint = pitInitial(initials, windowEnd);
  if (!observedPoint) return null;

  // Delta basis needs a prior visible at asOf; sign basis ignores it.
  let priorValue: number | null = null;
  if (cfg.grade_basis === "delta") {
    const priorPoint = pitInitial(initials, addDaysUTC(asOf, -opts.lookbackDays));
    if (!priorPoint) return null;
    priorValue = priorPoint.value;
  }

  const call = computeBacktestCall(
    {
      slug,
      as_of_date: asOf,
      as_of_value: asOfPoint.value,
      prior_value: priorValue,
      source_tag: opts.source_tag,
    },
    cfg,
  );
  if (!call || call.direction === "neutral") return null;
  const predicted_direction = call.direction;

  const observed_direction = computeDirection(observedPoint.value, asOfPoint.value, cfg);
  const grade = gradeFromDirections(predicted_direction, observed_direction);
  const magnitude_error =
    cfg.grade_basis === "sign" ? observedPoint.value : observedPoint.value - asOfPoint.value;

  return {
    slug,
    family: opts.family,
    as_of_date: asOf,
    predicted_direction,
    baseline_value: asOfPoint.value,
    prior_value: priorValue,
    window_days: cfg.window_days,
    window_end_date: windowEnd,
    observed_value: observedPoint.value,
    observed_direction,
    grade,
    magnitude_error,
    confidence: signalConfidence(asOfPoint.value, priorValue, cfg),
    source_tag: opts.source_tag,
  };
}
