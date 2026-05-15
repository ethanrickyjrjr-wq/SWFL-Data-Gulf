/**
 * BrainOutput — the standardized one-page output every brain produces.
 * This is what flows through thin pipes between brains. Downstream consumers
 * read ONLY this object — never the upstream brain's raw branches.
 *
 * Rendered as a JSON block inside the --- OUTPUT --- section of the reference
 * fence. Parsed by BrainInputSource when a downstream brain declares
 * the upstream brain in its input_brains array.
 */

export interface BrainOutputMetric {
  /** machine-readable slug, e.g. "sofr_30d" */
  metric: string;
  /** numeric value */
  value: number;
  direction: "rising" | "falling" | "stable";
  /** human-readable label, e.g. "30-Day SOFR Rate" */
  label: string;
}

export interface BrainOutput {
  /** mirrors the brain's frontmatter brain_id */
  brain_id: string;
  /** mirrors the brain's frontmatter version */
  version: number;
  /** ISO 8601 timestamp — mirrors refined_at */
  refined_at: string;
  /**
   * The brain's distilled answer. Plain English, 2-5 sentences.
   * A non-expert should get the picture from this alone.
   */
  conclusion: string;
  /**
   * 0.0–1.0. DETERMINISTIC — computed from source trust tiers and TTL
   * freshness. Never produced by the synthesis agent.
   * Formula: avg(source_trust_tier_score) × freshness_ratio
   *   trust_tier_score: tier 1 → 1.0 | tier 2 → 0.8 | tier 3 → 0.6 | tier 4+ → 0.4
   *   freshness_ratio: min(1.0, days_remaining_in_ttl / ttl_days)
   */
  confidence: number;
  /** 3–8 metrics. Empty array is valid for narrative-only outputs. */
  key_metrics: BrainOutputMetric[];
  /** 1–4 honest limitation statements. Empty array if none. */
  caveats: string[];
}
