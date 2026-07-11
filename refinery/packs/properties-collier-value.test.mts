import { test } from "bun:test";
import assert from "node:assert/strict";

process.env["REFINERY_SOURCE"] = "fixture";

const { directionFromZScore, propertiesCollierValue } =
  await import("./properties-collier-value.mts");

// Direction rule table — identical thresholds to properties-lee-value
// (bullish z >= +1.0, bearish z <= -1.0, neutral otherwise). Boundary cases
// pin the exact cut-points so the band can't drift.
const RULES: Array<[number | null, "bullish" | "bearish" | "neutral", string]> = [
  [3, "bullish", "clearly bullish"],
  [1.0, "bullish", "boundary: exactly +1 sigma -> bullish (>=)"],
  [0.99, "neutral", "just inside band -> neutral"],
  [0, "neutral", "zero -> neutral"],
  [-0.99, "neutral", "just inside band -> neutral (negative)"],
  [-1.0, "bearish", "boundary: exactly -1 sigma -> bearish (<=)"],
  [-3, "bearish", "clearly bearish"],
  [null, "neutral", "null z -> neutral"],
];

for (const [z, expected, label] of RULES) {
  test(`directionFromZScore: ${label} (z=${z})`, () => {
    assert.equal(directionFromZScore(z), expected);
  });
}

test("propertiesCollierValue pack: id and domain are stable", () => {
  assert.equal(propertiesCollierValue.id, "properties-collier-value");
  assert.equal(propertiesCollierValue.brain_id, "properties-collier-value");
  assert.equal(propertiesCollierValue.domain, "real-estate");
});

test("propertiesCollierValue pack: no upstream input_brains (leaf node)", () => {
  assert.deepEqual(propertiesCollierValue.input_brains, []);
});

test("propertiesCollierValue pack: deterministic (skipTriageAgent + skipSynthesisAgent)", () => {
  assert.equal(propertiesCollierValue.skipTriageAgent, true);
  assert.equal(propertiesCollierValue.skipSynthesisAgent, true);
});

test("propertiesCollierValue pack: Redfin + FDOR parcel + FHFA + sold-median sources wired", () => {
  // 2026-07-11: collier_sold_median added as the 4th connector (homes-only sold
  // median per ZIP off the FDOR recorded-deed sale price — the sold counterpart to
  // the active-listing asking median that land-blended vacant parcels).
  assert.equal(propertiesCollierValue.sources.length, 4);
  const soldMedian = propertiesCollierValue.sources.find(
    (s) => s.source_id === "collier_sold_median",
  );
  assert.ok(soldMedian, "collier_sold_median source must be wired");
  assert.equal(soldMedian!.trust_tier, 2);
  const redfin = propertiesCollierValue.sources.find(
    (s) => s.source_id === "redfin_collier_market",
  );
  assert.ok(redfin, "redfin_collier_market source must be wired");
  assert.equal(redfin!.trust_tier, 2);
  const parcels = propertiesCollierValue.sources.find(
    (s) => s.source_id === "collier_parcels_fdor",
  );
  assert.ok(parcels, "collier_parcels_fdor source must be wired");
  assert.equal(parcels!.trust_tier, 2);
  const fhfa = propertiesCollierValue.sources.find((s) => s.source_id === "fhfa_hpi");
  assert.ok(fhfa, "fhfa_hpi source must be wired");
  assert.equal(fhfa!.trust_tier, 1);
});

