import { test, expect } from "bun:test";
import { competition } from "./competition";
import type { StaleShare } from "../types";
import type { MarketSnapshot } from "../../should-i-sell/load-market-snapshot";

const stale = (over: Partial<StaleShare> = {}): StaleShare => ({
  activeCount: 200,
  exactCount: 100,
  over90: 10,
  over180: 4,
  asOf: "07/25/2026",
  ...over,
});

const snapshot = (monthsOfSupply: number | null = 5): MarketSnapshot => ({
  zip: "33904",
  place: "Cape Coral",
  housing: {
    monthsOfSupply,
    medianDom: 71,
    saleToListPct: 96.4,
    source: {
      label: "Redfin Data Center",
      url: "https://www.redfin.com/news/data-center/",
      asOf: "03/01/2026",
    },
  },
  momentum: null,
});

test("flags when 40%+ of the exact-count book has sat 90+ days", () => {
  const r = competition(stale({ over90: 45 }), snapshot(), "33904");
  expect(r.status).toBe("flag");
  expect(r.figures.some((f) => f.value.includes("45"))).toBe(true);
});

test("flags on months of supply alone (sold-side glut)", () => {
  const r = competition(stale(), snapshot(10), "33904");
  expect(r.status).toBe("flag");
});

test("clear when the book is moving and supply is normal", () => {
  const r = competition(stale(), snapshot(), "33904");
  expect(r.status).toBe("clear");
  expect(r.figures.some((f) => f.label.includes("Active listings"))).toBe(true);
});

test("sold-side figures carry the snapshot's own source label, marked as SOLD", () => {
  const r = competition(stale(), snapshot(), "33904");
  const sold = r.figures.filter((f) => f.source === "Redfin Data Center");
  expect(sold.length).toBeGreaterThan(0);
  expect(sold.every((f) => /SOLD|supply/i.test(f.label))).toBe(true);
});

test("snapshot-only (stale null) still renders the sold-side read", () => {
  const r = competition(null, snapshot(), "33904");
  expect(r.status).toBe("clear");
  expect(r.figures.some((f) => f.source === "Redfin Data Center")).toBe(true);
  expect(r.figures.some((f) => f.source === "SWFL Data Gulf")).toBe(false);
});

test("stale ratio needs the exact-count floor — a thin book cannot flag", () => {
  const r = competition(stale({ exactCount: 5, over90: 4 }), snapshot(), "33904");
  expect(r.status).toBe("clear");
});

test("unavailable when both sides are missing", () => {
  const r = competition(null, null, "33904");
  expect(r.status).toBe("unavailable");
  expect(r.figures.length).toBe(0);
});
