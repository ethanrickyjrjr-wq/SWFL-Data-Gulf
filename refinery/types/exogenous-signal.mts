/**
 * ExogenousSignal — an externally-injected event a brain reads alongside
 * its own data. Empty array on every brain in v1; populated by the
 * Context Signal Brain (NOAA storm alerts first) at Week 6-8.
 *
 * Carries its own `direction` so the override cascade can route on it
 * (e.g. critical+confirmed signals force the SIGNAL'S direction, not
 * always bearish — per spec decision "Override cascade bullish signals:
 * force the SIGNAL'S direction, not always bearish").
 */

export type ExogenousSignalType =
  | "injury"
  | "weather"
  | "policy"
  | "conflict"
  | "market_shock"
  | "other";

export type ExogenousSignalDirection = "bullish" | "bearish" | "neutral";

export type ExogenousSignalSeverity =
  | "critical"
  | "major"
  | "moderate"
  | "minor";

export type ExogenousSignalClassification =
  | "confirmed"
  | "rumored"
  | "speculative";

export type ExogenousSignalDecayCurve = "hours" | "days" | "weeks" | "months";

export interface ExogenousSignal {
  signal_type: ExogenousSignalType;
  /** human-readable entity the signal is about (e.g. "Hurricane Idalia") */
  entity: string;
  direction: ExogenousSignalDirection;
  severity: ExogenousSignalSeverity;
  /** 0.0-1.0, source-supplied confidence in the signal itself */
  confidence: number;
  classification: ExogenousSignalClassification;
  decay_curve: ExogenousSignalDecayCurve;
  /** human-readable provenance (URL, agency, channel) */
  source: string;
  /** ISO 8601 when the signal was first observed */
  observed_at: string;
}
