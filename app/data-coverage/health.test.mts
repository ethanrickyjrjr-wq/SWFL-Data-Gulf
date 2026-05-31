import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  buildWorkOrder,
  classify,
  formatSpans,
  freshnessStatus,
  missingYears,
  recentMissing,
  thresholdDays,
  toYear,
  workOrderLine,
  type SourceProbe,
} from "./health";

const YEAR = 2026;

function probe(over: Partial<SourceProbe>): SourceProbe {
  return {
    name: "x",
    label: "Test source",
    brainId: "macro-swfl",
    brainIsLive: true,
    lane: "tier-2",
    schema: "data_lake",
    table: "x",
    notYetRunning: false,
    note: null,
    cadenceDays: 30,
    toleranceMultiplier: 2,
    expectedRowsMin: 100,
    rowCount: 500,
    queryFailed: false,
    lastLoad: "2026-05-30",
    ageDays: 1,
    minYear: 2020,
    maxYear: 2026,
    untracked: false,
    ...over,
  };
}

// ── year math ────────────────────────────────────────────────────────────────

test("formatSpans collapses contiguous runs", () => {
  assert.equal(
    formatSpans([2020, 2021, 2023, 2024, 2025]),
    "2020–2021, 2023–2025",
  );
  assert.equal(formatSpans([2024]), "2024");
  assert.equal(formatSpans([]), "");
});

test("missingYears subtracts the contiguous span from the window", () => {
  assert.deepEqual(missingYears(2021, 2025, YEAR), [2020, 2026]);
  assert.deepEqual(missingYears(2020, 2026, YEAR), []);
  assert.deepEqual(
    missingYears(null, null, YEAR),
    [2020, 2021, 2022, 2023, 2024, 2025, 2026],
  );
});

test("recentMissing only keeps current and prior year", () => {
  assert.deepEqual(recentMissing([2020, 2026], YEAR), [2026]);
  assert.deepEqual(recentMissing([2020], YEAR), []);
  assert.deepEqual(recentMissing([2025, 2026], YEAR), [2025, 2026]);
});

test("toYear handles both column kinds", () => {
  assert.equal(toYear("2024-05-01", "date"), 2024);
  assert.equal(toYear(2023, "year"), 2023);
  assert.equal(toYear("2021", "year"), 2021);
});

// ── probe-identical freshness ─────────────────────────────────────────────────

test("thresholdDays truncates like the probe's int()", () => {
  assert.equal(thresholdDays(30, 2), 60);
  assert.equal(thresholdDays(365, 1.5), 547);
});

test("freshnessStatus matches the probe's age>threshold rule", () => {
  assert.equal(freshnessStatus(null, 60), "MISSING");
  assert.equal(freshnessStatus(61, 60), "STALE");
  assert.equal(freshnessStatus(60, 60), "FRESH");
});

// ── classification + tiers ────────────────────────────────────────────────────

test("stale active pipeline → Tier A / GRAB, overdue raises severity", () => {
  const r = classify(probe({ ageDays: 120, lastLoad: "2026-01-31" }), YEAR);
  assert.equal(r.status, "STALE");
  assert.equal(r.tier, "A");
  assert.equal(r.verb, "GRAB");
  // base 600 + min(300, 100*(120/60-1)=100) = 700, ×1.5 live = 1050
  assert.equal(r.severity, 1050);
});

test("live-brain amplifier multiplies severity by 1.5", () => {
  const live = classify(
    probe({ ageDays: 120, lastLoad: "2026-01-31", brainIsLive: true }),
    YEAR,
  );
  const dormant = classify(
    probe({ ageDays: 120, lastLoad: "2026-01-31", brainIsLive: false }),
    YEAR,
  );
  assert.equal(live.severity, Math.round(dormant.severity * 1.5));
});

test("0 rows with a recent load → EMPTY / FIX", () => {
  const r = classify(probe({ rowCount: 0 }), YEAR);
  assert.equal(r.status, "EMPTY");
  assert.equal(r.tier, "A");
  assert.equal(r.verb, "FIX");
});

test("below the volume floor → LOW_VOLUME / FIX", () => {
  const r = classify(probe({ rowCount: 50, expectedRowsMin: 100 }), YEAR);
  assert.equal(r.status, "LOW_VOLUME");
  assert.equal(r.verb, "FIX");
});

