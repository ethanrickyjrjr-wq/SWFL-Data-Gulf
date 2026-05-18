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
import { resolveConceptSlugs } from "../vocab/loader.mts";
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
 * SKOS-aware (P5.5): the rule declares the SKOS concept IDs it cares about,
 * then `resolveConceptSlugs` reads `refinery/vocab/brain-vocabulary.json` at
 * module init and inverts each concept's `raw_slugs` into the literal slug
 * set the synthesizer matches against on `BrainOutputMetric.metric`. Adding
 * a third-county VE concept is a one-line change here; an upstream rename of
 * a slug surfaces at module-init time instead of silently breaking the rule.
 * The 5% threshold itself is a property of the rule, not the concept.
 */
const FLOOD_VETO_VE_THRESHOLD = 0.05;
const FLOOD_VETO_CONCEPTS = [
  "env_lee_ve_zone_coverage_pct",
  "env_collier_ve_zone_coverage_pct",
] as const;
const FLOOD_VETO_METRICS = resolveConceptSlugs(FLOOD_VETO_CONCEPTS);
const floodVeto: OverrideRule = {
  priority: 90,
  override_id: "flood-veto",
  effect: "force_bearish",
  condition: (upstreams: BrainOutput[]): boolean =>
    upstreams.some((u) =>
      u.key_metrics.some(
        (m) =>
          FLOOD_VETO_METRICS.has(m.metric) &&
          typeof m.value === "number" &&
          m.value > FLOOD_VETO_VE_THRESHOLD,
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
