import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  initialVintages,
  pitInitial,
  addDaysUTC,
  monthlyGrid,
  gradeFromDirections,
  signalConfidence,
  buildGradedCall,
  type Vintage,
} from "./grid.mts";
import type { ResolvedGradeConfig } from "../../vocab/loader.mts";

// ── fixtures ──────────────────────────────────────────────────────────────────
/** LAUS initial-vintage config as resolveGradeConfig returns it (ratio + macro). */
function lausCfg(): ResolvedGradeConfig {
  return {
    slug: "laus_lee_unemployment_rate_initial_vintage",
    concept_id: "laus_lee_unemployment_rate_initial_vintage",
    gradeable: true,
    window_days: 90,
    epsilon: 0.05,
    epsilon_mode: "absolute",
    grade_basis: "delta",
    direction_polarity: "lower_is_bullish",
    source: { window: "category", epsilon: "value_type", polarity: "slug" },
  };
}

function signCfg(): ResolvedGradeConfig {
  return {
    slug: "some_zscore",
    concept_id: "some_zscore",
    gradeable: true,
    window_days: 180,
    epsilon: 0.1,
    epsilon_mode: "absolute",
    grade_basis: "sign",
    direction_polarity: "higher_is_bullish",
    source: { window: "category", epsilon: "value_type", polarity: "slug" },
  };
}

// A monthly series with realtimes ~37d after each obs, PLUS a late revision on the
// 2020-01 obs that must NEVER be used (initial-vintage discipline).
function lausSeries(): Vintage[] {
  return [
    { observation_date: "2019-10-01", value: 4.0, realtime_start: "2019-11-07" },
    { observation_date: "2020-01-01", value: 4.2, realtime_start: "2020-02-07" },
    { observation_date: "2020-01-01", value: 3.9, realtime_start: "2020-06-01" }, // late revision — trap
    { observation_date: "2020-04-01", value: 5.0, realtime_start: "2020-05-07" },
    { observation_date: "2020-07-01", value: 6.0, realtime_start: "2020-08-07" },
    { observation_date: "2020-10-01", value: 6.5, realtime_start: "2020-11-07" },
  ];
}

// ── initialVintages ─────────────────────────────────────────────────────────────
test("initialVintages: one row per obs = the minimum realtime_start (the revision is dropped)", () => {
  const ini = initialVintages(lausSeries());
  const jan = ini.filter((v) => v.observation_date === "2020-01-01");
  assert.equal(jan.length, 1);
  assert.equal(jan[0].value, 4.2); // the as-first-reported value, not the 3.9 revision
  assert.equal(jan[0].realtime_start, "2020-02-07");
  assert.equal(ini.length, 5); // 5 distinct observation_dates
});

// ── pitInitial (the look-ahead guard) ───────────────────────────────────────────
test("pitInitial: returns the freshest obs PUBLISHED on/before asOf, never a future print", () => {
  const ini = initialVintages(lausSeries());
  // At 2020-05-15 the 2020-04 print (rt 2020-05-07) is out; 2020-07 (rt 2020-08-07) is NOT.
  const p = pitInitial(ini, "2020-05-15");
  assert.deepEqual(p, { observation_date: "2020-04-01", value: 5.0 });
});

test("pitInitial: a revision published AFTER asOf is excluded; initial vintage stands", () => {
  const ini = initialVintages(lausSeries());
  // At 2020-03-01 only 2019-10 and 2020-01 are published; 2020-01 value is the 4.2 initial.
  const p = pitInitial(ini, "2020-03-01");
  assert.deepEqual(p, { observation_date: "2020-01-01", value: 4.2 });
});

test("pitInitial: null before the archive begins", () => {
  const ini = initialVintages(lausSeries());
  assert.equal(pitInitial(ini, "2019-01-01"), null);
});

// ── addDaysUTC ──────────────────────────────────────────────────────────────────
test("addDaysUTC: forward across a month boundary, and negative", () => {
  assert.equal(addDaysUTC("2020-05-15", 90), "2020-08-13");
  assert.equal(addDaysUTC("2020-05-15", -90), "2020-02-15");
  assert.equal(addDaysUTC("2020-12-31", 1), "2021-01-01");
});

// ── monthlyGrid ─────────────────────────────────────────────────────────────────
test("monthlyGrid: inclusive range with year rollover and zero-padding", () => {
  const g = monthlyGrid("2019-11", "2020-02", 15);
  assert.deepEqual(g, ["2019-11-15", "2019-12-15", "2020-01-15", "2020-02-15"]);
});

