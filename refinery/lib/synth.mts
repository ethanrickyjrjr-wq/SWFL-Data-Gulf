/**
 * Master synthesizer — pure functions implementing spec §2 (steps 0-8).
 *
 * Spec: docs/v3-synthesis-spec.md §2 (synthesis steps) and §6 (function list).
 *
 * Deterministic, no I/O, no time-of-day side effects (callers pass `now`).
 * Each function below is independently testable; the
 * `masterSynthesizerOutputProducer` composes them in spec order.
 */

import type {
  BrainOutput,
  BrainOutputDirection,
  BrainOutputMetric,
  BrainOutputProducerResult,
  BrainOutputRelevance,
  BrainTrustTier,
  DecayCurve,
} from "../types/brain-output.mts";
import type { ExogenousSignal } from "../types/exogenous-signal.mts";
import type { OverrideRule } from "../constitution/types.mts";

const MS_PER_HOUR = 3_600_000;

/** A passing upstream + its computed relevance factor. */
export interface PassingUpstream {
  upstream: BrainOutput;
  factor: number;
}

/** Step 2 result — direction vote before override cascade fires. */
export interface DirectionVote {
  direction: BrainOutputDirection;
  magnitude: number;
  drivers: string[];
  agreement_ratio: number;
  weights: { bullish: number; bearish: number; neutral: number };
}

/** Step 3 result — direction + magnitude after cascade may have forced them. */
export interface OverrideResult {
  direction: BrainOutputDirection;
  magnitude: number;
  overrides: string[];
  caveats: string[];
}

/**
 * Step 0 — exponential half-life relevance factor.
 *   factor = 0.5 ^ (hours_since_computed_at / half_life_hours)
 * Capped at 1.0, floored at 0.0. Returns 0 on malformed input.
 */
export function computeRelevanceFactor(b: BrainOutput, now: Date): number {
  const computedAt = Date.parse(b.relevance.computed_at);
  if (!Number.isFinite(computedAt)) return 0;
  const halfLife = b.relevance.half_life_hours;
  if (halfLife <= 0) return 0;
  const hoursOld = Math.max(0, (now.getTime() - computedAt) / MS_PER_HOUR);
  const factor = Math.pow(0.5, hoursOld / halfLife);
  return Math.max(0, Math.min(1, factor));
}

/**
 * Step 1 — Relevance-floor exclusion. Returns the passing set, the excluded
 * set, and the per-excluded caveat strings (spec §2 step 1 shape).
 */
export function applyRelevanceFloor(
  upstreams: BrainOutput[],
  floor: number,
  now: Date,
): {
  passing: PassingUpstream[];
  excluded: PassingUpstream[];
  caveats: string[];
} {
  const passing: PassingUpstream[] = [];
  const excluded: PassingUpstream[] = [];
  const caveats: string[] = [];
  for (const u of upstreams) {
    const factor = computeRelevanceFactor(u, now);
    if (factor < floor) {
      excluded.push({ upstream: u, factor });
      caveats.push(
        `${u.brain_id} excluded from synthesis (relevance ${factor.toFixed(3)}, below floor ${floor})`,
      );
    } else {
      passing.push({ upstream: u, factor });
    }
  }
  return { passing, excluded, caveats };
}

/**
 * Step 2 — Direction voting + magnitude with the mixed-direction split.
 *
 * Each upstream's weighted contribution is `magnitude × confidence ×
 * relevance_factor`. Upstreams whose direction is "mixed" split their weight
 * 50/50 across bullish/bearish — honest uncertainty propagation (locked).
 *
 * Winning direction is adopted iff `agreement_ratio ≥ 0.60`; otherwise the
 * outcome is "mixed". When mixed, drivers is the full passing set so the
 * conclusion still names who pulled which way (contradicts surfaces the conflict).
 */