test("propertiesCollierValue pack: fixture round-trip produces expected metrics", async () => {
  const { collierMarketSource } = await import("../sources/collier-market-source.mts");
  const { collierParcelsSource } = await import("../sources/collier-parcels-source.mts");
  const { fhfaHpiSource } = await import("../sources/fhfa-hpi-source.mts");
  const allFragments = [
    ...(await collierMarketSource.fetch()),
    ...(await collierParcelsSource.fetch()),
    ...(await fhfaHpiSource.fetch()),
  ];

  const yearKinds = allFragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "collier-sales-year",
  );
  const summaryKinds = allFragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "collier-summary",
  );
  const parcelKinds = allFragments.filter(
    (f) => (f.normalized as { kind: string }).kind === "collier-parcels-summary",
  );
  assert.ok(yearKinds.length >= 4, "expected at least 4 year fragments");
  assert.equal(summaryKinds.length, 1, "expected exactly one summary fragment");
  assert.equal(parcelKinds.length, 1, "expected exactly one parcels-summary fragment");

  propertiesCollierValue.corpusSummary!(allFragments);
  const result = propertiesCollierValue.outputProducer!({
    pack: propertiesCollierValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesCollierValue.outputProducer>>[0]);

  // Fixture engineered so current-year (year-1) homes_sold sits well above the
  // trailing 3yr baseline -> bullish.
  assert.equal(result.direction, "bullish");
  assert.ok(result.magnitude > 0 && result.magnitude <= 1, "magnitude must be in (0, 1]");

  const metricNames = result.key_metrics.map((m) => m.metric);
  assert.ok(metricNames.includes("collier_homes_sold_zscore"));
  assert.ok(metricNames.includes("collier_homes_sold_per_year"));
  assert.ok(metricNames.includes("collier_median_sale_price_yoy"));
  assert.ok(metricNames.includes("collier_months_of_supply"));
  // Parcel-grain parity metrics from the FDOR cadastral source.
  assert.ok(metricNames.includes("collier_soh_gap_median_pct"));
  assert.ok(metricNames.includes("collier_total_parcels"));
  assert.ok(
    metricNames.includes("fhfa_naples_msa_yoy_pct"),
    "fhfa_naples_msa_yoy_pct metric must appear when FHFA fixture has Naples rows",
  );

  const naplesMsaMetric = result.key_metrics.find((m) => m.metric === "fhfa_naples_msa_yoy_pct");
  assert.ok(naplesMsaMetric, "Naples MSA HPI metric must exist");
  assert.equal(naplesMsaMetric!.value, 1.41, "Naples MSA YoY must be +1.41% from fixture");
  assert.equal(naplesMsaMetric!.direction, "rising", "Naples MSA rising (positive YoY)");
  assert.equal(naplesMsaMetric!.units, "percent");
  assert.equal(naplesMsaMetric!.display_format, "percent");

  // Parcel fixture has 5 parcels (4 homesteaded); SOH gaps [20,30,3.33,28] -> median 24.
  const totalParcels = result.key_metrics.find((m) => m.metric === "collier_total_parcels");
  assert.equal(totalParcels!.value, 5, "total_parcels must count all fixture parcels");
  const sohGap = result.key_metrics.find((m) => m.metric === "collier_soh_gap_median_pct");
  assert.equal(sohGap!.value, 24, "SOH gap median over homesteaded parcels");

  // Property-type filter check: only "All Residential" rows count toward
  // velocity. The fixture plants a Condo/Co-op row with homes_sold=99999 in the
  // current year that MUST be excluded — so the current-year count is exactly
  // the All Residential figure (12000), not inflated.
  const perYear = result.key_metrics.find((m) => m.metric === "collier_homes_sold_per_year");
  assert.equal(
    perYear!.value,
    12000,
    "non-headline property types must be filtered out of velocity",
  );

  // Collier-only scope caveat must be present (no SWFL-wide claim).
  assert.ok(
    result.caveats.some((c) => /collier county only|collier only/i.test(c)),
    "Collier-only scope caveat must surface in OUTPUT",
  );
  // Market-grain / no-SOH caveat must be present (honesty about the source).
  assert.ok(
    result.caveats.some((c) => /market-grain|save-our-homes|assessed/i.test(c)),
    "market-grain (no SOH) caveat must surface in OUTPUT",
  );

  // Leaf node — no upstream-driven arrays.
  assert.deepEqual(result.drivers, []);
  assert.deepEqual(result.contradicts, []);
  assert.deepEqual(result.exogenous_signals, []);
});