test("active pipeline, never loaded → MISSING / ROUTE", () => {
  const r = classify(
    probe({ lastLoad: null, ageDays: null, rowCount: 0 }),
    YEAR,
  );
  assert.equal(r.status, "MISSING");
  assert.equal(r.tier, "A");
  assert.equal(r.verb, "ROUTE");
});

test("parked + BLOCKED note → Tier C / FIND, never Tier A", () => {
  const r = classify(
    probe({
      notYetRunning: true,
      note: "BLOCKED 2026 — source unfit; use FBI CDE.",
      rowCount: 0,
      lastLoad: null,
      brainIsLive: false,
    }),
    YEAR,
  );
  assert.equal(r.tier, "C");
  assert.equal(r.verb, "FIND");
});

test("parked-not-blocked with data → Tier C, no work-order verb", () => {
  // bls_oews shape: backfilled, brain live, but pipeline parked.
  const r = classify(
    probe({
      notYetRunning: true,
      note: null,
      rowCount: 220,
      expectedRowsMin: 198,
      minYear: 2021,
      maxYear: 2026,
      lastLoad: "2026-05-18",
      ageDays: 13,
    }),
    YEAR,
  );
  assert.equal(r.tier, "C");
  assert.equal(r.verb, null);
});

test("old-year gap alone does NOT reach Tier A", () => {
  // covers 2021–2026; only 2020 missing → not recent → healthy.
  const r = classify(probe({ minYear: 2021, maxYear: 2026 }), YEAR);
  assert.equal(r.recentMissing.length, 0);
  assert.equal(r.tier, "D");
  assert.equal(r.verb, null);
});

test("fully healthy source → Tier D", () => {
  const r = classify(probe({}), YEAR);
  assert.equal(r.status, "FRESH");
  assert.equal(r.tier, "D");
  assert.equal(r.severity, 0);
});

test("tier-1 source skips the volume floor", () => {
  const r = classify(
    probe({
      lane: "tier-1-duckdb",
      schema: null,
      table: null,
      rowCount: null,
      expectedRowsMin: null,
      minYear: null,
      maxYear: null,
      ageDays: 400,
      lastLoad: "2025-01-01",
    }),
    YEAR,
  );
  assert.equal(r.status, "STALE");
  assert.equal(r.tier, "A");
  assert.equal(r.belowFloor, false);
});

// ── work order ────────────────────────────────────────────────────────────────

test("buildWorkOrder groups by verb and ranks; empty → nothing to chase", () => {
  const rows = [
    classify(
      probe({ name: "a", label: "A", ageDays: 120, lastLoad: "2026-01-31" }),
      YEAR,
    ), // GRAB
    classify(probe({ name: "b", label: "B", rowCount: 0 }), YEAR), // FIX
    classify(
      probe({
        name: "c",
        label: "C",
        lastLoad: null,
        ageDays: null,
        rowCount: 0,
      }),
      YEAR,
    ), // ROUTE
    classify(
      probe({
        name: "d",
        label: "D",
        notYetRunning: true,
        note: "BLOCKED — x",
        rowCount: 0,
        lastLoad: null,
      }),
      YEAR,
    ), // FIND
    classify(probe({ name: "e", label: "E" }), YEAR), // healthy, excluded
  ];
  const md = buildWorkOrder(rows, {
    generatedDate: "2026-05-31",
    totalSources: 5,
  });
  assert.ok(md.includes("## FIX (1)"));
  assert.ok(md.includes("## GRAB (1)"));
  assert.ok(md.includes("## ROUTE (1)"));
  assert.ok(md.includes("## FIND (1)"));
  assert.ok(md.includes("cadence_registry:a"));
  assert.ok(!md.includes("(E)")); // healthy source not listed

  const none = buildWorkOrder([classify(probe({}), YEAR)], {
    generatedDate: "2026-05-31",
    totalSources: 1,
  });
  assert.ok(none.includes("Nothing to chase"));
});

test("workOrderLine carries the ref and the brain", () => {
  const line = workOrderLine(
    classify(probe({ ageDays: 120, lastLoad: "2026-01-31" }), YEAR),
  );
  assert.ok(line.startsWith("- [STALE] Test source"));
  assert.ok(line.includes("Feeds macro-swfl."));
  assert.ok(line.includes("Ref: cadence_registry:x."));
});