export function voteDirection(passing: PassingUpstream[]): DirectionVote {
  const weights = { bullish: 0, bearish: 0, neutral: 0 };
  for (const { upstream: u, factor } of passing) {
    const w = u.magnitude * u.confidence * factor;
    if (u.direction === "mixed") {
      weights.bullish += 0.5 * w;
      weights.bearish += 0.5 * w;
    } else if (u.direction === "bullish") {
      weights.bullish += w;
    } else if (u.direction === "bearish") {
      weights.bearish += w;
    } else if (u.direction === "neutral") {
      weights.neutral += w;
    }
  }
  const total = weights.bullish + weights.bearish + weights.neutral;
  if (total === 0) {
    return {
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      agreement_ratio: 0,
      weights,
    };
  }
  const sortedKeys = (Object.keys(weights) as Array<keyof typeof weights>).sort(
    (a, b) => weights[b] - weights[a],
  );
  const winningKey = sortedKeys[0];
  const agreement_ratio = weights[winningKey] / total;
  if (agreement_ratio >= 0.6) {
    // Mixed upstreams contributed to both bullish and bearish — count them as
    // drivers of either non-neutral winner, so the conclusion still names them.
    const winners = passing.filter(
      ({ upstream }) =>
        upstream.direction === winningKey ||
        (winningKey !== "neutral" && upstream.direction === "mixed"),
    );
    const avgMag =
      winners.length === 0
        ? 0
        : winners.reduce((s, { upstream }) => s + upstream.magnitude, 0) /
          winners.length;
    return {
      direction: winningKey,
      magnitude: agreement_ratio * avgMag,
      drivers: winners.map(({ upstream }) => upstream.brain_id),
      agreement_ratio,
      weights,
    };
  }
  return {
    direction: "mixed",
    magnitude: agreement_ratio,
    drivers: passing.map(({ upstream }) => upstream.brain_id),
    agreement_ratio,
    weights,
  };
}

/**
 * Step 3 — Apply the override cascade in priority order (high → low).
 *
 * First direction-forcing match wins; subsequent direction-forcing rules are
 * skipped. `add_caveat` rules stack — every matching add_caveat rule appends
 * its override_id + caveat string.
 *
 * Per spec §2 step 3 an override sets `magnitude = max(current, 0.85)`.
 *
 * For `force_signal_direction`, v1 routes on the FIRST signal matching the
 * canonical critical-confirmed shape (only signal-direction-forcing rule in
 * the spec today). Future rules with different signal predicates will need a
 * per-rule signal picker — easy extension when that arrives.
 */
export function applyOverrideCascade(
  vote: DirectionVote,
  passing: PassingUpstream[],
  signals: ExogenousSignal[],
  cascade: OverrideRule[],
): OverrideResult {
  const sorted = [...cascade].sort((a, b) => b.priority - a.priority);
  const upstreams = passing.map((p) => p.upstream);
  let direction: BrainOutputDirection = vote.direction;
  let magnitude = vote.magnitude;
  const overrides: string[] = [];
  const caveats: string[] = [];
  let directionForced = false;

  for (const rule of sorted) {
    if (!rule.condition(upstreams, signals)) continue;
    if (rule.effect === "add_caveat") {
      overrides.push(rule.override_id);
      caveats.push(
        `Override "${rule.override_id}" fired (priority ${rule.priority})`,
      );
      continue;
    }
    if (directionForced) continue;
    if (rule.effect === "force_bearish") {
      direction = "bearish";
      magnitude = Math.max(magnitude, 0.85);
      overrides.push(rule.override_id);
      caveats.push(
        `Override "${rule.override_id}" forced bearish (priority ${rule.priority})`,
      );
      directionForced = true;
    } else if (rule.effect === "force_bullish") {
      direction = "bullish";
      magnitude = Math.max(magnitude, 0.85);
      overrides.push(rule.override_id);
      caveats.push(
        `Override "${rule.override_id}" forced bullish (priority ${rule.priority})`,
      );
      directionForced = true;
    } else if (rule.effect === "force_signal_direction") {
      const sig = signals.find(
        (s) =>
          s.severity === "critical" &&
          s.classification === "confirmed" &&
          s.confidence > 0.85,
      );
      if (sig && sig.direction !== "neutral") {
        direction = sig.direction;
        magnitude = Math.max(magnitude, 0.85);
        overrides.push(rule.override_id);
        caveats.push(
          `Override "${rule.override_id}" forced ${direction} from signal "${sig.entity}" (priority ${rule.priority})`,
        );
        directionForced = true;
      }
    }
  }

  return { direction, magnitude, overrides, caveats };
}

/**
 * Step 4 — Pairwise contradictions among passing upstreams. Restricted to
 * pairs where BOTH are non-neutral, non-mixed AND BOTH have confidence > 0.5.
 * Strings shaped exactly per spec §2 step 4.
 */
export function detectContradictions(passing: PassingUpstream[]): string[] {
  const out: string[] = [];
  const xs = passing.map((p) => p.upstream);
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      const a = xs[i];
      const b = xs[j];
      if (a.direction === b.direction) continue;
      if (a.direction === "neutral" || b.direction === "neutral") continue;
      if (a.direction === "mixed" || b.direction === "mixed") continue;
      if (a.confidence <= 0.5 || b.confidence <= 0.5) continue;
      out.push(
        `${a.brain_id} (${a.direction}) vs ${b.brain_id} (${b.direction})`,
      );
    }
  }
  return out;
}

