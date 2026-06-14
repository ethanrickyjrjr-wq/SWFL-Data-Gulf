import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RawFragment } from "../types/fragment.mts";
import type { RswAirportNormalized } from "../sources/rsw-airport-source.mts";

process.env["REFINERY_SOURCE"] = "fixture";

const { rswAirport } = await import("./rsw-airport.mts");
const { rswAirportSource } = await import("../sources/rsw-airport-source.mts");

const NOW = "2026-05-30T00:00:00Z";

function makeFragment(
  airport_code: string,
  metric: string,
  value: number,
  yoy_pct_change: number | null,
  report_month: string,
): RawFragment<RswAirportNormalized> {
  const normalized: RswAirportNormalized = {
    kind: "rsw-airport-row",
    report_month,
    airport_code,
    metric,
    value,
    yoy_pct_change,
    period_label: report_month,
    source_url: "https://www.flylcpa.com/about-lcpa/reports-and-statistics/",
  };
  return {
    fragment_id: `rsw_airport_monthly:${airport_code}-${metric}-${report_month}`,
    source_id: "rsw_airport_monthly",
    source_trust_tier: 1,
    fetched_at: NOW,
    raw: {},
    normalized,
  };
}

/**
 * Build total_passengers fragments from a newest-first list of monthly values,
 * dated backward from 2026-04. Used to exercise the trailing-12 YoY direction
 * driver with controlled inputs (independent of the fixture).
 */
function tpFragments(monthlyValuesNewestFirst: number[]): RawFragment<RswAirportNormalized>[] {
  return monthlyValuesNewestFirst.map((v, i) => {
    const d = new Date(Date.UTC(2026, 3 - i, 1)); // 2026-04 is month index 3
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return makeFragment("RSW", "total_passengers", v, null, ym);
  });
}

// ── Test 1: fixture source returns rows, RSW-only ─────────────────────────────

test("rsw-airport: fixture source returns > 0 fragments, all RSW", async () => {
  const fragments = await rswAirportSource.fetch();
  assert.ok(fragments.length > 0, "expected fixture fragments");
  assert.equal(fragments[0].source_id, "rsw_airport_monthly");
  for (const f of fragments) {
    const norm = f.normalized as RswAirportNormalized;
    assert.equal(norm.kind, "rsw-airport-row");
    assert.ok(norm.report_month.match(/^\d{4}-\d{2}$/), "report_month should be YYYY-MM");
    assert.equal(
      norm.airport_code,
      "RSW",
      `airport_code should be RSW only (PGD dropped), got "${norm.airport_code}"`,
    );
  }
});

// ── Test 2: corpusSummary populates rows (total_passengers headline) ──────────

test("rsw-airport: corpusSummary extracts rows from fixture", async () => {
  const fragments = await rswAirportSource.fetch();
  const summary = rswAirport.corpusSummary!(fragments);
  assert.ok(summary.length > 0, "corpusSummary should return a SynthesisFact");
  const fact = summary[0];
  assert.equal(fact.topic, "rsw_airport_total_passengers");
  assert.ok(fact.value, "SynthesisFact should have a value");
  assert.ok(Array.isArray(fact.source_fragment_ids));
});

// ── Test 3: outputProducer surfaces the new 5-metric roster, no PGD ───────────

