// lib/should-i-sell/spread-calc.test.ts
import { expect, test } from "bun:test";
import {
  computeSpread,
  PROJECTION_TAG,
  PROJECTION_FALSIFIER,
  type SpreadInputs,
} from "./spread-calc";

const base: SpreadInputs = {
  v0: 500_000,
  yoyFraction: 0.098, // +9.8%, as a DECIMAL (housing brain stores 9.8 → caller ÷100)
  months: 12,
  propertyTaxAnnual: 6_000,
  insuranceAnnual: 4_000,
  mortgageInterestAnnual: null,
};

test("fixed inputs → fixed spread math over 12 months", () => {
  const r = computeSpread(base);
  expect(r.vFuture).toBe(549_000); // 500k × (1 + 0.098)
  expect(r.projectedChange).toBe(49_000);
  expect(r.carryingCostTotal).toBe(10_000); // 6k tax + 4k insurance + 0 mortgage
  expect(r.net).toBe(39_000);
  expect(r.complete).toBe(true);
});

test("6-month horizon prorates every carrying cost by half", () => {
  const r = computeSpread({ ...base, months: 6 });
  expect(r.projectedChange).toBeCloseTo(24_500, 5); // 500k × 0.098 × 0.5
  expect(r.carryingCostTotal).toBe(5_000); // (6k + 4k) × 0.5
  expect(r.net).toBeCloseTo(19_500, 5);
});

test("the [INFERENCE] tag + falsifier are ALWAYS present on the projection", () => {
  const r = computeSpread(base);
  expect(r.projectionTag).toBe(PROJECTION_TAG);
  expect(r.projectionTag).toBe("[INFERENCE]");
  expect(r.falsifier).toBe(PROJECTION_FALSIFIER);
  expect(r.falsifier.length).toBeGreaterThan(0);
  expect(r.projectionBasis).toContain("Redfin"); // cites the YoY base by name
});

test("the YoY input is a DECIMAL fraction, not a percent (the /100 contract)", () => {
  // Passing the DECIMAL 0.098 must move a $500k home by ~$49k over a year — NOT ~$294k
  // (which a raw 9.8 would produce). This test pins the contract so a future caller
  // passing the percent breaks loudly here.
  const r = computeSpread({ ...base, yoyFraction: 0.098, months: 12 });
  expect(r.projectedChange).toBe(49_000);
  const wrong = computeSpread({ ...base, yoyFraction: 9.8, months: 12 });
  expect(wrong.projectedChange).toBe(4_900_000); // absurd — documents why the fraction matters
});

test("negative YoY → a projected LOSS and a negative net, never floored at zero", () => {
  const r = computeSpread({ ...base, yoyFraction: -0.181, months: 12 });
  expect(r.projectedChange).toBeCloseTo(-90_500, 5); // 500k × -0.181
  expect(r.projectedChange).toBeLessThan(0);
  expect(r.net).toBeLessThan(0); // waiting costs you — the truth-first signal
  expect(r.vFuture).toBeCloseTo(409_500, 5);
});

test("insurance omission → explicit 'not included', flagged incomplete, NOT a $0 cost", () => {
  const r = computeSpread({ ...base, insuranceAnnual: null });
  const insLine = r.lines.find((l) => l.key === "insurance")!;
  expect(insLine.amount).toBeNull(); // NOT 0
  expect(insLine.included).toBe(false);
  expect(insLine.note).toContain("not included");
  expect(r.insuranceIncluded).toBe(false);
  expect(r.complete).toBe(false);
  // The net excludes insurance entirely (a "before insurance" figure), never a silent zero.
  expect(r.carryingCostTotal).toBe(6_000); // tax only
  expect(r.net).toBe(43_000); // 49k − 6k, insurance withheld
});

test("mortgage omission → exactly $0, stated plainly (not dropped)", () => {
  const r = computeSpread({ ...base, mortgageInterestAnnual: null });
  const mLine = r.lines.find((l) => l.key === "mortgage_interest")!;
  expect(mLine.amount).toBe(0);
  expect(mLine.included).toBe(true);
  expect(mLine.note).toContain("$0");
  expect(r.mortgageIncluded).toBe(false);
});

test("mortgage entered → prorated and added to carrying cost", () => {
  const r = computeSpread({ ...base, mortgageInterestAnnual: 12_000, months: 12 });
  const mLine = r.lines.find((l) => l.key === "mortgage_interest")!;
  expect(mLine.amount).toBe(12_000);
  expect(r.mortgageIncluded).toBe(true);
  expect(r.carryingCostTotal).toBe(22_000); // 6k + 4k + 12k
  expect(r.net).toBe(27_000); // 49k − 22k
});

test("property tax unavailable (null) → excluded with a plain note, never guessed", () => {
  const r = computeSpread({ ...base, propertyTaxAnnual: null });
  const taxLine = r.lines.find((l) => l.key === "property_tax")!;
  expect(taxLine.amount).toBeNull();
  expect(taxLine.included).toBe(false);
  expect(taxLine.note).toContain("not available");
  expect(r.carryingCostTotal).toBe(4_000); // insurance only
});

test("every line item is present and ordered — the spread is never a bare number", () => {
  const r = computeSpread(base);
  expect(r.lines.map((l) => l.key)).toEqual([
    "projected_change",
    "property_tax",
    "insurance",
    "mortgage_interest",
  ]);
});
