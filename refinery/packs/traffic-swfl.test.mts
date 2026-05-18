import { test } from "node:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { directionFromYoY, trafficSwfl } = await import("./traffic-swfl.mts");

// Rule table for traffic-swfl direction derivation.
// Bullish threshold: YoY ≥ +3 %. Bearish threshold: YoY ≤ −3 %. Neutral otherwise.
// Boundary tests pin behavior at the exact +3 and −3 cut-points so future-you
// can't accidentally widen or narrow the band by an off-by-one.
const RULES: Array<[number | null, "bullish" | "bearish" | "neutral", string]> =
  [
    [10, "bullish", "clearly bullish"],
    [3, "bullish", "boundary: exactly +3% → bullish (≥)"],
    [2.9, "neutral", "just inside band → neutral"],
    [0, "neutral", "zero → neutral"],
    [-2.9, "neutral", "just inside band → neutral (negative)"],
    [-3, "bearish", "boundary: exactly −3% → bearish (≤)"],
    [-10, "bearish", "clearly bearish"],
    [null, "neutral", "null YoY (no cohort) → neutral"],
  ];

for (const [yoy, expected, label] of RULES) {
  test(`directionFromYoY: ${label} (yoy=${yoy})`, () => {
    assert.equal(directionFromYoY(yoy), expected);
  });
}

test("trafficSwfl pack: id and domain are stable", () => {
  assert.equal(trafficSwfl.id, "traffic-swfl");
  assert.equal(trafficSwfl.brain_id, "traffic-swfl");
  assert.equal(trafficSwfl.domain, "logistics");
});

test("trafficSwfl pack: no upstream input_brains (leaf node)", () => {
  assert.deepEqual(trafficSwfl.input_brains, []);
});

test("trafficSwfl pack: deterministic (skipTriageAgent + skipSynthesisAgent)", () => {
  assert.equal(trafficSwfl.skipTriageAgent, true);
  assert.equal(trafficSwfl.skipSynthesisAgent, true);
});

test("trafficSwfl pack: source connector wired", () => {
  assert.equal(trafficSwfl.sources.length, 1);
  assert.equal(trafficSwfl.sources[0].source_id, "fdot_aadt_swfl");
  assert.equal(trafficSwfl.sources[0].trust_tier, 2);
});

// Cohort=0 path: the source connector emits county-year aggregates but NO
// cohort-yoy fragment (would happen live if FDOT changed every segment identity
// between the latest two years — vanishingly rare, but the code path exists).
// Expected behavior: direction="neutral", magnitude=0.3 (weak-but-nonzero default),
// no YoY sentence in the conclusion, no yoy_pct in key_metrics, but level metrics
// (aadt_swfl_avg, cagr, truck_share, post_ian) still surface.
test("trafficSwfl pack: cohortSize=0 path → neutral + 0.3 magnitude + no YoY sentence", async () => {
  const { fdotSource } = await import("../sources/fdot-source.mts");
  const allFragments = await fdotSource.fetch();
  // Drop the cohort-yoy fragment to simulate the "no overlapping segments" path.
  const noCohort = allFragments.filter(
    (f) => (f.normalized as { kind: string }).kind !== "fdot-cohort-yoy",
  );
  assert.equal(
    allFragments.length - noCohort.length,
    1,
    "expected exactly one cohort-yoy fragment in fixture mode",
  );

  trafficSwfl.corpusSummary!(noCohort);
  // outputProducer reads from module-level closure state set by corpusSummary; the
  // PackOutput arg is unused for the trafficSwfl producer, so a minimal stub is fine.
  const result = trafficSwfl.outputProducer!({
    pack: trafficSwfl,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<
    NonNullable<typeof trafficSwfl.outputProducer>
  >[0]);

  assert.equal(result.direction, "neutral");
  assert.equal(result.magnitude, 0.3);
  // Conclusion still includes level reads (avg + CAGR + Ian) but no YoY sentence.
  assert.ok(
    !/cohort-matched yoy|cohort-matched YoY/i.test(result.conclusion),
    "conclusion must not include a YoY sentence when cohort is missing",
  );
  // Level metrics still emitted.
  const metricNames = result.key_metrics.map((m) => m.metric);
  assert.ok(metricNames.includes("aadt_swfl_avg"));
  assert.ok(!metricNames.includes("aadt_yoy_pct"));
});