test("propertiesCollierValue pack: empty-snapshot path -> neutral + zero-metrics fallback", () => {
  propertiesCollierValue.corpusSummary!([]);
  const result = propertiesCollierValue.outputProducer!({
    pack: propertiesCollierValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesCollierValue.outputProducer>>[0]);

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
// every signal in that fixture points bullish. This loads a SECOND, bearish
// fixture (homes_sold collapsing below the trailing-3yr baseline; MOS climbing
// to 8.5) and pins that the brain reads BEARISH. Collier's brain direction is
// the Redfin homes-sold z-score, so this fixture flips the actual brain
// direction (parity with the Lee LeePA bearish test). MOS rising is
// corroborating only — its polarity is locked separately in
// refinery/vocab/properties-polarity-lock.test.mts (the pack emits MOS as a
// 'stable' level metric and never applies its polarity).
// ---------------------------------------------------------------------------
test("propertiesCollierValue pack: BEARISH scenario → brain direction is bearish (polarity lock)", async () => {
  const { aggregateFromRows } = await import("../sources/collier-market-source.mts");
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  const fixturePath = join(
    process.cwd(),
    "refinery",
    "__fixtures__",
    "properties-collier-value.bearish.sample.json",
  );
  const data = JSON.parse(await readFile(fixturePath, "utf-8")) as {
    rows: Parameters<typeof aggregateFromRows>[0];
  };
  const { yearly, summary } = aggregateFromRows(data.rows);

  // Mirror the source's fragment emission (collier-sales-year + collier-summary).
  // The hardwired source.fetch() only reads the bullish file, so we build the
  // market fragments directly from the bearish fixture — no parcels/FHFA needed
  // to exercise the velocity-driven direction.
  const fetched_at = "2026-06-13T00:00:00Z";
  const fragments = [
    ...yearly.map((yr) => ({
      fragment_id: `collier-bearish-sales-${yr.year}`,
      source_id: "redfin_collier_market",
      source_trust_tier: 2,
      fetched_at,
      raw: { year: yr.year, homes_sold: yr.homes_sold },
      normalized: yr,
    })),
    {
      fragment_id: "collier-bearish-summary",
      source_id: "redfin_collier_market",
      source_trust_tier: 2,
      fetched_at,
      raw: {
        latest_period: summary.latest_period,
        median_sale_price_yoy_pct: summary.median_sale_price_yoy_pct,
        months_of_supply: summary.months_of_supply,
      },
      normalized: summary,
    },
  ];

  propertiesCollierValue.corpusSummary!(
    fragments as unknown as Parameters<NonNullable<typeof propertiesCollierValue.corpusSummary>>[0],
  );
  const result = propertiesCollierValue.outputProducer!({
    pack: propertiesCollierValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesCollierValue.outputProducer>>[0]);

  // THE LOCK: a market whose current-year velocity collapsed below baseline
  // MUST read bearish, never bullish.
  assert.equal(
    result.direction,
    "bearish",
    "current-year homes_sold below the trailing-3yr baseline must read bearish — a bullish read here is a z->direction polarity inversion",
  );
  assert.ok(result.magnitude > 0 && result.magnitude <= 1, "magnitude must be in (0, 1]");

  // z-score metric: negative value + the 'falling' branch (the bullish fixture
  // only ever exercises 'rising').
  const z = result.key_metrics.find((m) => m.metric === "collier_homes_sold_zscore");
  assert.ok(z, "collier_homes_sold_zscore metric must be present");
  assert.ok((z!.value as number) < 0, "z-score must be negative in the bearish scenario");
  assert.equal(
    z!.direction,
    "falling",
    "z-score metric direction must be 'falling' in the bearish scenario",
  );

  // Months of supply climbs to >= 7.5 (a glutted market). It does NOT drive the
  // pack direction — emitted as a 'stable' level metric; polarity is vocab-locked.
  const mos = result.key_metrics.find((m) => m.metric === "collier_months_of_supply");
  assert.ok(mos, "collier_months_of_supply metric must be present");
  assert.ok((mos!.value as number) >= 7.5, "MOS must be >= 7.5 in the bearish scenario");
  assert.equal(mos!.direction, "stable", "MOS is a level metric — pack emits 'stable'");

  // The non-headline Condo/Co-op trap (homes_sold 99999) must STILL be filtered
  // out under the bearish path — else current-year velocity would invert bullish.
  const perYear = result.key_metrics.find((m) => m.metric === "collier_homes_sold_per_year");
  assert.equal(
    perYear!.value,
    7000,
    "non-headline property types must be filtered out — the filter is load-bearing for the bearish read",
  );
});

test("propertiesCollierValue pack: homes-only sold median surfaces (metric + per-ZIP detail table, not the land-blend)", async () => {
  const { collierParcelsSource } = await import("../sources/collier-parcels-source.mts");
  const { collierSoldMedianSource } = await import("../sources/collier-sold-median-source.mts");
  // Parcel fragments keep the pack out of the empty path; sold-median fragments
  // drive the new metric + detail table.
  const fragments = [
    ...(await collierParcelsSource.fetch()),
    ...(await collierSoldMedianSource.fetch()),
  ];

  propertiesCollierValue.corpusSummary!(
    fragments as unknown as Parameters<NonNullable<typeof propertiesCollierValue.corpusSummary>>[0],
  );
  const result = propertiesCollierValue.outputProducer!({
    pack: propertiesCollierValue,
    version: 1,
    refined_at: new Date().toISOString(),
    citations: [],
    facts: [],
    recentNote: "",
  } as unknown as Parameters<NonNullable<typeof propertiesCollierValue.outputProducer>>[0]);

  // (a) county homes-only sold median metric — intensive, currency, in the homes band.
  const m = result.key_metrics.find((k) => k.metric === "collier_sold_median_homes_only");
  assert.ok(m, "collier_sold_median_homes_only metric must surface");
  assert.equal(m!.variable_type, "intensive");
  assert.equal(m!.display_format, "currency");
  assert.ok(
    (m!.value as number) > 200000,
    `county median must be in the homes band (never the vacant-land tail), got ${m!.value}`,
  );

  // (b) per-ZIP detail table — every ZIP reads the homes band, NOT a land-blend.
  const dt = (result.detail_tables ?? []).find((t) => t.id === "collier_sold_median_by_zip");
  assert.ok(dt, "collier_sold_median_by_zip detail table must surface");
  const naples = dt!.rows.find((r) => r.key === "34102");
  assert.ok(naples, "34102 row must be present");
  assert.ok(
    (naples!.cells.median_sale as number) > 200000,
    `34102 sold median must be the homes band, got ${naples!.cells.median_sale}`,
  );

  // (c) the min-N gate: a sub-20-sale ZIP reports the COUNTY median, flagged — never a
  // thin-sample number presented as a real ZIP median.
  const thin = dt!.rows.find((r) => r.key === "34140");
  assert.ok(thin, "34140 (n=18) row must be present");
  assert.equal(thin!.cells.county_fallback, true, "sub-20 ZIP must be flagged county_fallback");
  assert.equal(
    thin!.cells.median_sale,
    m!.value,
    "a county-fallback ZIP must report exactly the county median",
  );

  // (d) citation names the real source and leaks no placeholder tokens.
  const cite = String(m!.source.citation);
  assert.ok(
    /Collier County Property Appraiser/i.test(cite),
    `citation must name the source: ${cite}`,
  );
  assert.ok(
    !/\[(config|internal|ref)\]/.test(cite),
    `citation must not leak placeholders: ${cite}`,
  );
});
