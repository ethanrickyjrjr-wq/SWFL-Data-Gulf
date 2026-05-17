/**
 * Finance Constitution.
 *
 * Spec: docs/v3-synthesis-spec.md §2 step 3 and §3.
 * Domain: "finance" (per BrainDomain in refinery/types/pack.mts).
 *
 * Override cascade (priority-ordered, highest first):
 *  - 70 → rising-rates-dominance
 *
 * Defensive: if macro-us is absent or its sofr_rate metric is missing,
 * the condition fires false rather than throwing.
 */

import type { BrainOutput } from "../types/brain-output.mts";
import type { Constitution, OverrideRule } from "./types.mts";

/**
 * priority 70 — when macro-us reports a rising SOFR with magnitude above
 * 0.6, rates dominance forces bearish on finance synthesis regardless of
 * the rest of the upstream vote. Retargeted from macro-swfl to macro-us
 * during the 2026-05-17 macro restructure: SOFR is a national rate, so the
 * rule belongs against the national brain, not the regional one.
 */
const risingRatesDominance: OverrideRule = {
  priority: 70,
  override_id: "rising-rates-dominance",
  effect: "force_bearish",
  condition: (upstreams: BrainOutput[]): boolean =>
    upstreams.some(
      (u) =>
        u.brain_id === "macro-us" &&
        u.magnitude > 0.6 &&
        u.key_metrics.some(
          (m) => m.metric === "sofr_rate" && m.direction === "rising",
        ),
    ),
};

export const financeConstitution: Constitution = {
  domains: ["finance"],
  relevance_floor: 0.1,
  absoluteConstraints: [],
  overrideCascade: [risingRatesDominance],
  domainHierarchy: [],
  caveatGenerators: [],
};
