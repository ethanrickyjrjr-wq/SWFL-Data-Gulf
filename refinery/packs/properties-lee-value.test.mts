import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { directionFromZScore, propertiesLeeValue } = await import("./properties-lee-value.mts");

// Rule table for properties-lee-value direction derivation.
// Bullish threshold: z ≥ +1.0. Bearish threshold: z ≤ −1.0. Neutral otherwise.
// Boundary tests pin behavior at the exact ±1.0 cut-points so future-you
// can't accidentally widen or narrow the band by an off-by-one.
const RULES: Array<[number | null, "bullish" | "bearish" | "neutral", string]> = [
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

test("propertiesLeeValue pack: source connectors wired (leepa + redfin-lee-market + fhfa-hpi + leepa-sold-median + lee-parcels-fdor)", () => {
  // Drift fix (2026-06-13): the redfin-lee build added leeMarketSource as a 3rd
  // connector but this assertion still expected 2 — it was red on main. Pinned
  // to 3 and the redfin_lee_market connector added below.
  // 2026-07-11: leepa_sold_median added as the 4th connector (homes-only sold
  // median per ZIP from recorded deeds).
  // 2026-07-18: lee_parcels_fdor added as the 5th connector (FDOR cadastral
  // use-code category cross-check, sibling to collier_parcels' widen).
  assert.equal(propertiesLeeValue.sources.length, 5);
  const leepa = propertiesLeeValue.sources.find((s) => s.source_id === "leepa_value_lee");
  assert.ok(leepa, "leepa_value_lee source must be wired");
  assert.equal(leepa!.trust_tier, 2);
  const leeMarket = propertiesLeeValue.sources.find((s) => s.source_id === "redfin_lee_market");
  assert.ok(leeMarket, "redfin_lee_market source must be wired");
  assert.equal(leeMarket!.trust_tier, 2);
  const fhfa = propertiesLeeValue.sources.find((s) => s.source_id === "fhfa_hpi");
  assert.ok(fhfa, "fhfa_hpi source must be wired");
  assert.equal(fhfa!.trust_tier, 1);
  const soldMedian = propertiesLeeValue.sources.find((s) => s.source_id === "leepa_sold_median");
  assert.ok(soldMedian, "leepa_sold_median source must be wired");
  assert.equal(soldMedian!.trust_tier, 2);
  const fdorParcels = propertiesLeeValue.sources.find((s) => s.source_id === "lee_parcels_fdor");
  assert.ok(fdorParcels, "lee_parcels_fdor source must be wired");
  assert.equal(fdorParcels!.trust_tier, 2);
});

test("propertiesLeeValue pack: FDOR commercial parcel count surfaces (cross-check vs LeePA total_parcels)", async () => {
  const { leepaValueSource } = await import("../sources/leepa-value-source.mts");
  const { leeParcelsSource } = await import("../sources/lee-parcels-source.mts");
  const fragments = [...(await leepaValueSource.fetch()), ...(await leeParcelsSource.fetch())];

  propertiesLeeValue.corpusSummary!(
    fragments as unknown as Parameters<NonNullable<typeof propertiesLeeValue.corpusSummary>>[0],
  );
  const result = propertiesLeeValue.outputProducer!({
    pack: propertiesLeeValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesLeeValue.outputProducer>>[0]);

  const m = result.key_metrics.find((k) => k.metric === "fdor_commercial_parcel_count");
  assert.ok(m, "fdor_commercial_parcel_count metric must surface");
  assert.equal(m!.variable_type, "extensive");
  assert.equal(m!.display_format, "count");
  assert.equal(m!.value, 45000, "must match the fixture's commercial_parcels value");
  assert.ok(/FDOR/.test(m!.source.citation));

  // Cross-check caveat must be present — the two total counts (LeePA vs FDOR)
  // come from different sources and must never be silently reconciled.
  assert.ok(
    result.caveats.some((c) => /separate source/i.test(c) && /cross-check/i.test(c)),
    "cross-check caveat must surface distinguishing FDOR from LeePA sourcing",
  );
});

test("propertiesLeeValue pack: without the lee-parcels fragment, fdor_commercial_parcel_count does not surface", async () => {
  const { leepaValueSource } = await import("../sources/leepa-value-source.mts");
  const fragments = await leepaValueSource.fetch();

  propertiesLeeValue.corpusSummary!(
    fragments as unknown as Parameters<NonNullable<typeof propertiesLeeValue.corpusSummary>>[0],
  );
  const result = propertiesLeeValue.outputProducer!({
    pack: propertiesLeeValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesLeeValue.outputProducer>>[0]);

  assert.ok(
    !result.key_metrics.some((k) => k.metric === "fdor_commercial_parcel_count"),
    "metric must not surface without a lee-parcels-summary fragment (no invented value)",
  );
});

test("propertiesLeeValue pack: fixture round-trip produces expected metrics", async () => {
  const { leepaValueSource } = await import("../sources/leepa-value-source.mts");
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
  } as unknown as Parameters<NonNullable<typeof propertiesLeeValue.outputProducer>>[0]);

  // Fixture is engineered so the current-year sales (year-1 relative to today)
  // sit well above the trailing 3yr baseline → bullish.
  assert.equal(result.direction, "bullish");
  assert.ok(result.magnitude > 0 && result.magnitude <= 1, "magnitude must be in (0, 1]");

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

test("propertiesLeeValue pack: homes-only sold median surfaces (metric + per-ZIP detail table, not the land-blend)", async () => {
  const { leepaValueSource } = await import("../sources/leepa-value-source.mts");
  const { leepaSoldMedianSource } = await import("../sources/leepa-sold-median-source.mts");
  // Parcel fragments keep the pack out of the empty path; sold-median fragments
  // drive the new metric + detail table.
  const fragments = [...(await leepaValueSource.fetch()), ...(await leepaSoldMedianSource.fetch())];

  propertiesLeeValue.corpusSummary!(
    fragments as unknown as Parameters<NonNullable<typeof propertiesLeeValue.corpusSummary>>[0],
  );
  const result = propertiesLeeValue.outputProducer!({
    pack: propertiesLeeValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesLeeValue.outputProducer>>[0]);

  // (a) county homes-only sold median metric — intensive, currency, in the homes band.
  const m = result.key_metrics.find((k) => k.metric === "lee_sold_median_homes_only");
  assert.ok(m, "lee_sold_median_homes_only metric must surface");
  assert.equal(m!.variable_type, "intensive");
  assert.equal(m!.display_format, "currency");
  assert.ok(
    (m!.value as number) > 200000,
    `county median must be in the homes band, got ${m!.value}`,
  );

  // (b) per-ZIP detail table; 33972 reads the homes band, NOT the $35k land-blend.
  const dt = (result.detail_tables ?? []).find((t) => t.id === "lee_sold_median_by_zip");
  assert.ok(dt, "lee_sold_median_by_zip detail table must surface");
  const row = dt!.rows.find((r) => r.key === "33972");
  assert.ok(row, "33972 row must be present");
  assert.ok(
    (row!.cells.median_sale as number) > 200000,
    `33972 sold median must be the homes band, not the $35k land-blend — got ${row!.cells.median_sale}`,
  );

  // (c) citation names Lee County Property Appraiser and leaks no placeholder tokens.
  assert.ok(/Lee County Property Appraiser/.test(m!.source.citation));
  assert.ok(!/\[config\]|\[internal\]|§/.test(m!.source.citation));
});

test("propertiesLeeValue pack: no stale 'last_sale_amount is null' claim anywhere in facts or OUTPUT", async () => {
  // Fetch ALL real sources so the lee-market path (where the stale claim lived)
  // is exercised — the stale string sat in a corpus fact, not the result object.
  const { leepaValueSource } = await import("../sources/leepa-value-source.mts");
  const { leeMarketSource } = await import("../sources/lee-market-source.mts");
  const { fhfaHpiSource } = await import("../sources/fhfa-hpi-source.mts");
  const { leepaSoldMedianSource } = await import("../sources/leepa-sold-median-source.mts");
  const fragments = [
    ...(await leepaValueSource.fetch()),
    ...(await leeMarketSource.fetch()),
    ...(await fhfaHpiSource.fetch()),
    ...(await leepaSoldMedianSource.fetch()),
  ];
  const facts = propertiesLeeValue.corpusSummary!(
    fragments as unknown as Parameters<NonNullable<typeof propertiesLeeValue.corpusSummary>>[0],
  );
  const result = propertiesLeeValue.outputProducer!({
    pack: propertiesLeeValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesLeeValue.outputProducer>>[0]);
  const blob = JSON.stringify(facts) + JSON.stringify(result);
  assert.ok(
    !/last_sale_amount is null/i.test(blob),
    "the stale 'LeePA last_sale_amount is null' claim must be gone — it is ~98% populated",
  );
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
  } as unknown as Parameters<NonNullable<typeof propertiesLeeValue.outputProducer>>[0]);

  assert.equal(result.direction, "neutral");
  assert.equal(result.magnitude, 0);
  assert.deepEqual(result.key_metrics, []);
  assert.ok(
    result.caveats.some((c) => /no rows/i.test(c)),
    "must surface a 0-row caveat naming the pipeline + grant SQL",
  );
});

// ---------------------------------------------------------------------------
// POLARITY LOCK — bearish scenario.
//
// The bullish round-trip above can't catch a z->direction wire-up inversion:
// the fixture's current year sits above baseline, so it's always bullish. The
// Lee BRAIN direction is parcel-driven (LeePA qualified-sale velocity z-score),
// NOT the Redfin market fixture — so this loads a SECOND, bearish LeePA PARCEL
// fixture whose current-year (2025) sale count is below the trailing-3yr
// baseline, and pins that the brain reads BEARISH. Parity with the Collier
// bearish test (which flips Collier's market-driven direction).
// ---------------------------------------------------------------------------
test("propertiesLeeValue pack: BEARISH parcel scenario → brain direction is bearish (polarity lock)", async () => {
  const { aggregateFromParcels } = await import("../sources/leepa-value-source.mts");
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const fixturePath = join(
    process.cwd(),
    "refinery",
    "__fixtures__",
    "properties-lee-value.bearish.sample.json",
  );
  const data = JSON.parse(await readFile(fixturePath, "utf-8")) as {
    parcels: Parameters<typeof aggregateFromParcels>[0];
  };
  const { yearly, summary } = aggregateFromParcels(data.parcels);

  // Mirror the source's fragment emission (leepa-sales-year + leepa-summary).
  // The hardwired source.fetch() only reads the bullish file, so we build the
  // parcel fragments directly from the bearish fixture.
  const fetched_at = "2026-06-13T00:00:00Z";
  const fragments = [
    ...yearly.map((yr) => ({
      fragment_id: `lee-bearish-sales-${yr.year}`,
      source_id: "leepa_value_lee",
      source_trust_tier: 2,
      fetched_at,
      raw: { year: yr.year, sales_count: yr.sales_count },
      normalized: yr,
    })),
    {
      fragment_id: "lee-bearish-summary",
      source_id: "leepa_value_lee",
      source_trust_tier: 2,
      fetched_at,
      raw: {
        total_parcels: summary.total_parcels,
        soh_homesteaded_parcels: summary.soh_homesteaded_parcels,
      },
      normalized: summary,
    },
  ];

  propertiesLeeValue.corpusSummary!(
    fragments as unknown as Parameters<NonNullable<typeof propertiesLeeValue.corpusSummary>>[0],
  );
  const result = propertiesLeeValue.outputProducer!({
    pack: propertiesLeeValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesLeeValue.outputProducer>>[0]);

  // THE LOCK: current-year qualified sales below the trailing-3yr baseline MUST
  // read bearish, never bullish. A bullish read here is a z->direction inversion.
  assert.equal(
    result.direction,
    "bearish",
    "current-year sales below the trailing-3yr baseline must read bearish — a bullish read is a z->direction polarity inversion",
  );
  assert.ok(result.magnitude > 0 && result.magnitude <= 1, "magnitude must be in (0, 1]");

  // Velocity z-score metric: negative value + the 'falling' branch (the bullish
  // fixture only ever exercises 'rising').
  const z = result.key_metrics.find((m) => m.metric === "sales_velocity_zscore");
  assert.ok(z, "sales_velocity_zscore metric must be present");
  assert.ok((z!.value as number) < 0, "z-score must be negative in the bearish scenario");
  assert.equal(
    z!.direction,
    "falling",
    "z-score metric direction must be 'falling' in the bearish scenario",
  );

  // Velocity-per-1k must still surface (level metric, parcel-grain).
  assert.ok(
    result.key_metrics.some((m) => m.metric === "sales_velocity_per_1k"),
    "sales_velocity_per_1k must be present",
  );
});
