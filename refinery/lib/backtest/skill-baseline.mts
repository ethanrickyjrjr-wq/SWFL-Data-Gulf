/**
 * Skill baseline for the Track-B backtest (flywheel_backtest_decision_function).
 *
 * Pure arithmetic — no external imports, no I/O. Scores a set of directional
 * calls against a persistence null (predict_t = observed_{t-1}) and reports the
 * lift, so a "we beat naive carry-forward" claim is a measured number, not a vibe.
 *
 * Denominator (locked, Option b): a call is SCORED ("in-set") iff it is not the
 * first call for its slug (persistence needs a prior) AND its observed outcome is
 * directional (a neutral observed is inconclusive for a directional call). Both
 * system_accuracy and persistence_accuracy are computed over this one shared set
 * so `lift` is an honest delta. A neutral observation is excluded as a TARGET but
 * is retained in the series as the PRIOR for the next call.
 *
 * SOURCE (cited per the no-uncited-constants / magic-number rule — the cutoff is a
 * methodology choice, not a free parameter): the persistence-null lift baseline is
 * locked in docs/superpowers/plans/2026-06-03-row-tier/HANDOFF.md, item 2 —
 * "report lift over a persistence null, never raw accuracy" (a directional rule on
 * a trending series, e.g. hosp_tdt_post_ian_recovery_ratio, scores ~100% by
 * autocorrelation). The non-first / non-neutral cutoff operationalizes that
 * decision (persistence requires a prior; a neutral observed is an inconclusive
 * directional target) and is gated by check flywheel_backtest_decision_function.
 *
 * Provenance is NOT silent: every scored call carries source_tag, the scored
 * denominator is broken out in n_calls_by_tag, and a clean lake_tier1-only
 * accuracy ships alongside the blended system_accuracy. If the two diverge, the
 * caption is forced to acknowledge ODD (odd_extract) contamination.
 */

import type { SourceTag } from "./decision-fn.mts";

export type Direction = "bullish" | "bearish" | "neutral";

export interface ScoredCall {
  slug: string;
  family: string;
  as_of_date: string; // YYYY-MM-DD
  predicted: "bullish" | "bearish";
  observed: Direction;
  /** Precomputed by the caller — same semantics as the forward grader. */
  correct: boolean;
  source_tag: SourceTag;
}

export interface SkillScore {
  /** Blended accuracy over ALL scored calls, any source_tag. */
  system_accuracy: number;
  /** Accuracy over scored calls with source_tag === "lake_tier1" ONLY (odd_extract + fixture excluded). */
  lake_tier1_accuracy: number;
  persistence_accuracy: number;
  /** system_accuracy - persistence_accuracy (same shared denominator). */
  lift: number;
  /** Scored calls: non-first-per-slug AND non-neutral observed. */
  n_calls: number;
  /** Distinct family strings across the INPUT calls (effective N for the caption). */
  n_families: number;
  n_correct: number;
  n_persistence_correct: number;
  /** Scored denominator partitioned by source_tag (sums to n_calls). */
  n_calls_by_tag: Record<string, number>;

  // ── the PAIRED 2x2 (system × persistence, over the one shared denominator) ─────
  // `lift` is a difference of two accuracies measured on the SAME rows, so its
  // uncertainty is a PAIRED question: only the discordant cells (n_system_only,
  // n_persistence_only) carry information about the difference. The instrument
  // emits the cells so callers quote uncertainty from the instrument instead of
  // hand-computing it off n_correct/n_persistence_correct (which loses the
  // pairing) or omitting it. Exact McNemar runs on the two discordant cells.
  // The four cells sum to n_calls.
  /** System correct AND persistence correct. */
  n_both_correct: number;
  /** System correct, persistence WRONG (a discordant cell — favors the system). */
  n_system_only: number;
  /** Persistence correct, system WRONG (a discordant cell — favors the null). */
  n_persistence_only: number;
  /** Both wrong. */
  n_neither: number;
}

/**
 * Persistence null for one slug's ordered observation series: predict_t =
 * observed_{t-1}. Output has length max(0, n-1); empty/single input → []. Neutral
 * observations are emitted as predictions (the neutral-target filter lives in the
 * scorer, not here). Pure positional shift — the caller sorts.
 */
export function computePersistenceNull(
  observations: Array<{ date: string; direction: Direction }>,
): Array<{ date: string; predicted: Direction }> {
  const out: Array<{ date: string; predicted: Direction }> = [];
  for (let i = 1; i < observations.length; i++) {
    out.push({
      date: observations[i].date,
      predicted: observations[i - 1].direction,
    });
  }
  return out;
}

/**
 * Score directional calls against the persistence null. Reconstructs the
 * persistence prediction internally (group by slug, sort by as_of_date, call
 * computePersistenceNull) rather than taking it as a param — the harness this
 * feeds does not exist yet.
 */
