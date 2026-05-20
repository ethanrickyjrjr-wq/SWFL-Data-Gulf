import { test } from "bun:test";
import assert from "node:assert/strict";
import type { BrainOutput, BrainOutputMetric } from "../types/brain-output.mts";
import type { OverrideRule } from "./types.mts";
import { realEstateConstitution } from "./real-estate.mts";

const NOW = "2026-05-20T12:00:00Z";

function brainWithMetrics(metrics: BrainOutputMetric[]): BrainOutput {
  return {
    brain_id: "env-swfl",
    version: 1,
    refined_at: NOW,
    direction: "bearish",
    magnitude: 0.7,
    drivers: [],
    overrides: [],
    conclusion: "test fixture",
    key_metrics: metrics,
    caveats: [],
    contradicts: [],
    confidence: 0.8,
    joint_integrity: 1,
    confidence_dispersion: 0,
    chain_depth: 0,
    trust_tier: 1,
    upstream_count: 0,
    relevance: { decay_curve: "weeks", half_life_hours: 720, computed_at: NOW },
    exogenous_signals: [],
  };
}

// Predicate is value-based; the units/variable_type fields are unread by
// the override rule, so the helper hardcodes sensible defaults and tests
// pass with AAL ($) and barrier_score (dimensionless) in the same fixture.
function metric(slug: string, value: number): BrainOutputMetric {
  return {
    metric: slug,
    value,
    direction: "rising",
    label: slug,
    variable_type: "intensive",
    units: "percent",
    source: {
      url: `test://${slug}`,
      fetched_at: NOW,
      tier: 1,
      citation: `test ${slug}`,
    },
  };
}

function aal(zip: string, usd: number): BrainOutputMetric {
  return metric(`swfl_zip_${zip}_flood_aal_usd_per_insured_property`, usd);
}

function barrier(zip: string, score: number): BrainOutputMetric {
  return metric(`swfl_zip_${zip}_barrier_island_score`, score);
}

function rule(id: string): OverrideRule {
  const r = realEstateConstitution.overrideCascade.find(
    (x) => x.override_id === id,
  );
  if (!r) throw new Error(`override rule "${id}" not in real-estate cascade`);
  return r;
}

test("real-estate cascade: priorities are correctly ordered (100 > 90 > 80)", () => {
  const ids = realEstateConstitution.overrideCascade.map((r) => r.override_id);
  assert.deepEqual(ids, [
    "exogenous-critical-confirmed",
    "flood-barrier-mode-1",
    "naics-distress-veto",
  ]);
});

test("flood-barrier-mode-1: effect is add_caveat (not force_bearish)", () => {
  // Group C architectural choice: env-swfl's +50-70 bps cap-rate adjustment
  // is the proportional bearish signal; the override surfaces the per-ZIP
  // barrier-mode-1 fact as a caveat without collapsing master's synthesis
  // into a binary kill-switch.
  assert.equal(rule("flood-barrier-mode-1").effect, "add_caveat");
});

test("flood-barrier-mode-1: §6.4 FMB acceptance — ZIP 33931 barrier=1.0, AAL=$1200 → fires", () => {
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([barrier("33931", 1.0), aal("33931", 1200)]);
  assert.equal(r.condition([u], []), true);
});

test("flood-barrier-mode-1: threshold boundary low — barrier=1.0, AAL=$799 → does NOT fire", () => {
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([barrier("33931", 1.0), aal("33931", 799)]);
  assert.equal(r.condition([u], []), false);
});

test("flood-barrier-mode-1: threshold boundary on — barrier=1.0, AAL=$800 → fires (>=)", () => {
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([barrier("33931", 1.0), aal("33931", 800)]);
  assert.equal(r.condition([u], []), true);
});

