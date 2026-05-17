/**
 * Macro Constitution.
 *
 * Spec: docs/v3-synthesis-spec.md §3 ("Constitution Shape").
 * Domain: "macro" (per BrainDomain in refinery/types/pack.mts).
 *
 * Minimal permissive constitution — exists so loadConstitution(["macro"])
 * does not throw "Unknown domain" when macro-us / macro-florida / macro-swfl
 * synthesize. There are no override rules today: macro brains are pure
 * aggregators of FRED + brain-input upstreams; veto / dominance rules for
 * national vs regional macro tension belong to consuming brains' domains
 * (the finance constitution already owns rising-rates-dominance, for
 * example).
 *
 * Add rules here only when a macro-domain back-stop is genuinely needed
 * across multiple consumers — e.g. "force_bearish when SOFR rises above
 * X bp AND CPI YoY stays above Y%" — and the rule is too cross-vertical to
 * live in any single consumer's constitution.
 */

import type { Constitution } from "./types.mts";

export const macroConstitution: Constitution = {
  domains: ["macro"],
  relevance_floor: 0.1,
  absoluteConstraints: [],
  overrideCascade: [],
  domainHierarchy: [],
  caveatGenerators: [],
};
