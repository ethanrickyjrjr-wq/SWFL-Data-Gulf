/**
 * lib/email/activation/types.ts — the "It's Alive" activation-delta data model.
 *
 * A prospect opts in → email #1 (a cited ZIP report) → email #2 three days later
 * with WHAT CHANGED highlighted. The delta must be REAL (platform moat #1: the
 * system cannot invent a number), so email #1 stores the exact facts it showed in
 * an `ActivationSnapshot`; email #2 diffs a freshly-assembled report against THAT
 * snapshot — "what we showed you Tuesday vs. now" is true by construction.
 *
 * These types are pure data (no I/O) so `computeReportDelta` stays a deterministic,
 * unit-testable function — the delta numbers are computed in code, never written by
 * an LLM (Brain-Factory rule #2).
 */

/** The patch a report is scoped to. Today: a single in-scope SWFL ZIP. */
export interface ActivationScope {
  /** 5-digit ZIP. MUST pass `resolveZip(zip).in_scope` before enrollment. */
  zip: string;
}

/** White-label brand skin (subset of BrandTheme persisted on the prospect row). */
export interface ActivationBrand {
  primary?: string | null;
  accent?: string | null;
  logoUrl?: string | null;
  companyName?: string | null;
}

/**
 * One numeric, deltable fact the report showed — a per-ZIP housing/flood metric.
 * `value` is the raw number (or null when the brain held no row); the delta is a
 * numeric comparison, never a re-rendered string.
 */
export interface SnapshotMetric {
  /** Stable identity, e.g. "housing.median_sale_price" or "env.flood_aal_usd". */
  key: string;
  /** Customer-clean label as shown, e.g. "Median sale price". */
  label: string;
  /** The numeric value, or null when not held for this ZIP. */
  value: number | null;
  /** Suffix for display, e.g. "$" prefix handled by render; here "%", " days", "". */
  unit?: string;
  /** Whether a rise is good news (drives the delta arrow colour downstream). */
  direction?: "higher_is_better" | "lower_is_better" | "neutral";
}

/**
 * One per-brain dossier line the report showed, reduced to a stable fingerprint so
 * email #2 can tell whether the substance changed. The fingerprint strips the
 * freshness token + dates (which move daily and would otherwise read as a change),
 * leaving only the substantive content.
 */
export interface SnapshotLine {
  brain_id: string;
  grain: string;
  is_true_zip: boolean;
  /** Customer-clean label for the change line, e.g. "Daily city pulse". */
  label: string;
  /** Substantive content hash — freshness/date-stripped (see fingerprintText). */
  fingerprint: string;
}

/** The frozen record of exactly what email #1 showed — the delta's left operand. */
export interface ActivationSnapshot {
  zip: string;
  /** The liveness anchor quoted in email #1 (SWFL-7421-v{n}-{YYYYMMDD}). */
  freshness_token: string | null;
  /** ISO timestamp the snapshot was captured (email #1 send time). */
  captured_at: string;
  metrics: SnapshotMetric[];
  lines: SnapshotLine[];
}

/** A single numeric metric that moved between the snapshot and now. */
export interface MetricChange {
  key: string;
  label: string;
  from: number | null;
  to: number | null;
  /** to - from, when both are numbers; null otherwise. */
  delta: number | null;
  /** "up" | "down" | "appeared" | "disappeared" — never invented; derived. */
  direction: "up" | "down" | "appeared" | "disappeared";
  /** Whether the move is good news for the reader (from `direction` polarity). */
  favorable: boolean | null;
  unit?: string;
}

/** A per-brain signal whose substance changed (city pulse, permits, news, …). */
export interface SignalChange {
  brain_id: string;
  label: string;
}

/**
 * The structured, honest diff between a stored snapshot and a current report.
 * `has_change=false` is a first-class outcome: email #2 then leads with the moved
 * freshness token and "re-verified, here's where it stands" — never a manufactured
 * change.
 */
export interface ReportDelta {
  zip: string;
  has_change: boolean;
  /** True when the freshness token advanced (the liveness proof; independent of change). */
  freshness_moved: boolean;
  freshness_token_prev: string | null;
  freshness_token_current: string | null;
  metric_changes: MetricChange[];
  signal_changes: SignalChange[];
}