test("flood-barrier-mode-1: non-barrier high-AAL — barrier=0.5, AAL=$1500 → does NOT fire (drift watch)", () => {
  // LB drift watch: regex-matching on swfl_zip_*_flood_aal_* alone would
  // misfire on Mode 2 coastal-mainland ZIPs with high AAL but barrier<1.0.
  // The predicate must value-gate barrier === 1.0 in conjunction with AAL.
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([barrier("33914", 0.5), aal("33914", 1500)]);
  assert.equal(r.condition([u], []), false);
});

test("flood-barrier-mode-1: cross-ZIP split — 33931 barrier=1.0 AAL=$200, 33914 barrier=0.5 AAL=$850 → does NOT fire", () => {
  // Separate-quantifier drift watch: no single ZIP satisfies BOTH
  // barrier === 1.0 AND aal >= 800. The 33931 entry has barrier but
  // trivial AAL; the 33914 entry has catastrophic AAL but coastal-mainland
  // barrier. Pair-join by ZIP must keep them separate.
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([
    barrier("33931", 1.0),
    aal("33931", 200),
    barrier("33914", 0.5),
    aal("33914", 850),
  ]);
  assert.equal(r.condition([u], []), false);
});

test("flood-barrier-mode-1: Mode 3 inland — barrier=0.0, AAL=$50 → does NOT fire", () => {
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([barrier("33990", 0.0), aal("33990", 50)]);
  assert.equal(r.condition([u], []), false);
});

test("flood-barrier-mode-1: no barrier metric emitted — AAL alone → does NOT fire (cleanly silent)", () => {
  // If env-swfl's barrier source goes dark for a ZIP, the rule stays
  // silent at the metric level; relevance_floor handles brain-level
  // degradation. Constitution does not paper over upstream sickness.
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([aal("33931", 1500)]);
  assert.equal(r.condition([u], []), false);
});

test("flood-barrier-mode-1: no AAL metric emitted — barrier alone → does NOT fire (cleanly silent)", () => {
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([barrier("33931", 1.0)]);
  assert.equal(r.condition([u], []), false);
});

test("flood-barrier-mode-1: multiple Mode 1 ZIPs above threshold → fires exactly once (boolean predicate)", () => {
  // The predicate is boolean — the override appears once in OUTPUT.overrides
  // regardless of how many ZIPs satisfy Mode 1 within an upstream. Per-ZIP
  // detail is preserved in env-swfl's own key_metrics/caveats, lifted into
  // master via the upstream caveat filter.
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([
    barrier("33931", 1.0),
    aal("33931", 1200),
    barrier("33957", 1.0), // Sanibel
    aal("33957", 950),
  ]);
  assert.equal(r.condition([u], []), true);
});

test("flood-barrier-mode-1: unrelated metric never triggers the rule", () => {
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([metric("cap_rate_median", 0.06)]);
  assert.equal(r.condition([u], []), false);
});

test("flood-barrier-mode-1: legacy metro V/VE concept does NOT trigger (per-ZIP is policy, metro is data)", () => {
  // Group B's architectural decision: lee_county_ve_zone_pct_area_weighted
  // remains a data signal emitted by env-swfl for ledger/role-renderer
  // continuity, but it stops being a policy trigger. Lock that with a
  // regression test against accidental re-introduction of metro-as-policy.
  const r = rule("flood-barrier-mode-1");
  const u = brainWithMetrics([
    metric("lee_county_ve_zone_pct_area_weighted", 0.0575),
    metric("collier_county_ve_zone_pct_area_weighted", 0.12),
  ]);
  assert.equal(r.condition([u], []), false);
});

test("flood-barrier-mode-1: any upstream tripping the predicate is sufficient (multi-upstream)", () => {
  const r = rule("flood-barrier-mode-1");
  const clean = brainWithMetrics([metric("cap_rate_median", 0.06)]);
  const dirty = brainWithMetrics([barrier("33931", 1.0), aal("33931", 1500)]);
  assert.equal(r.condition([clean, dirty], []), true);
});

test("naics-distress-veto: stub still returns false until baseline lands", () => {
  const r = rule("naics-distress-veto");
  assert.equal(r.condition([], []), false);
});
