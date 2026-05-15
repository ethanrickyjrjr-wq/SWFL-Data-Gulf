/**
 * BrainOutput — the standardized one-page output every brain produces.
 * This is what flows through thin pipes between brains. Downstream consumers
 * read ONLY this object — never the upstream brain's raw branches.
 *
 * Rendered as a JSON block inside the --- OUTPUT --- section of the reference
 * fence. Parsed by BrainInputSource when a downstream brain declares the
 * upstream brain in its input_brains array.
 *
 * V3 contract. Spec: docs/v3-synthesis-spec.md §1. Locked 2026-05-15.
 *
 * Field ownership:
 *  - Engine (Stage 4) owns: brain_id, version, refined_at, confidence,
 *    trust_tier, upstream_count, relevance.
 *  - Producer owns: conclusion, key_metrics, caveats, direction, magnitude,
 *    drivers, overrides, contradicts, exogenous_signals.
 *
 * "Math in code, narrative in producers."
 */

import type { ExogenousSignal } from "./exogenous-signal.mts";

export type BrainOutputDirection = "bullish" | "bearish" | "neutral" | "mixed";

export type DecayCurve = "hours" | "days" | "weeks" | "months" | "permanent";

export type BrainTrustTier = 1 | 2 | 3 | 4;

export interface BrainOutputMetric {
  /** machine-readable slug, e.g. "sofr_30d" */
  metric: string;
  /** numeric value */
  value: number;
  direction: "rising" | "falling" | "stable";
  /** human-readable label, e.g. "30-Day SOFR Rate" */
  label: string;
}

export interface BrainOutputRelevance {
  decay_curve: DecayCurve;
  /** target half-life of this brain's relevance, in hours */
  half_life_hours: number;
  /** ISO 8601 — when this relevance window was computed (mirrors refined_at) */
  computed_at: string;
}

export interface BrainOutput {
  /** mirrors the brain's frontmatter brain_id */
  brain_id: string;
  /** mirrors the brain's frontmatter version */
  version: number;
  /** ISO 8601 timestamp — mirrors refined_at */
  refined_at: string;

  /** qualitative read of the brain's data */
  direction: BrainOutputDirection;
  /** 0.0-1.0 strength of the read */
  magnitude: number;
  /** upstream brain_ids whose direction contributed to the winning vote */
  drivers: string[];
  /** override_ids that fired during synthesis (e.g. "flood-veto") */
  overrides: string[];

  /**
   * The brain's distilled answer. Plain English, 2-5 sentences.
   * A non-expert should get the picture from this alone.
   */
  conclusion: string;
  /** 3-8 metrics. Empty array is valid for narrative-only outputs. */
  key_metrics: BrainOutputMetric[];
  /** 1-4 honest limitation statements. Empty array if none. */
  caveats: string[];
  /**
   * Pairwise contradictions surfaced during synthesis. Each entry is a
   * human-readable string of the form
   *   "{a.brain_id} ({a.direction}) vs {b.brain_id} ({b.direction})"
   * Empty array if no contradictions detected.
   */
  contradicts: string[];

  /**
   * 0.0-1.0. DETERMINISTIC — computed from source trust tiers, TTL freshness,
   * and upstream-confidence propagation. Never produced by the synthesis agent.
   * Formula in refinery/lib/confidence.mts.
   */
  confidence: number;
  /**
   * Trust tier inherited from sources / upstreams. Worst (highest number)
   * wins per spec §2 step 7.
   */
  trust_tier: BrainTrustTier;
  /**
   * Number of upstream brains that PASSED the relevance floor. For primary
   * brains (no upstreams), equals 0. Master synthesis treats 0 as
   * "insufficient data → emit neutral/insufficient" per spec §2 step 8.
   */
  upstream_count: number;

  /** Temporal-decay metadata used by downstream brains' relevance computation. */
  relevance: BrainOutputRelevance;

  /**
   * Reserved exogenous-signal slot. Empty array in v1; populated by the
   * Context Signal Brain starting Week 6-8 (NOAA storm alerts first).
   * Omitted from the JSON only when explicitly absent; producers should
   * emit `[]` rather than omit.
   */
  exogenous_signals?: ExogenousSignal[];
}

/**
 * The narrative + qualitative fields a per-pack outputProducer is responsible
 * for emitting. Engine fields (brain_id, version, refined_at, confidence,
 * trust_tier, upstream_count, relevance) are computed deterministically by
 * Stage 4 and overlaid afterwards.
 */
export type BrainOutputProducerResult = Pick<
  BrainOutput,
  | "conclusion"
  | "key_metrics"
  | "caveats"
  | "direction"
  | "magnitude"
  | "drivers"
  | "overrides"
  | "contradicts"
  | "exogenous_signals"
>;
