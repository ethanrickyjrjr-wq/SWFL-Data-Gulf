/**
 * Week in Review — the pure contract.
 *
 * Design: docs/superpowers/specs/2026-08-06-week-in-review-design.md
 * Plan:   docs/superpowers/plans/2026-08-06-week-in-review-plan.md
 *
 * ⛔ T11 (docs/standards/data-roots.md:76,:119) — READ BEFORE TOUCHING ANY PRICE FIGURE.
 * A price cut has TWO honest answers that disagree BY DESIGN:
 *   · `listing_transitions.price_delta` — OUR FORWARD-ONLY sweep. Sees only cuts
 *     that happened after we started watching a listing. Complete inside a window,
 *     blind before it.
 *   · `steadyapi_listing_events_v.price_change` — the VENDOR'S BACKWARD history.
 *     Carries the full trail back to the original ask, but only for the ~17.9k
 *     properties we probed, so it can NEVER roll up to a ZIP or county.
 *
 * A week-in-review asks exactly one question — what happened INSIDE this window —
 * so the forward-only lane's known blindness costs nothing here, and the vendor
 * lane would be actively wrong (it cannot form an area statistic). This is the one
 * surface where that root is not a compromise but the correct choice.
 *
 * Never sum across the lanes. Never let the vendor lane reach an area share (that
 * root is `listing_momentum_stats.price_reduced_share`, T3).
 */

import type { MarketEventGrain, MarketFact } from "@/lib/email/zip-events/types";

/** The ONLY table this surface reads. Asserted by test, not by convention. */
export const ALLOWED_SOURCE_TABLE = "listing_transitions" as const;

/**
 * The buckets. These are the states the daily sweep already writes — NOT a
 * taxonomy authored here. Counts measured live 08/06/2026 over the prior 7 days
 * (design §1): 1,060 price changes · 527 went pending · 122 sold out of pending ·
 * 74 back on market · 73 sold direct · 27 withdrawn from active · 25 withdrawn
 * from pending.
 *
 * Adding a kind means the sweep started writing one. Renaming a kind means
 * someone stopped reading the feed and started authoring it.
 */
export const TRANSITION_KINDS = [
  "active->active",
  "active->holding",
  "holding->sold",
  "holding->active",
  "active->sold",
  "active->withdrawn",
  "holding->withdrawn",
] as const;

export type TransitionKind = (typeof TRANSITION_KINDS)[number];

/** Reader-facing bucket labels. Kept beside the kinds so a new kind forces one. */
export const KIND_LABELS: Record<TransitionKind, string> = {
  "active->active": "Price changes",
  "active->holding": "Went pending",
  "holding->sold": "Sold out of pending",
  "holding->active": "Back on market",
  "active->sold": "Sold direct",
  "active->withdrawn": "Withdrawn from active",
  "holding->withdrawn": "Withdrawn from pending",
};

export interface Window {
  /** YYYY-MM-DD, inclusive. */
  start: string;
  /** YYYY-MM-DD, inclusive. */
  end: string;
}

export interface WeekEvent {
  kind: TransitionKind;
  count: number;
  facts: MarketFact[];
}

/**
 * Empty and ERROR are different values, deliberately.
 *
 * `lib/figures/sourced.ts` collapses "no rows" and "query failed" into `[]`, which
 * is right for a figure list and WRONG here: on this surface a genuinely quiet ZIP
 * and a broken query would render identically as "nothing happened". That is the
 * §6.3 failure mode, and it is the one place this module must NOT copy that shape.
 */
export type WeekInReviewResult = { ok: true; events: WeekEvent[] } | { ok: false; reason: string };

export function emptyResult(): WeekInReviewResult {
  return { ok: true, events: [] };
}

export function errorResult(reason: string): WeekInReviewResult {
  return { ok: false, reason };
}

/** Only an `ok` result may reach a reader. An error renders as an error. */
export function isRenderable(r: WeekInReviewResult): boolean {
  return r.ok;
}

/**
 * §6.2 — silent window truncation.
 *
 * The sweep is blind before it began watching. A window opening before coverage
 * starts renders an artificially quiet market as though it were the real one, with
 * no visible tell. Refuse it rather than caveat it.
 */
export function windowWithinCoverage(w: Window, coverageStart: string): boolean {
  return w.start >= coverageStart;
}

/**
 * §6.6 — grain leak.
 *
 * A city figure computed from a partial ZIP set, presented as the city's number,
 * is an unsourced claim wearing a real number's clothes. Full coverage needs no
 * label; anything short of it says so plainly.
 */
export function grainCoverageLabel(c: { covered: number; total: number }): string | null {
  if (c.total > 0 && c.covered === c.total) return null;
  return `Based on ${c.covered} of ${c.total} ZIP codes with recorded activity in this window.`;
}

/** Re-exported so callers never reach for a second grain enum. */
export type { MarketEventGrain };
