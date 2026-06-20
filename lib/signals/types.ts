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
  // ── Phase B1: unified threshold fields (absorbed from data-verification-tolerances.yaml) ──
  /** Category key for fallback to data-verification-tolerances.yaml (e.g. "mortgage_rate"). */
  category?: string;
  /** Z-score vs 30-day rolling mean that flags the metric as implausible. Null = not a time series. */
  z_flag_threshold?: number | null;
  /** Max days since last known value before we omit rather than substitute. */
  max_stale_days?: number;
}

/** Registry loaded from ingest/significance-registry.yaml. */
export type SignificanceRegistry = Record<string, RegistryEntry>;

/**
 * A metric change that exceeded its significance threshold.
 * Returned by evaluateChange(); null means below threshold (no nudge).
 */
export interface SignificantChange {
  slug: string;
  /** The project item this change belongs to — binds the chip + the sticky confirm. */
  item_id: string;
  /** Human-readable metric label from the filed item. */
  label: string;
  /** The snapshot value stored in the metric item (e.g. "-3.5% YoY"). */
  previous_value: string;
  /** The current value from the brain (e.g. "-7.7% YoY"). */
  current_value: string;
  /** Pre-written phrase for the AI: "dropped 4.2 percentage points". */
  delta_description: string;
  /**
   * C2 — decision-framed consequence, present only where it is DETERMINISTIC from
   * the move alone (no invented inputs). E.g. a 30-yr-fixed mortgage-rate move →
   * the amortized monthly-payment delta per $100K financed. Undefined when no
   * consequence can be computed without external assumptions. Never invented.
   */
  consequence?: string;
  /** How far past the threshold: 1.0 = exactly at threshold, 2.0 = 2× threshold. */
  signal_strength: number;
  /** From the registry — how consequential this metric is (1–10). */
  impact_weight: number;
  /** signal_strength × impact_weight — the sort key for ranking changes. */
  priority: number;
}

// ── Qualitative Event Intelligence (Phase 4) ─────────────────────────────────

export type EventType =
  | "opening"
  | "closing"
  | "permit_filed"
  | "construction_start"
  | "zoning_change"
  | "anchor_announced"
  | "business_news";

export type EventSource = "permits_swfl" | "news_crawl" | "google_places_delta" | "operator_manual";

export interface QualEvent {
  entity_name: string;
  entity_brand_key?: string;
  event_type: EventType;
  lat: number;
  lng: number;
  event_date: string;
  source: EventSource;
  headline?: string;
  source_url?: string;
}

export interface ScoredEvent extends QualEvent {
  brand_tier: number;
  brand_weight: number;
  distance_miles: number;
  radius_band: string;
  final_score: number;
  notify_user: boolean;
  inject_ai: boolean;
  ai_summary: string;
  suppressed_reason?: string;
  geocode_source?: "zip_centroid" | "exact";
}

export interface ScoredEventSummary {
  id: string;
  entity_name: string;
  event_type: EventType;
  event_date: string;
  brand_tier: number;
  final_score: number;
  distance_miles: number | null;
  headline: string | null;
  source_url: string | null;
  ai_summary: string;
}

export interface BrandEntry {
  tier: number;
  category: string;
  aliases?: string[];
  weight_open?: number;
  weight_close?: number;
}

export type BrandRegistry = Record<string, BrandEntry>;

export interface RadiusBand {
  radius_miles: number;
  weight_multiplier: number;
}

export interface ProjectTypeConfig {
  radius_bands: RadiusBand[];
  min_score_to_notify: number;
  min_score_for_ai_context: number;
}

export type RadiusConfig = Record<string, ProjectTypeConfig>;