test("rsw-airport: outputProducer returns the new roster + computes trailing-12 direction", async () => {
  const fragments = await rswAirportSource.fetch();
  rswAirport.corpusSummary!(fragments); // populate closure state

  const result = rswAirport.outputProducer!({} as Parameters<typeof rswAirport.outputProducer>[0]);

  const slugs = result.key_metrics.map((m) => m.metric);
  // The direction driver + headline + decomposition + characterizing must all be present.
  for (const expected of [
    "rsw_trailing_12mo_total_passengers_yoy",
    "rsw_trailing_12mo_total_passengers",
    "rsw_total_passengers",
    "rsw_deplanements",
    "rsw_monthly_enplanements",
    "rsw_aircraft_operations",
    "rsw_freight_lbs",
    "rsw_pax_per_operation",
    "rsw_seasonality_ratio",
  ]) {
    assert.ok(slugs.includes(expected), `key_metrics should include ${expected}`);
  }
  // No PGD slugs survive.
  assert.ok(!slugs.some((s) => s.startsWith("pgd_")), "no PGD slugs should be emitted");

  // The 26-month window means trailing-12 YoY is computable → direction NOT neutral,
  // magnitude > 0. (This is the guarantee the window-widening buys.)
  assert.ok(
    result.direction === "bullish" || result.direction === "bearish",
    `direction should be computed (not neutral) on 29mo fixture, got "${result.direction}"`,
  );
  assert.ok(result.magnitude > 0 && result.magnitude <= 1, "magnitude in (0,1]");
  assert.ok(result.conclusion.length > 0, "conclusion should be non-empty");
  assert.ok(result.grain_boundary, "grain_boundary should be set");
});

// ── Test 4: direction is a valid enum value (fixture) ─────────────────────────

test("rsw-airport: direction is a valid BrainOutputDirection", async () => {
  const fragments = await rswAirportSource.fetch();
  rswAirport.corpusSummary!(fragments);
  const result = rswAirport.outputProducer!({} as Parameters<typeof rswAirport.outputProducer>[0]);
  assert.ok(
    ["bullish", "bearish", "mixed", "neutral"].includes(result.direction),
    `direction "${result.direction}" is not valid`,
  );
});

// ── Test 5: bullish when trailing-12 total_passengers rises ───────────────────
// Recent 12 months @110k vs prior 12 @100k → +10% trailing-12 YoY → bullish.

test("rsw-airport: bullish from rising trailing-12 total_passengers", () => {
  const frags = tpFragments([...Array(12).fill(110000), ...Array(12).fill(100000)]);
  rswAirport.corpusSummary!(frags);
  const result = rswAirport.outputProducer!({} as Parameters<typeof rswAirport.outputProducer>[0]);
  assert.equal(result.direction, "bullish", "rising trailing-12 should be bullish");
  // +10% / divisor 15 ≈ 0.67.
  assert.ok(
    Math.abs(result.magnitude - 10 / 15) < 0.01,
    `magnitude should reflect +10%/15, got ${result.magnitude}`,
  );
});

// ── Test 6: bearish when trailing-12 total_passengers falls ───────────────────

test("rsw-airport: bearish from falling trailing-12 total_passengers", () => {
  const frags = tpFragments([...Array(12).fill(90000), ...Array(12).fill(100000)]);
  rswAirport.corpusSummary!(frags);
  const result = rswAirport.outputProducer!({} as Parameters<typeof rswAirport.outputProducer>[0]);
  assert.equal(result.direction, "bearish", "falling trailing-12 should be bearish");
});

// ── Test 7: neutral when fewer than 24 months (YoY not computable) ────────────

test("rsw-airport: neutral when trailing-12 YoY not computable (<24 months)", () => {
  const frags = tpFragments(Array(12).fill(100000)); // only 12 months → no prior-12
  rswAirport.corpusSummary!(frags);
  const result = rswAirport.outputProducer!({} as Parameters<typeof rswAirport.outputProducer>[0]);
  assert.equal(result.direction, "neutral", "insufficient months → neutral");
  assert.equal(result.magnitude, 0);
});

// ── Test 8: empty data returns neutral ────────────────────────────────────────

test("rsw-airport: empty fragments returns neutral direction", () => {
  rswAirport.corpusSummary!([]);
  const result = rswAirport.outputProducer!({} as Parameters<typeof rswAirport.outputProducer>[0]);
  assert.equal(result.direction, "neutral");
  assert.equal(result.magnitude, 0);
  assert.equal(result.key_metrics.length, 0);
});
