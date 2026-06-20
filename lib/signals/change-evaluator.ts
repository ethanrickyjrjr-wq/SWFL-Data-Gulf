/**
 * change-evaluator — pure significance evaluator for metric items.
 *
 * Compares a filed snapshot value against the current brain value and returns
 * a SignificantChange when the delta exceeds the slug's registry threshold.
 * Pure: no DB, no I/O, no Date/random — directly unit-testable.
 */

import type { SignificantChange, SignificanceRegistry } from "./types";

/**
 * Parse a formatted metric value string to a number.
 * Handles common SWFL brain output formats:
 *   "$1,750" → 1750   |   "-3.5% YoY" → -3.5   |   "5.25%" → 5.25
 *   "312" → 312        |   "14,293" → 14293
 * Returns null when the string cannot be parsed as a finite number.
 */
export function parseNumeric(raw: string): number | null {
  const cleaned = raw
    .replace(/[$,]/g, "")
    .replace(/\s*(YoY|MoM|sqft|lbs|tons|per\s+\w+|\/\w+)\s*/gi, "")
    .replace(/%$/, "")
    .trim();
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

/**
 * Infer the value kind from a raw metric string.
 * Gate 1 A3: filed value and current value must share the same kind before
 * numeric comparison. "5.2% YoY" vs "5.2 (index)" → percent vs numeric → mismatch.
 */
function inferValueKind(raw: string): "percent" | "dollar" | "numeric" {
  const trimmed = raw.trim();
  if (/%/.test(trimmed)) return "percent";
  if (/^\$/.test(trimmed)) return "dollar";
  return "numeric";
}

function directionWord(delta: number): string {
  if (delta > 0) return "rose";
  if (delta < 0) return "dropped";
  return "unchanged";
}

function formatAbsDelta(absDelta: number, unit?: string): string {
  if (unit === "basis points") {
    return `${Math.round(absDelta * 100)}bps`;
  }
  const formatted = absDelta % 1 === 0 ? absDelta.toFixed(0) : absDelta.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

function buildDescription(
  delta: number,
  thresholdType: "absolute_change" | "percent_change",
  unit?: string,
): string {
  const dir = directionWord(delta);
  if (delta === 0) return dir;
  const abs = Math.abs(delta);
  if (thresholdType === "percent_change") {
    return `${dir} ${abs.toFixed(1)}%`;
  }
  return `${dir} ${formatAbsDelta(abs, unit)}`;
}

/** Monthly payment on a fully-amortizing loan. ratePct = annual rate in percent. */
function monthlyPayment(ratePct: number, principal: number, months: number): number {
  const r = ratePct / 100 / 12;
  if (r === 0) return principal / months;
  const factor = Math.pow(1 + r, months);
  return (principal * r * factor) / (factor - 1);
}

/**
 * C2 — decision-framed consequence, computed ONLY where it follows deterministically
 * from the move with no external assumptions. Returns undefined otherwise (never invent).
 *
 * 30-yr fixed mortgage rate → amortized monthly-payment delta per $100K financed.
 * Expressed per-$100K so it needs no listing price; the reader scales it to their loan.
 */
function buildConsequence(slug: string, prevRate: number, currRate: number): string | undefined {
  if (slug !== "freshness_mortgage_30yr_fixed_pct") return undefined;
  const per100k = monthlyPayment(currRate, 100_000, 360) - monthlyPayment(prevRate, 100_000, 360);
  if (!isFinite(per100k) || Math.round(per100k) === 0) return undefined;
  const sign = per100k > 0 ? "+" : "−";
  return `≈ ${sign}$${Math.abs(Math.round(per100k))}/mo per $100K financed (30-yr fixed)`;
}

/**
 * Evaluate whether the move from prevValue → currValue for the given slug
 * clears the significance threshold defined in the registry.
 *
 * @param slug        Brain output slug (key into registry)
 * @param label       Human-readable metric label (for the returned shape)
 * @param prevValue   Snapshot value string from the filed metric item
 * @param currValue   Current brain value string
 * @param registry    Loaded from ingest/significance-registry.yaml
 * @returns SignificantChange when threshold exceeded, null otherwise
 */
export function evaluateChange(
  slug: string,
  label: string,
  prevValue: string,
  currValue: string,
  registry: SignificanceRegistry,
): SignificantChange | null {
  const entry = registry[slug] ?? registry["_default"];
  if (!entry) return null;

  const { threshold_type, threshold, monitored_transitions, impact_weight, unit } = entry;

  // ── State change ────────────────────────────────────────────────────────────
  if (threshold_type === "state_change") {
    const transition = `${prevValue}→${currValue}`;
    if (!monitored_transitions?.includes(transition)) return null;
    return {
      slug,
      label,
      previous_value: prevValue,
      current_value: currValue,
      delta_description: `changed from ${prevValue} to ${currValue}`,
      signal_strength: 1.0,
      impact_weight,
      priority: impact_weight,
    };
  }

  // ── Numeric evaluation ──────────────────────────────────────────────────────
  if (threshold === undefined) return null;

  // Gate 1 A3: kind guard — both values must be the same format class.
  // Catches "5.2% YoY" (percent) vs "5.2" (numeric): they parse to the same
  // number but are completely different series. Mismatch → silent.
  if (inferValueKind(prevValue) !== inferValueKind(currValue)) return null;

  const prev = parseNumeric(prevValue);
  const curr = parseNumeric(currValue);
  if (prev === null || curr === null) return null;

  let delta: number;
  let signal_strength: number;

  if (threshold_type === "percent_change") {
    // Guard: can't compute relative change from zero
    if (prev === 0) return null;
    delta = ((curr - prev) / Math.abs(prev)) * 100;
    signal_strength = Math.abs(delta) / threshold;
  } else {
    // absolute_change
    delta = curr - prev;
    signal_strength = Math.abs(delta) / threshold;
  }

  if (signal_strength < 1.0) return null;

  return {
    slug,
    label,
    previous_value: prevValue,
    current_value: currValue,
    delta_description: buildDescription(delta, threshold_type, unit),
    consequence: buildConsequence(slug, prev, curr),
    signal_strength,
    impact_weight,
    priority: signal_strength * impact_weight,
  };
}
