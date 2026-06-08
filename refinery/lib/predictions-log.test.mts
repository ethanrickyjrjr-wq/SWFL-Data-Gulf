import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  buildPredictionRow,
  deriveGradeFields,
  deriveSlugPredictions,
  filterByCadence,
  logPrediction,
  type PredictionRow,
} from "./predictions-log.mts";
import type { BrainOutput, BrainOutputMetric, ConditionalClaim } from "../types/brain-output.mts";

function makeOutput(overrides: Partial<BrainOutput> = {}): BrainOutput {
  return {
    brain_id: "master",
    version: 7,
    refined_at: "2026-05-17T16:39:09.000Z",
    direction: "bearish",
    magnitude: 0.74,
    drivers: [],
    overrides: [],
    conclusion: "Macro tightening + sector credit distress dominate the read.",
    key_metrics: [
      {
        metric: "sofr_rate",
        value: 5.3,
        direction: "rising",
        label: "SOFR",
        variable_type: "intensive",
        units: "percent",
        source: {
          url: "test://sofr",
          fetched_at: "2026-05-17T16:39:09.000Z",
          tier: 1,
          citation: "test SOFR",
        },
      },
      {
        metric: "fl_lfpr",
        value: 60.1,
        direction: "falling",
        label: "FL LFPR",
        variable_type: "intensive",
        units: "percent",
        source: {
          url: "test://fl_lfpr",
          fetched_at: "2026-05-17T16:39:09.000Z",
          tier: 1,
          citation: "test FL LFPR",
        },
      },
    ],
    caveats: ["Tourism reads bullish — see contradicts."],
    contradicts: ["macro-us (bearish) vs tourism-tdt (bullish)"],
    confidence: 0.71,
    joint_integrity: 0.6,
    confidence_dispersion: 0.15,
    chain_depth: 1,
    trust_tier: 2,
    upstream_count: 5,
    relevance: {
      decay_curve: "weeks",
      half_life_hours: 720,
      computed_at: "2026-05-17T16:39:09.000Z",
    },
    exogenous_signals: [],
    ...overrides,
  };
}

/** Minimal key_metric. Numeric value → intensive+units; string → categorical. */
function metric(slug: string, value: number | string): BrainOutputMetric {
  return {
    metric: slug,
    value,
    direction: "stable",
    label: slug,
    variable_type: typeof value === "number" ? "intensive" : "categorical",
    ...(typeof value === "number" ? { units: "ratio" } : {}),
    source: {
      url: `test://${slug}`,
      fetched_at: "2026-05-17T16:39:09.000Z",
      tier: 1,
      citation: `test ${slug}`,
    },
  };
}

/** Minimal master conditional claim. */
function claim(
  then_direction: ConditionalClaim["then_direction"],
  basis_refs: string[],
): ConditionalClaim {
  return {
    condition: "test condition",
    then_direction,
    basis: "test basis",
    basis_refs,
    falsifier: "test falsifier",
  };
}

test("buildPredictionRow maps BrainOutput → row with metadata bag", () => {
  const row = buildPredictionRow(makeOutput());
  assert.equal(row.brain_id, "master");
  assert.equal(row.confidence, 0.71);
  assert.equal(row.refined_at, "2026-05-17T16:39:09.000Z");
  assert.equal(row.prediction_window, null);
  assert.equal(row.metadata.direction, "bearish");
  assert.equal(row.metadata.trust_tier, 2);
  assert.equal(row.metadata.upstream_count, 5);
  assert.equal(row.metadata.relevance_half_life_hours, 720);
  assert.deepEqual(row.metadata.contradicts, ["macro-us (bearish) vs tourism-tdt (bullish)"]);
  assert.equal(row.metadata.top_key_metrics.length, 2);
  assert.equal(row.metadata.version, 7);
});

test("buildPredictionRow caps top_key_metrics at 5 to keep JSONB lean", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    metric: `m${i}`,
    value: i,
    direction: "stable" as const,
    label: `Metric ${i}`,
    variable_type: "extensive" as const,
    units: "count",
    source: {
      url: `test://m${i}`,
      fetched_at: "2026-05-17T16:39:09.000Z",
      tier: 1 as const,
      citation: `test m${i}`,
    },
  }));
  const row = buildPredictionRow(makeOutput({ key_metrics: many }));
  assert.equal(row.metadata.top_key_metrics.length, 5);
  assert.equal(row.metadata.top_key_metrics[0].metric, "m0");
  assert.equal(row.metadata.top_key_metrics[4].metric, "m4");
});

test("logPrediction skips non-master packs (no-op)", async () => {
  const result = await logPrediction({
    packId: "cre-swfl",
    brainOutput: makeOutput({ brain_id: "cre-swfl" }),
    // env injected so we'd otherwise try to insert; we should still skip
    supabaseUrl: "https://example.supabase.co",
    supabaseKey: "fake-key",
  });
  assert.deepEqual(result, { kind: "skipped", reason: "not-master" });
});

