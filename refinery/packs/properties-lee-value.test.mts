import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { directionFromZScore, propertiesLeeValue } =
  await import("./properties-lee-value.mts");

// Rule table for properties-lee-value direction derivation.
// Bullish threshold: z ≥ +1.0. Bearish threshold: z ≤ −1.0. Neutral otherwise.
// Boundary tests pin behavior at the exact ±1.0 cut-points so future-you
// can't accidentally widen or narrow the band by an off-by-one.
const RULES: Array<[number | null, "bullish" | "bearish" | "neutral", string]> =
  [
    [3, "bullish", "clearly bullish"],
    [1.0, "bullish", "boundary: exactly +1σ → bullish (≥)"],
    [0.99, "neutral", "just inside band → neutral"],
    [0, "neutral", "zero → neutral"],
    [-0.99, "neutral", "just inside band → neutral (negative)"],
    [-1.0, "bearish", "boundary: exactly −1σ → bearish (≤)"],
    [-3, "bearish", "clearly bearish"],
    [null, "neutral", "null z (no current-year sales) → neutral"],
  ];

for (const [z, expected, label] of RULES) {
  test(`directionFromZScore: ${label} (z=${z})`, () => {
    assert.equal(directionFromZScore(z), expected);
  });
}

test("propertiesLeeValue pack: id and domain are stable", () => {
  assert.equal(propertiesLeeValue.id, "properties-lee-value");
  assert.equal(propertiesLeeValue.brain_id, "properties-lee-value");
  assert.equal(propertiesLeeValue.domain, "real-estate");
});

test("propertiesLeeValue pack: no upstream input_brains (leaf node)", () => {
  assert.deepEqual(propertiesLeeValue.input_brains, []);
});

test("propertiesLeeValue pack: deterministic (skipTriageAgent + skipSynthesisAgent)", () => {
  assert.equal(propertiesLeeValue.skipTriageAgent, true);
  assert.equal(propertiesLeeValue.skipSynthesisAgent, true);
});

test("propertiesLeeValue pack: source connectors wired (leepa + fhfa-hpi)", () => {
  assert.equal(propertiesLeeValue.sources.length, 2);
  const leepa = propertiesLeeValue.sources.find(
    (s) => s.source_id === "leepa_value_lee",
  );
  assert.ok(leepa, "leepa_value_lee source must be wired");
  assert.equal(leepa!.trust_tier, 2);
  const fhfa = propertiesLeeValue.sources.find(
    (s) => s.source_id === "fhfa_hpi",
  );
  assert.ok(fhfa, "fhfa_hpi source must be wired");
  assert.equal(fhfa!.trust_tier, 1);
});

test("propertiesLeeValue pack: fixture round-trip produces expected metrics", async () => {
  const { leepaValueSource } =
    await import("../sources/leepa-value-source.mts");
  const allFragments = await leepaValueSource.fetch();
  // Fixture has 22 last-sales spread across 2022-2025; expect 4+ year fragments + 1 summary.
  const yearKinds = allFragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "leepa-sales-year",
  );
  const summaryKinds = allFragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "leepa-summary",
  );
  assert.ok(yearKinds.length >= 4, "expected at least 4 year fragments");
  assert.equal(summaryKinds.length, 1, "expected exactly one summary fragment");

  propertiesLeeValue.corpusSummary!(allFragments);
  const result = propertiesLeeValue.outputProducer!({
    pack: propertiesLeeValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<
    NonNullable<typeof propertiesLeeValue.outputProducer>
  >[0]);

  // Fixture is engineered so the current-year sales (year-1 relative to today)
  // sit well above the trailing 3yr baseline → bullish.
  assert.equal(result.direction, "bullish");
  assert.ok(
    result.magnitude > 0 && result.magnitude <= 1,
    "magnitude must be in (0, 1]",
  );

  // Expected metrics surface.
  const metricNames = result.key_metrics.map((m) => m.metric);
  assert.ok(metricNames.includes("sales_velocity_per_1k"));
  assert.ok(metricNames.includes("sales_velocity_zscore"));
  assert.ok(metricNames.includes("soh_gap_median_pct"));
  assert.ok(metricNames.includes("total_parcels"));

  // Survival-bias caveat must be present — without it the brain's direction
  // read is potentially misleading.
  assert.ok(
    result.caveats.some((c) => /survival|upward|biased/i.test(c)),
    "survival-bias caveat must surface in OUTPUT",
  );
  // Lee-only scope caveat must be present (no SWFL-wide claim).
  assert.ok(
    result.caveats.some((c) => /lee county only|lee only/i.test(c)),
    "Lee-only scope caveat must surface in OUTPUT",
  );
  // No upstream edges, no drivers from input brains.
  assert.deepEqual(result.drivers, []);
  assert.deepEqual(result.contradicts, []);
  assert.deepEqual(result.exogenous_signals, []);
});

test("propertiesLeeValue pack: empty-snapshot path → neutral + zero-metrics fallback", () => {
  // Reset module state by re-invoking corpusSummary with zero fragments.
  propertiesLeeValue.corpusSummary!([]);
  const result = propertiesLeeValue.outputProducer!({
    pack: propertiesLeeValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<
    NonNullable<typeof propertiesLeeValue.outputProducer>
  >[0]);

  assert.equal(result.direction, "neutral");
  assert.equal(result.magnitude, 0);
  assert.deepEqual(result.key_metrics, []);
  assert.ok(
    result.caveats.some((c) => /no rows/i.test(c)),
    "must surface a 0-row caveat naming the pipeline + grant SQL",
  );
});
