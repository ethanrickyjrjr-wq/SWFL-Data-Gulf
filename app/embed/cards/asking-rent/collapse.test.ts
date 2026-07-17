// The 07/13 grain incident as law, embed-card edition: submarket-stamped
// corridor rows must collapse to ONE entry per submarket before any ranking,
// and unmapped rows (no submarket = no named source) drop out entirely.
import { expect, test } from "bun:test";
import { collapseToSubmarkets } from "./collapse";

const STAMPED = [
  // Naples: three corridors, identical stamped figure — the crowning bug's shape.
  { submarket: "Naples", value: 60.84 },
  { submarket: "Naples", value: 60.84 },
  { submarket: "Naples", value: 60.84 },
  { submarket: "Cape Coral", value: 23.09 },
  { submarket: "Cape Coral", value: 23.09 },
  { submarket: "Lehigh Acres", value: 35.08 },
  // Unmapped — a figure with no named source; must not render anywhere.
  { submarket: null, value: 39.2 },
  { submarket: "Estero", value: null },
];

test("one entry per submarket, ranked desc, stamped duplicates never weight the list", () => {
  const out = collapseToSubmarkets(STAMPED);
  expect(out.map((s) => s.submarket)).toEqual(["Naples", "Lehigh Acres", "Cape Coral"]);
  expect(out.map((s) => s.value)).toEqual([60.84, 35.08, 23.09]);
  expect(out.find((s) => s.submarket === "Naples")?.corridors).toBe(3);
});

test("null-submarket and null-value rows drop out", () => {
  const out = collapseToSubmarkets(STAMPED);
  expect(out.some((s) => s.value === 39.2)).toBe(false);
  expect(out.some((s) => s.submarket === "Estero")).toBe(false);
});

test("degraded inputs with differing values inside a submarket take the median, not a crown", () => {
  const out = collapseToSubmarkets([
    { submarket: "Naples", value: 60.84 },
    { submarket: "Naples", value: 45.88 },
    { submarket: "Naples", value: 52.0 },
  ]);
  expect(out).toHaveLength(1);
  expect(out[0].value).toBe(52.0);
});