test("logPrediction skips when supabase env is missing", async () => {
  // Save and clear env so process.env fallback finds nothing. Both the
  // canonical bare names and the legacy BRAINS_-prefixed names are cleared
  // because logPrediction reads both (canonical first, legacy as fallback).
  const prev = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_KEY,
    legacyUrl: process.env.BRAINS_SUPABASE_URL,
    legacyKey: process.env.BRAINS_SUPABASE_SERVICE_KEY,
  };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_KEY;
  delete process.env.BRAINS_SUPABASE_URL;
  delete process.env.BRAINS_SUPABASE_SERVICE_KEY;
  try {
    const result = await logPrediction({
      packId: "master",
      brainOutput: makeOutput(),
    });
    assert.deepEqual(result, { kind: "skipped", reason: "no-supabase-env" });
  } finally {
    if (prev.url) process.env.SUPABASE_URL = prev.url;
    if (prev.key) process.env.SUPABASE_SERVICE_KEY = prev.key;
    if (prev.legacyUrl) process.env.BRAINS_SUPABASE_URL = prev.legacyUrl;
    if (prev.legacyKey) process.env.BRAINS_SUPABASE_SERVICE_KEY = prev.legacyKey;
  }
});

test("PredictionRow shape stays explicit (compile-time + runtime check)", () => {
  // Pure structural test — if the type drifts and adds a required field,
  // this assignment fails to compile, alerting before runtime.
  const row: PredictionRow = buildPredictionRow(makeOutput());
  const expectedKeys: (keyof PredictionRow)[] = [
    "brain_id",
    "refined_at",
    "conclusion",
    "confidence",
    "prediction_window",
    "metadata",
    // Goal 9 Phase 1d — derived grade fields, persisted to the new columns.
    "conditional_claims",
    "gradeable_slug",
    "baseline_value",
    "predicted_direction",
    "window_end_date",
    "grade_status",
    "grade_method",
  ];
  for (const k of expectedKeys) {
    assert.ok(k in row, `row missing key ${k}`);
  }
});

// --- Goal 9 Phase 1d: deriveGradeFields ------------------------------------

test("deriveGradeFields: gradeable master call → machine-gradeable, pinned baseline", () => {
  const out = makeOutput({
    refined_at: "2026-05-17T12:00:00.000Z",
    conditional_claims: [claim("bullish", ["franchise-outcomes", "sba_overall_survival_rate"])],
    key_metrics: [metric("sba_overall_survival_rate", 0.82)],
  });
  const g = deriveGradeFields(out);
  assert.equal(g.gradeable_slug, "sba_overall_survival_rate");
  assert.equal(g.baseline_value, 0.82);
  assert.equal(g.predicted_direction, "bullish");
  assert.equal(g.grade_status, "gradeable");
  assert.equal(g.grade_method, "machine");
  assert.equal(g.window_end_date, "2026-11-13"); // refined_at + 180d (credit-risk)
  assert.deepEqual(g.conditional_claims, out.conditional_claims);
});

test("deriveGradeFields: neutral then_direction → ungradeable/operator, null window", () => {
  const out = makeOutput({
    conditional_claims: [claim("neutral", ["sba_overall_survival_rate"])],
    key_metrics: [metric("sba_overall_survival_rate", 0.82)],
  });
  const g = deriveGradeFields(out);
  assert.equal(g.predicted_direction, null);
  assert.equal(g.gradeable_slug, "sba_overall_survival_rate"); // anchor still recorded
  assert.equal(g.window_end_date, null);
  assert.equal(g.grade_status, "ungradeable");
  assert.equal(g.grade_method, "operator");
});

test("deriveGradeFields: no conditional_claims → ungradeable, empty claims, null slug", () => {
  const g = deriveGradeFields(makeOutput({ conditional_claims: undefined }));
  assert.deepEqual(g.conditional_claims, []);
  assert.equal(g.gradeable_slug, null);
  assert.equal(g.baseline_value, null);
  assert.equal(g.predicted_direction, null);
  assert.equal(g.window_end_date, null);
  assert.equal(g.grade_status, "ungradeable");
  assert.equal(g.grade_method, "operator");
});

test("deriveGradeFields: basis_ref is a brain_id only (absent from key_metrics) → null slug", () => {
  const out = makeOutput({
    conditional_claims: [claim("bullish", ["macro-us"])],
    key_metrics: [metric("sba_overall_survival_rate", 0.82)],
  });
  const g = deriveGradeFields(out);
  assert.equal(g.gradeable_slug, null);
  assert.equal(g.grade_status, "ungradeable");
});

test("deriveGradeFields: real producer shape [brain_id, metric] → metric wins, brain_id skipped", () => {
  // basisRefsFor (synth.mts:433-435) emits [brain_id, key_metrics[0].metric],
  // brain_id first. This proves the brain_id-skip on master's actual output shape.
  const out = makeOutput({
    conditional_claims: [claim("bullish", ["macro-us", "sba_overall_survival_rate"])],
    key_metrics: [metric("sba_overall_survival_rate", 0.82)],
  });
  const g = deriveGradeFields(out);
  assert.equal(g.gradeable_slug, "sba_overall_survival_rate");
  assert.equal(g.grade_status, "gradeable");
});

