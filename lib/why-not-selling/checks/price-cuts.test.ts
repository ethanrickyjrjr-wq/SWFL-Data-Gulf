import { test, expect } from "bun:test";
import { priceCuts } from "./price-cuts";
import type { CutEvent, SubjectHome } from "../types";

const subject = (over: Partial<SubjectHome> = {}): SubjectHome => ({
  addressKey: "K:33904",
  display: "123 SE 10th Pl",
  zip: "33904",
  city: "Cape Coral",
  county: "Lee",
  listPrice: 575000,
  sqft: 1800,
  domDays: 210,
  domIsFloor: false,
  cdomDays: 210,
  listedDate: "2025-12-20",
  propertyId: "9",
  status: "for_sale",
  ...over,
});

const cut = (at: string, price: number, delta: number): CutEvent => ({ at, price, delta });
const share = { pct: 18, source: "SWFL Data Gulf", asOf: "07/19/2026" };

test("speed-flagged with zero cuts flags: the price has not moved", () => {
  const r = priceCuts(subject(), [], share, true);
  expect(r.status).toBe("flag");
  expect(r.headline).toContain("price has not moved");
});

test("zero cuts but not speed-flagged stays clear (flag needs both)", () => {
  expect(priceCuts(subject(), [], share, false).status).toBe("clear");
});

test("two cuts render clear, one figure per cut plus the ZIP cut-share figure", () => {
  const cuts = [cut("2026-03-01", 585000, -15000), cut("2026-05-01", 575000, -10000)];
  const r = priceCuts(subject(), cuts, share, true);
  expect(r.status).toBe("clear");
  expect(r.figures.some((f) => f.value === "$15,000 on 03/01/2026")).toBe(true);
  expect(r.figures.some((f) => f.value === "$10,000 on 05/01/2026")).toBe(true);
  expect(r.figures.some((f) => f.value === "18%")).toBe(true);
});

test("no subject price is unavailable, empty figures", () => {
  const r = priceCuts(subject({ listPrice: null }), [], share, true);
  expect(r.status).toBe("unavailable");
  expect(r.headline).toBeNull();
  expect(r.figures.length).toBe(0);
});
