// lib/should-i-sell/condo-share.test.ts
import { expect, test } from "bun:test";
import { condoShareForZip, condoShareSentence } from "./condo-share";

test("returns a sourced share for a condo-heavy Naples ZIP", () => {
  const s = condoShareForZip("34103");
  expect(s).not.toBeNull();
  expect(s!.pct).toBeGreaterThan(50);
  expect(s!.condoParcels).toBeGreaterThan(0);
  expect(s!.totalParcels).toBeGreaterThan(s!.condoParcels);
  expect(s!.source.label).toBe("SWFL Data Gulf");
  expect(s!.asOf).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
});

test("returns a low but real share for a mostly-single-family ZIP (Cape Coral)", () => {
  const s = condoShareForZip("33904");
  expect(s).not.toBeNull();
  expect(s!.pct).toBeGreaterThan(0);
  expect(s!.pct).toBeLessThan(40);
});

test("straddle ZIP 34110 combines both counties (share stays a valid fraction)", () => {
  const s = condoShareForZip("34110");
  expect(s).not.toBeNull();
  // condos never exceed total after the Lee+Collier combine
  expect(s!.condoParcels).toBeLessThanOrEqual(s!.totalParcels);
  expect(Math.round((100 * s!.condoParcels) / s!.totalParcels)).toBeGreaterThan(40);
});

test("a ZIP outside the Lee/Collier footprint returns null (never invents a share)", () => {
  expect(condoShareForZip("90210")).toBeNull();
  expect(condoShareForZip("")).toBeNull();
  expect(condoShareForZip(null)).toBeNull();
  expect(condoShareForZip(undefined)).toBeNull();
});

test("the sentence states the real number and names the segment, no place leak", () => {
  const s = condoShareForZip("34145")!;
  const line = condoShareSentence(s, "Marco Island");
  expect(line).toContain(`${s.pct}%`);
  expect(line).toContain("Marco Island");
  expect(line).toContain("SB 4-D");
});