test("deriveGradeFields: FORWARD-GUARD — first numeric driver decides, no jump to gradeable secondary", () => {
  // The current producer emits AT MOST ONE numeric metric ref, so this two-numeric
  // case cannot occur live today — it guards a future multi-claim/corridor producer.
  // sofr_rate is registered-but-ungradeable (no polarity); sba_overall_survival_rate is gradeable.
  const out = makeOutput({
    conditional_claims: [claim("bullish", ["sofr_rate", "sba_overall_survival_rate"])],
    key_metrics: [metric("sofr_rate", 5.3), metric("sba_overall_survival_rate", 0.82)],
  });
  const g = deriveGradeFields(out);
  assert.equal(g.gradeable_slug, "sofr_rate"); // first numeric ref, NOT the gradeable second
  assert.equal(g.baseline_value, 5.3);
  assert.equal(g.grade_status, "ungradeable"); // no polarity on sofr_rate → no jump
});

test("deriveGradeFields: window_end_date uses UTC date math (no local/DST off-by-one)", () => {
  // 23:30Z + 180d (credit-risk). A local setDate() helper yields 2026-11-14 in a
  // non-UTC tz (e.g. America/New_York); correct UTC math yields 2026-11-13.
  const out = makeOutput({
    refined_at: "2026-05-17T23:30:00Z",
    conditional_claims: [claim("bullish", ["sba_overall_survival_rate"])],
    key_metrics: [metric("sba_overall_survival_rate", 0.82)],
  });
  assert.equal(deriveGradeFields(out).window_end_date, "2026-11-13");
});

test("buildPredictionRow embeds derived grade fields (wiring check)", () => {
  const row = buildPredictionRow(
    makeOutput({
      conditional_claims: [claim("bullish", ["sba_overall_survival_rate"])],
      key_metrics: [metric("sba_overall_survival_rate", 0.82)],
    }),
  );
  assert.equal(row.gradeable_slug, "sba_overall_survival_rate");
  assert.equal(row.grade_status, "gradeable");
});

// --- §6-A: deriveSlugPredictions + filterByCadence (per-slug leaf logging) ---

test("deriveSlugPredictions: sign-basis gradeable slug → one slug sub-call (kind='slug')", () => {
  const out = makeOutput({
    brain_id: "properties-lee-value",
    refined_at: "2026-05-17T00:00:00.000Z",
    direction: "bullish",
    key_metrics: [metric("properties_lee_sales_velocity_zscore", 1.4)],
  });
  const rows = deriveSlugPredictions(out);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].prediction_kind, "slug");
  assert.equal(rows[0].gradeable_slug, "properties_lee_sales_velocity_zscore");
  assert.equal(rows[0].predicted_direction, "bullish"); // +z, higher_is_bullish
  assert.equal(rows[0].baseline_value, 1.4);
  assert.equal(rows[0].grade_status, "gradeable");
  assert.equal(rows[0].window_end_date, "2026-11-13"); // refined + 180d (real-estate) UTC
  assert.equal(rows[0].conditional_claims[0].basis_refs[0], "properties_lee_sales_velocity_zscore");
});

test("deriveSlugPredictions: neutral value inside the deadband → no bet, skipped", () => {
  const out = makeOutput({
    brain_id: "properties-lee-value",
    key_metrics: [metric("properties_lee_sales_velocity_zscore", 0.05)], // < ε 0.1
  });
  assert.deepEqual(deriveSlugPredictions(out), []);
});

test("deriveSlugPredictions: delta-basis gradeable slug skipped (not self-directional)", () => {
  const out = makeOutput({
    brain_id: "macro-swfl",
    key_metrics: [metric("laus_lee_unemployment_rate_initial_vintage", 4.2)], // ratio → delta basis
  });
  assert.deepEqual(deriveSlugPredictions(out), []);
});

test("deriveSlugPredictions: unregistered / non-gradeable slug skipped", () => {
  const out = makeOutput({ key_metrics: [metric("totally_unregistered_slug_zzz", 3)] });
  assert.deepEqual(deriveSlugPredictions(out), []);
});

test("filterByCadence: drops a slug that already has an open prediction; keeps fresh ones", () => {
  const out = makeOutput({
    brain_id: "properties-lee-value",
    direction: "bullish",
    key_metrics: [metric("properties_lee_sales_velocity_zscore", 1.4)],
  });
  const derived = deriveSlugPredictions(out);
  assert.equal(
    filterByCadence(derived, new Set(["properties_lee_sales_velocity_zscore"])).length,
    0,
  );
  assert.equal(filterByCadence(derived, new Set<string>()).length, 1);
});