/** Step 5 — Conclusion template composition. Deterministic, no LLM. */
export function composeConclusion(args: {
  direction: BrainOutputDirection;
  magnitude: number;
  drivers: string[];
  overrides: string[];
  contradicts: string[];
  confidence: number;
  trust_tier: BrainTrustTier;
  upstream_count: number;
}): string {
  const {
    direction,
    magnitude,
    drivers,
    overrides,
    contradicts,
    confidence,
    trust_tier,
    upstream_count,
  } = args;
  const dirClause = {
    bullish: "Read is bullish",
    bearish: "Read is bearish",
    neutral: "Read is neutral",
    mixed: "Read is mixed",
  }[direction];
  const magDesc =
    magnitude >= 0.75 ? "high" : magnitude >= 0.4 ? "moderate" : "low";
  const parts: string[] = [`${dirClause} (${magDesc} magnitude).`];
  if (drivers.length > 0) parts.push(`Driven by: ${drivers.join(", ")}.`);
  if (overrides.length > 0) parts.push(`Overrides: ${overrides.join(", ")}.`);
  if (contradicts.length > 0) parts.push(`Note conflicts: ${contradicts[0]}.`);
  const plural = upstream_count === 1 ? "" : "s";
  parts.push(
    `Combined confidence ${confidence.toFixed(2)}, trust tier T${trust_tier}, based on ${upstream_count} upstream brain${plural}.`,
  );
  return parts.join(" ");
}

/**
 * Step 6 — Key-metrics rollup. Each upstream contributes its top 1-2 metrics
 * (`key_metrics[0..1]`). Capped at 8 total; v1 tiebreak rule when >8 candidates
 * is drop-by-DAG-topo-order (first-come). `passing` arrives in DAG order, so a
 * straight slice is exactly that rule.
 */
export function rollupKeyMetrics(
  passing: PassingUpstream[],
): BrainOutputMetric[] {
  const out: BrainOutputMetric[] = [];
  for (const { upstream } of passing) {
    for (const m of upstream.key_metrics.slice(0, 2)) {
      out.push(m);
    }
  }
  return out.slice(0, 8);
}

/**
 * Step 7 — Decay propagation. `half_life_hours` is the weighted average across
 * passing upstreams (weight = magnitude × confidence × relevance_factor — same
 * formula as direction voting). `decay_curve` quantized per spec thresholds.
 */
export function propagateDecay(
  passing: PassingUpstream[],
  now: Date,
): BrainOutputRelevance {
  const computed_at = now.toISOString();
  if (passing.length === 0) {
    return { decay_curve: "hours", half_life_hours: 24, computed_at };
  }
  let totalWeight = 0;
  let weightedHL = 0;
  for (const { upstream, factor } of passing) {
    const w = upstream.magnitude * upstream.confidence * factor;
    weightedHL += w * upstream.relevance.half_life_hours;
    totalWeight += w;
  }
  const half_life_hours =
    totalWeight > 0
      ? weightedHL / totalWeight
      : passing.reduce((s, p) => s + p.upstream.relevance.half_life_hours, 0) /
        passing.length;
  return {
    decay_curve: quantizeDecay(half_life_hours),
    half_life_hours,
    computed_at,
  };
}

function quantizeDecay(hours: number): DecayCurve {
  if (hours < 72) return "hours";
  if (hours < 500) return "days";
  if (hours < 2000) return "weeks";
  if (hours < 8760) return "months";
  return "permanent";
}

/**
 * Step 8 — Empty-synthesis result. Master NEVER hallucinates from nothing.
 * Returns the full BrainOutputProducerResult slice that the master producer
 * can return directly.
 */
export function emptySynthesisResult(
  originalCount: number,
  floor: number,
  now: Date,
): BrainOutputProducerResult {
  const computed_at = now.toISOString();
  return {
    direction: "neutral",
    magnitude: 0,
    drivers: [],
    overrides: [],
    conclusion: `Insufficient current data for synthesis. ${originalCount} upstream brains below relevance floor ${floor}.`,
    key_metrics: [],
    caveats: ["All upstream brains below relevance threshold"],
    contradicts: [],
    upstream_count: 0,
    trust_tier: 4,
    relevance: { decay_curve: "hours", half_life_hours: 24, computed_at },
    exogenous_signals: [],
  };
}
