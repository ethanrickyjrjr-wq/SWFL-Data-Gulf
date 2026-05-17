/**
 * Real-Estate Constitution.
 *
 * Spec: docs/v3-synthesis-spec.md §2 step 3 ("Override cascade") and §3.
 * Domain: "real-estate" (per BrainDomain in refinery/types/pack.mts).
 *
 * Override cascade (priority-ordered, highest first):
 *  - 100 → exogenous-critical-confirmed
 *  - 90  → flood-veto (live as of Session 8 — keyed on env-swfl Lee/Collier V/VE)
 *  - 80  → naics-distress-veto (stubbed — wires up Week 3+)
 *
 * Defensive-by-design: rules whose data sources do not yet exist in the
 * corpus (NAICS baselines) are authored anyway and simply fire `false` until
 * the upstream brains ship. That is not a stub — it is the correct behavior.
 */

import type { BrainOutput } from "../types/brain-output.mts";
import type { ExogenousSignal } from "../types/exogenous-signal.mts";
import type { Constitution, OverrideRule } from "./types.mts";

/**
 * priority 100 — any exogenous signal that is critical, confirmed, and
 * high-confidence forces synthesis to track the signal's own direction.
 * Per locked decision: "force the SIGNAL'S direction, not always bearish".
 */
const exogenousCriticalConfirmed: OverrideRule = {
  priority: 100,
  override_id: "exogenous-critical-confirmed",
  effect: "force_signal_direction",
  condition: (_upstreams: BrainOutput[], signals: ExogenousSignal[]): boolean =>
    signals.some(
      (s) =>
        s.severity === "critical" &&
        s.classification === "confirmed" &&
        s.confidence > 0.85,
    ),
};

/**
 * priority 90 — flood-veto. Fires bearish when any upstream reports Lee or
 * Collier coastal V/VE coverage above 5% of mapped area. The 5% threshold
 * is calibrated to fire against Lee County's measured 5.75% V/VE exposure
 * (272 VE polygons across the Fort Myers Beach barrier-island footprint),
 * which is the §6.4 acceptance scenario the rule has to honor.
 *
 * Both Lee and Collier triggers are checked because the SWFL real-estate
 * brain answers questions across both counties — a Marco Island question
 * deserves the same veto as a FMB question.
 *
 * NOTE on raw slugs vs SKOS concepts: this condition matches the raw
 * `metric` field env-swfl emits on its BrainOutput.key_metrics. Stage 2.5
 * SKOS normalization runs on the master's own corpus fragments, NOT on
 * upstream BrainOutput payloads — so the override cascade sees the
 * literal slug, not the concept. Tightly coupling the constitution to
 * one brain's slug naming is the known trade-off; SKOS-aware constitution
 * lookup (slug_index resolution at check time) is the cleaner long-term
 * shape and lands with the DAG edge-types work (P5).
 */
const FLOOD_VETO_VE_THRESHOLD = 0.05;
const FLOOD_VETO_METRICS = new Set([
  "lee_county_ve_zone_pct_area_weighted",
  "collier_county_ve_zone_pct_area_weighted",
]);
const floodVeto: OverrideRule = {
  priority: 90,
  override_id: "flood-veto",
  effect: "force_bearish",
  condition: (upstreams: BrainOutput[]): boolean =>
    upstreams.some((u) =>
      u.key_metrics.some(
        (m) =>
          FLOOD_VETO_METRICS.has(m.metric) && m.value > FLOOD_VETO_VE_THRESHOLD,
      ),
    ),
};

/**
 * priority 80 — NAICS distress above baseline AND rising forces bearish.
 * Spec language is not yet decidable: sector-credit-swfl does not currently
 * expose a "baseline" metric, only point-in-time distress reads. Stubbed
 * to false until that pack lifts a baseline.
 *
 * TODO(week-3): wire to sector-credit-swfl baseline once that pack exposes
 * a baseline metric (e.g. `naics_distress_baseline` + `naics_distress_pct`).
 */
const naicsDistressVeto: OverrideRule = {
  priority: 80,
  override_id: "naics-distress-veto",
  effect: "force_bearish",
  condition: (): boolean => false,
};

export const realEstateConstitution: Constitution = {
  domains: ["real-estate"],
  relevance_floor: 0.1,
  absoluteConstraints: [],
  overrideCascade: [exogenousCriticalConfirmed, floodVeto, naicsDistressVeto],
  domainHierarchy: [],
  caveatGenerators: [],
};