test("monthlyGrid: quarterly step (monthStep=3) for non-overlapping 90d windows", () => {
  const g = monthlyGrid("2020-01", "2020-12", 15, 3);
  assert.deepEqual(g, ["2020-01-15", "2020-04-15", "2020-07-15", "2020-10-15"]);
});

// ── gradeFromDirections ─────────────────────────────────────────────────────────
test("gradeFromDirections: hit / miss / neutral", () => {
  assert.equal(gradeFromDirections("bullish", "bullish"), "hit");
  assert.equal(gradeFromDirections("bullish", "bearish"), "miss");
  assert.equal(gradeFromDirections("bearish", "neutral"), "neutral");
});

// ── signalConfidence ────────────────────────────────────────────────────────────
test("signalConfidence: bounded to [0.5, 0.95] and monotone in signal strength", () => {
  const cfg = lausCfg();
  const weak = signalConfidence(4.06, 4.0, cfg); // just over the 0.05 deadband
  const strong = signalConfidence(6.0, 4.0, cfg); // far over
  assert.ok(weak >= 0.5 && weak < strong);
  assert.ok(strong <= 0.95);
});

test("signalConfidence: at/below the deadband returns the 0.5 floor", () => {
  const cfg = lausCfg();
  assert.equal(signalConfidence(4.05, 4.0, cfg), 0.5); // exactly the deadband → s=0
});

test("signalConfidence: sign basis keys off |value|, not a prior", () => {
  const cfg = signCfg();
  const c = signalConfidence(1.5, null, cfg);
  assert.ok(c > 0.5 && c <= 0.95);
});

// ── buildGradedCall (end-to-end pure path) ───────────────────────────────────────
test("buildGradedCall: rising unemployment → BEARISH call, graded against PIT outcome = HIT", () => {
  const ini = initialVintages(lausSeries());
  const row = buildGradedCall(
    "laus_lee_unemployment_rate_initial_vintage",
    "2020-05-15",
    ini,
    lausCfg(),
    { family: "laus_lee", source_tag: "lake_tier1", lookbackDays: 90 },
  );
  assert.ok(row);
  // as-of value MUST be the 5.0 print (2020-04, published 2020-05-07) — NOT a future print.
  assert.equal(row!.baseline_value, 5.0);
  // prior MUST be the 4.2 INITIAL vintage (2020-01), never the 3.9 revision.
  assert.equal(row!.prior_value, 4.2);
  assert.equal(row!.predicted_direction, "bearish"); // 5.0 > 4.2, lower_is_bullish ⇒ bearish
  assert.equal(row!.window_end_date, "2020-08-13");
  assert.equal(row!.observed_value, 6.0); // 2020-07 print, published by window close
  assert.equal(row!.observed_direction, "bearish"); // 6.0 > 5.0 ⇒ bearish
  assert.equal(row!.grade, "hit");
  assert.equal(row!.magnitude_error, 1.0);
  assert.ok(row!.confidence > 0.9); // |5.0-4.2|=0.8 ≫ deadband ⇒ high confidence
});

test("buildGradedCall: a flat move inside the deadband → neutral call → null (no manufactured bet)", () => {
  const flat: Vintage[] = [
    { observation_date: "2020-01-01", value: 4.0, realtime_start: "2020-02-07" },
    { observation_date: "2020-04-01", value: 4.02, realtime_start: "2020-05-07" },
    { observation_date: "2020-07-01", value: 4.03, realtime_start: "2020-08-07" },
  ];
  const row = buildGradedCall(
    "laus_lee_unemployment_rate_initial_vintage",
    "2020-05-15",
    initialVintages(flat),
    lausCfg(),
    { family: "laus_lee", source_tag: "lake_tier1", lookbackDays: 90 },
  );
  assert.equal(row, null);
});

test("buildGradedCall: null when no prior is published yet at asOf", () => {
  const ini = initialVintages(lausSeries());
  // asOf early enough that asOf-90d predates the archive → no prior.
  const row = buildGradedCall(
    "laus_lee_unemployment_rate_initial_vintage",
    "2019-12-01",
    ini,
    lausCfg(),
    { family: "laus_lee", source_tag: "lake_tier1", lookbackDays: 90 },
  );
  assert.equal(row, null);
});

test("buildGradedCall: null when cfg is not gradeable", () => {
  const ini = initialVintages(lausSeries());
  const ungradeable: ResolvedGradeConfig = {
    ...lausCfg(),
    gradeable: false,
    direction_polarity: "none",
  };
  const row = buildGradedCall("x", "2020-05-15", ini, ungradeable, {
    family: "f",
    source_tag: "lake_tier1",
    lookbackDays: 90,
  });
  assert.equal(row, null);
});
