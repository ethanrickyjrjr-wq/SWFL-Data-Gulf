// lib/desk/alerts.ts — the /desk threshold-alert rail, derived in pure code.
//
// Condition-driven (distinct from the chronological Wire): each rule is a
// CODE-OWNED constant threshold over data the page already loaded, and every
// alert carries its source datum's own sourceLabel + as-of verbatim. Nothing
// here fetches, nothing is model-chosen, and a quiet market produces [] —
// the rail hides.

import type { DeskData, DeskDatum } from "./types";

export interface DeskAlert {
  id: string;
  headline: string;
  detail?: string;
  sourceLabel: string;
  asOf?: string;
}

/** Region-wide price-cut share at or above this % is worth flagging — roughly
 *  one in five active listings repricing. */
export const PRICE_CUT_SHARE_ALERT_PCT = 20;

/** A 30-yr fixed move of ≥ 0.10 percentage points between readings — the
 *  size that shifts a payment conversation. */
export const MORTGAGE_MOVE_ALERT_PTS = 0.1;

/** A hero-city price move of ≥ 5% vs. the prior reading. */
export const HERO_MOVE_ALERT_FRACTION = 0.05;

/** Ignore cuts-vs-new flips on days with fewer cuts than this — tiny-sample
 *  days flip on noise. */
export const PULSE_FLIP_MIN_CUTS = 10;

function mortgageAlert(kpis: DeskDatum[]): DeskAlert | null {
  const m = kpis.find((k) => k.national && k.delta != null);
  if (!m || m.delta == null || Math.abs(m.delta) < MORTGAGE_MOVE_ALERT_PTS) return null;
  const dir = m.direction === "down" ? "fell" : "rose";
  return {
    id: "alert-mortgage",
    headline: `${m.label} ${dir} ${m.deltaDisplay ?? Math.abs(m.delta).toFixed(2)}`,
    detail: `now ${m.display}${m.deltaNote ? ` (${m.deltaNote})` : ""}`,
    sourceLabel: m.sourceLabel,
    asOf: m.asOf,
  };
}

export function deriveAlerts(
  desk: Pick<DeskData, "kpis" | "gauges" | "pulse" | "hero">,
): DeskAlert[] {
  const alerts: DeskAlert[] = [];

  const pr = desk.gauges.priceReduced;
  if (pr && pr.value >= PRICE_CUT_SHARE_ALERT_PCT) {
    alerts.push({
      id: "alert-price-cut-share",
      headline: `Price cuts elevated — ${pr.display} of active listings`,
      sourceLabel: pr.sourceLabel,
      asOf: pr.asOf,
    });
  }

  const m = mortgageAlert(desk.kpis);
  if (m) alerts.push(m);

  // Latest complete pulse day where cuts outran new supply. Partial scans and
  // their carryover day are excluded — an incomplete sweep flips on artifact.
  const day = desk.pulse?.days.filter((d) => !d.partial && !d.carryoverAfterPartial).at(-1);
  if (day && day.priceCuts >= PULSE_FLIP_MIN_CUTS && day.priceCuts > day.newListings) {
    alerts.push({
      id: "alert-pulse-flip",
      headline: `Price cuts outpaced new listings on ${day.label}`,
      detail: `${day.priceCuts} cuts vs. ${day.newListings} new`,
      sourceLabel: desk.pulse?.sourceLabel ?? "SWFL Data Gulf",
      asOf: desk.pulse?.asOf,
    });
  }

  for (const c of desk.hero?.cities ?? []) {
    const d = c.latest;
    if (d.delta == null || d.value === d.delta) continue;
    const prev = d.value - d.delta;
    if (prev <= 0 || Math.abs(d.delta) / prev < HERO_MOVE_ALERT_FRACTION) continue;
    const dir = d.direction === "down" ? "down" : "up";
    alerts.push({
      id: `alert-hero-${c.key}`,
      headline: `${d.label} ${dir} ${d.deltaDisplay ?? ""}`.trim(),
      detail: `now ${d.display}${d.deltaNote ? ` (${d.deltaNote})` : ""}`,
      sourceLabel: d.sourceLabel,
      asOf: d.asOf,
    });
  }

  return alerts;
}
