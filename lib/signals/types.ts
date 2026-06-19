/**
 * Shared types for the significance evaluation pipeline.
 * Pure data shapes — no I/O, no DB, no side effects.
 */

/** One entry from significance-registry.yaml for a specific slug. */
export interface RegistryEntry {
  threshold_type: "absolute_change" | "percent_change" | "state_change";
  /** Required for absolute_change and percent_change. */
  threshold?: number;
  /** Required for state_change. Format: "prev→curr" e.g. "active→pending". */
  monitored_transitions?: string[];
  /** 1–10: how consequential a threshold-level move is for a real estate project. */
  impact_weight: number;
  /** Optional unit label for delta_description, e.g. "basis points", "percentage points". */
  unit?: string;
}

/** Registry loaded from ingest/significance-registry.yaml. */
export type SignificanceRegistry = Record<string, RegistryEntry>;

/**
 * A metric change that exceeded its significance threshold.
 * Returned by evaluateChange(); null means below threshold (no nudge).
 */
export interface SignificantChange {
  slug: string;
  /** Human-readable metric label from the filed item. */
  label: string;
  /** The snapshot value stored in the metric item (e.g. "-3.5% YoY"). */
  previous_value: string;
  /** The current value from the brain (e.g. "-7.7% YoY"). */
  current_value: string;
  /** Pre-written phrase for the AI: "dropped 4.2 percentage points". */
  delta_description: string;
  /** How far past the threshold: 1.0 = exactly at threshold, 2.0 = 2× threshold. */
  signal_strength: number;
  /** From the registry — how consequential this metric is (1–10). */
  impact_weight: number;
  /** signal_strength × impact_weight — the sort key for ranking changes. */
  priority: number;
}
