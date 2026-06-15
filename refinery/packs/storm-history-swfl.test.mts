import { test } from "bun:test";
import assert from "node:assert/strict";

// Fixture mode BEFORE import — env.mts reads at module-init time.
process.env["REFINERY_SOURCE"] = "fixture";

const { stormHistorySwfl, directionFromTropicalCyclones } =
  await import("./storm-history-swfl.mts");
const { stormHistorySource } = await import("../sources/storm-history-source.mts");

test("directionFromTropicalCyclones returns bearish at >= 3 distinct cyclones, neutral otherwise", () => {
  assert.equal(directionFromTropicalCyclones(0), "neutral");
  assert.equal(directionFromTropicalCyclones(2), "neutral");
  assert.equal(directionFromTropicalCyclones(3), "bearish");
  assert.equal(directionFromTropicalCyclones(50), "bearish");
});

test("stormHistorySwfl: outputProducer returns valid BrainOutputProducerResult against fixture", async () => {
  const fragments = await stormHistorySource.fetch();
  // corpusSummary primes the pack's module-scope lastAggregate state.
  assert.ok(stormHistorySwfl.corpusSummary);
  const facts = stormHistorySwfl.corpusSummary!(fragments);
  assert.ok(facts.length >= 5, "expected at least 5 synthesis facts");

  assert.ok(stormHistorySwfl.outputProducer);
  // Pass a minimal PackOutput stub — outputProducer reads from module state.
  const result = stormHistorySwfl.outputProducer!({
    pack: stormHistorySwfl,
    version: 1,
    refined_at: "2026-05-19T00:00:00Z",
    citations: [],
    facts: [],
    recentNote: "",
  });

  // Fixture now carries Hurricane Ian, so the 3 billion-dollar metrics (date +
  // type + name) appear: 4 numeric + counties_covered + ingest_vintage + 3
  // billion-dollar = 9 metrics. Assert the floor at >= 7.
  assert.ok(
    result.key_metrics.length >= 7,
    `expected at least 7 key_metrics, got ${result.key_metrics.length}`,
  );

  // Every metric carries source provenance.
  for (const m of result.key_metrics) {
    assert.ok(m.source, `metric ${m.metric} missing source`);
    assert.equal(m.source.tier, 1);
    assert.match(m.source.citation, /NOAA Storm Events/);
    assert.match(m.source.citation, /_tier1_inventory/);
  }

  // The billion-dollar proper-name metric surfaces "Ian" (Hurricane Ian, 2022).
  const billionName = result.key_metrics.find(
    (m) => m.metric === "storm_last_billion_dollar_event_name",
  );
  assert.ok(billionName, "expected storm_last_billion_dollar_event_name metric");
  assert.equal(billionName!.value, "Ian");

  // The renamed distinct-tropical-cyclone metric is present.
  const cyclones = result.key_metrics.find((m) => m.metric === "storm_tropical_cyclones_10yr");
  assert.ok(cyclones, "expected storm_tropical_cyclones_10yr metric");

  // Counties metric reflects alphabetical sort across the 3 SWFL counties.
  const counties = result.key_metrics.find((m) => m.metric === "storm_counties_covered");
  assert.ok(counties, "expected storm_counties_covered metric");
  assert.equal(counties!.value, "CHARLOTTE+COLLIER+LEE");

  // Ingest vintage is a categorical YYYY-YYYY span.
  const vintage = result.key_metrics.find((m) => m.metric === "storm_ingest_vintage");
  assert.ok(vintage, "expected storm_ingest_vintage metric");
  assert.match(String(vintage!.value), /^\d{4}-\d{4}$/);

  // Caveats: at least 3, including schema-drift + parser limits + vintage range.
  assert.ok(result.caveats.length >= 3, `expected >= 3 caveats, got ${result.caveats.length}`);

  // Substantive prose conclusion.
  assert.ok(
    result.conclusion.length > 50,
    `expected substantive conclusion, got ${result.conclusion.length} chars`,
  );

  // Direction is deterministic and one of the two allowed values for this brain.
  assert.ok(
    result.direction === "bearish" || result.direction === "neutral",
    `expected bearish or neutral, got ${result.direction}`,
  );
});

test("stormHistorySwfl: direction logic produces deterministic result given fixture data", async () => {
  const fragments = await stormHistorySource.fetch();
  assert.ok(stormHistorySwfl.corpusSummary);
  stormHistorySwfl.corpusSummary!(fragments);
  assert.ok(stormHistorySwfl.outputProducer);
  const r1 = stormHistorySwfl.outputProducer!({
    pack: stormHistorySwfl,
    version: 1,
    refined_at: "2026-05-19T00:00:00Z",
    citations: [],
    facts: [],
    recentNote: "",
  });
  const r2 = stormHistorySwfl.outputProducer!({
    pack: stormHistorySwfl,
    version: 1,
    refined_at: "2026-05-19T00:00:00Z",
    citations: [],
    facts: [],
    recentNote: "",
  });
  assert.equal(r1.direction, r2.direction);
  assert.equal(r1.magnitude, r2.magnitude);
});
