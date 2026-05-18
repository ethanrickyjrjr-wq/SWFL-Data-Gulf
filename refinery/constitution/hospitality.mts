/**
 * Hospitality Constitution.
 *
 * Spec: docs/v3-synthesis-spec.md §2 step 3 ("Override cascade") and §3.
 * Domain: "hospitality" (per BrainDomain in refinery/types/pack.mts).
 *
 * Override cascade (priority-ordered, highest first):
 *  - 65 → hospitality-recovery-collapse
 *  - 60 → hospitality-yoy-collapse
 *
 * Priority placement: below finance (70 = rising-rates-dominance) so a rates
 * shock still wins when both fire — rates dominance is the cross-vertical
 * macro veto and pre-dates any single-vertical signal. Above the un-keyed
 * default treatment that tourism-tdt currently receives.
 *
 * SKOS-aware (mirrors real-estate.mts flood-veto pattern): rules declare the
 * SKOS concept IDs they care about; `resolveConceptSlugs` reads the vocab at
 * module init and inverts each concept's `raw_slugs` into the literal slug
 * set the synthesizer matches against on `BrainOutputMetric.metric`. A typo
 * in a concept ID fails loud at startup instead of silently never firing.
 *
 * Scope: these rules back-stop master's cross-vertical synthesis. They do
 * NOT duplicate tourism-tdt's own thresholds (which already vote bearish at
 * -5% YoY or recovery_ratio < 0.7). The constitution-level thresholds are
 * intentionally HARDER — they exist so a bullish read from CRE or finance
 * cannot paper over a severe hospitality collapse during master synthesis.
 */

import type { BrainOutput } from "../types/brain-output.mts";
import { resolveConceptSlugs } from "../vocab/loader.mts";
import type { Constitution, OverrideRule } from "./types.mts";

/**
 * priority 65 — hospitality recovery collapse. Fires bearish when any
 * upstream reports a post-Hurricane-Ian recovery ratio below 0.6 (60% of the
 * strongest pre-Ian 12-month run).
 *
 * Threshold rationale: tourism-tdt itself goes bearish at recovery_ratio < 0.7
 * (see `voteTdtDirection` in refinery/packs/tourism-tdt.mts). The 0.6 floor
 * here is the harder back-stop — it fires only on severe under-recovery,
 * where cross-vertical synthesis must respect the physical reality of the
 * hospitality vertical no matter what the financial or real-estate brains
 * are saying.
 *
 * Concept value is a ratio in [0, ~5] (1.0 = full recovery; see vocab
 * `hosp_tdt_post_ian_recovery_ratio.scope_note`).
 */
const HOSPITALITY_RECOVERY_FLOOR = 0.6;
const RECOVERY_COLLAPSE_CONCEPTS = [
  "hosp_tdt_post_ian_recovery_ratio",
] as const;
const RECOVERY_COLLAPSE_METRICS = resolveConceptSlugs(
  RECOVERY_COLLAPSE_CONCEPTS,
);
const hospitalityRecoveryCollapse: OverrideRule = {
  priority: 65,
  override_id: "hospitality-recovery-collapse",
  effect: "force_bearish",
  condition: (upstreams: BrainOutput[]): boolean =>
    upstreams.some((u) =>
      u.key_metrics.some(
        (m) =>
          RECOVERY_COLLAPSE_METRICS.has(m.metric) &&
          typeof m.value === "number" &&
          m.value < HOSPITALITY_RECOVERY_FLOOR,
      ),
    ),
};

/**
 * priority 60 — hospitality YoY collapse. Fires bearish when any upstream
 * reports a Tourist Development Tax year-over-year delta below -15 percent.
 *
 * Threshold rationale: tourism-tdt itself goes bearish at yoy < -5% (a
 * meaningful soft-signal threshold). The -15% floor here is the harder
 * back-stop for severe collapse — at -15% YoY, operators are losing more
 * than one in seven dollars of demand against the prior fiscal year, and
 * the cross-vertical read must reflect that even if other brains are
 * bullish on rates, credit, or property fundamentals.
 *
 * Concept value is a percentage in [-100, 200] (NOT a ratio — e.g. -15.2
 * means a 15.2% decline; see vocab `hosp_tdt_yoy_delta.value_range`).
 */
const HOSPITALITY_YOY_COLLAPSE_PCT = -15;
const YOY_COLLAPSE_CONCEPTS = ["hosp_tdt_yoy_delta"] as const;
const YOY_COLLAPSE_METRICS = resolveConceptSlugs(YOY_COLLAPSE_CONCEPTS);
const hospitalityYoyCollapse: OverrideRule = {
  priority: 60,
  override_id: "hospitality-yoy-collapse",
  effect: "force_bearish",
  condition: (upstreams: BrainOutput[]): boolean =>
    upstreams.some((u) =>
      u.key_metrics.some(
        (m) =>
          YOY_COLLAPSE_METRICS.has(m.metric) &&
          typeof m.value === "number" &&
          m.value < HOSPITALITY_YOY_COLLAPSE_PCT,
      ),
    ),
};

export const hospitalityConstitution: Constitution = {
  domains: ["hospitality"],
  relevance_floor: 0.1,
  absoluteConstraints: [],
  overrideCascade: [hospitalityRecoveryCollapse, hospitalityYoyCollapse],
  domainHierarchy: [],
  caveatGenerators: [],
};
