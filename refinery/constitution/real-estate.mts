/**
 * Real-Estate Constitution.
 *
 * Spec: docs/v3-synthesis-spec.md §2 step 3 ("Override cascade") and §3.
 * Domain: "real-estate" (per BrainDomain in refinery/types/pack.mts).
 *
 * Override cascade (priority-ordered, highest first):
 *  - 100 → exogenous-critical-confirmed
 *  - 90  → flood-veto
 *  - 80  → naics-distress-veto (stubbed — wires up Week 3+)
 *
 * Defensive-by-design: rules whose data sources do not yet exist in the
 * corpus (flood_risk_pct, NAICS baselines) are authored anyway and simply
 * fire `false` until the upstream brains ship. That is not a stub — it is
 * the correct behavior.
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
 * priority 90 — any upstream reporting a flood_risk_pct key_metric above
 * 15 forces bearish. The environmental brain that produces flood_risk_pct
 * has not shipped yet; this rule fires false against the current corpus
 * and activates the day that metric appears. That is the design.
 */
const floodVeto: OverrideRule = {
  priority: 90,
  override_id: "flood-veto",
  effect: "force_bearish",
  condition: (upstreams: BrainOutput[]): boolean =>
    upstreams.some((u) =>
      u.key_metrics.some((m) => m.metric === "flood_risk_pct" && m.value > 15),
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
