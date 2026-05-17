/**
 * Logistics Constitution.
 *
 * Spec: docs/v3-synthesis-spec.md §3 ("Constitution Shape").
 * Domain: "logistics" (per BrainDomain in refinery/types/pack.mts).
 *
 * Minimal permissive constitution — exists so loadConstitution(["logistics"])
 * does not throw "Unknown domain" when logistics-swfl synthesizes (and when
 * future logistics brains like fdot-traffic land). There are no override
 * rules today: logistics-swfl is a pure aggregator of FAF5 freight flows
 * with no domain-specific veto patterns yet. Future candidates: "force
 * bearish on inbound construction-materials tons declining > 20% YoY"
 * once we have a time-series read.
 *
 * Add rules here only when a logistics-domain back-stop is genuinely needed
 * across multiple consumers AND the rule is too cross-vertical to live in
 * any single consumer's constitution.
 */

import type { Constitution } from "./types.mts";

export const logisticsConstitution: Constitution = {
  domains: ["logistics"],
  relevance_floor: 0.1,
  absoluteConstraints: [],
  overrideCascade: [],
  domainHierarchy: [],
  caveatGenerators: [],
};