export function computeSkillScore(calls: ScoredCall[]): SkillScore {
  let n_calls = 0;
  let n_correct = 0;
  let n_persistence_correct = 0;
  let lt_n = 0;
  let lt_correct = 0;
  let n_both_correct = 0;
  let n_system_only = 0;
  let n_persistence_only = 0;
  let n_neither = 0;
  const n_calls_by_tag: Record<string, number> = {};

  // Group by slug.
  const bySlug = new Map<string, ScoredCall[]>();
  for (const c of calls) {
    const g = bySlug.get(c.slug);
    if (g) g.push(c);
    else bySlug.set(c.slug, [c]);
  }

  for (const group of bySlug.values()) {
    // Sort ascending by as_of_date (lexicographic is correct for YYYY-MM-DD).
    const ordered = [...group].sort((a, b) =>
      a.as_of_date < b.as_of_date ? -1 : a.as_of_date > b.as_of_date ? 1 : 0,
    );
    const preds = computePersistenceNull(
      ordered.map((c) => ({ date: c.as_of_date, direction: c.observed })),
    );
    // preds[k] aligns to ordered[k + 1] (the first call has no prior).
    for (let k = 0; k < preds.length; k++) {
      const target = ordered[k + 1];
      if (target.observed === "neutral") continue; // inconclusive target — drop, but it stays a prior

      // EDGE (intentional, but CHARITABLE to the system — corrected 08/27/2026):
      // when the PRIOR observation was neutral, preds[k].predicted is "neutral", so
      // the persistence null predicts neutral against this directional target and
      // scores as a MISS below (neutral never equals bullish/bearish). We do NOT
      // skip such rows: the row stays in the SHARED denominator (n_calls++), the
      // null is structurally unable to score it, and the system scores it at its
      // own base rate.
      //
      // THE PRIOR COMMENT HERE HAD THIS BACKWARDS. A forced miss makes the naive
      // carry-forward WEAKER, therefore EASIER to beat — it depresses
      // persistence_accuracy while system_accuracy falls only at its base rate. So
      // `lift` is biased UPWARD, not downward; it is NOT "a clean lower bound on
      // system skill." Do not re-invert this.
      //
      // It is not a clean bound in EITHER direction. Writing n' for the scored rows
      // excluding this one, A = (n_correct' - n_persistence_correct') for those
      // rows, and x ∈ {0,1} for whether the system got THIS row right, including it
      // raises lift iff n'·x > A. So a single row the system also misses can deflate
      // lift when the system is already ahead (A > 0). In EXPECTATION it inflates:
      // with system base rate p and persistence base rate q on the other rows,
      // n'·p > n'·(p - q) holds whenever the null hits at least once elsewhere.
      // Direction pinned by the "neutral-prior row biases lift UPWARD" test.
      //
      // MAGNITUDE (attributed, not re-measured here): on the reconciled corpus
      // logged in SESSION_LOG (N=138 / system .4203 / persistence .4855 / lift
      // -.0652), exactly 1 of 138 scored rows has a neutral prior, and the system
      // happens to get it right. Excluding it: 57/137 vs 67/137, lift -7.3pp against
      // the reported -6.5pp. Tiny here, but the sign of the bias is the point — the
      // published lift flatters the system by ~0.8pp on that corpus.
      //
      // Behavior is UNCHANGED by this correction: n_calls semantics are load-bearing
      // for every historical number and for the SQL mirrors in
      // docs/sql/20260608_{glass_views,data_targets}.sql. Only the reasoning was
      // wrong. Also pinned by the "neutral prior ... counts as a persistence miss"
      // test, which remains correct as a statement of BEHAVIOR.
      n_calls++;
      n_calls_by_tag[target.source_tag] = (n_calls_by_tag[target.source_tag] ?? 0) + 1;
      const sysOk = target.correct;
      const persOk = preds[k].predicted === target.observed;
      if (sysOk) n_correct++;
      if (persOk) n_persistence_correct++;
      if (sysOk && persOk) n_both_correct++;
      else if (sysOk) n_system_only++;
      else if (persOk) n_persistence_only++;
      else n_neither++;
      if (target.source_tag === "lake_tier1") {
        lt_n++;
        if (target.correct) lt_correct++;
      }
    }
  }

  const system_accuracy = n_calls > 0 ? n_correct / n_calls : 0;
  const persistence_accuracy = n_calls > 0 ? n_persistence_correct / n_calls : 0;
  const lake_tier1_accuracy = lt_n > 0 ? lt_correct / lt_n : 0;

  return {
    system_accuracy,
    lake_tier1_accuracy,
    persistence_accuracy,
    lift: system_accuracy - persistence_accuracy,
    n_calls,
    n_families: new Set(calls.map((c) => c.family)).size,
    n_correct,
    n_persistence_correct,
    n_calls_by_tag,
    n_both_correct,
    n_system_only,
    n_persistence_only,
    n_neither,
  };
}
