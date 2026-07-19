import { test, expect } from "bun:test";
import { pricePosition } from "./price-position";
import type { PricePosition, SubjectHome } from "../types";

const subject = (over: Partial<SubjectHome> = {}): SubjectHome => ({
  addressKey: "K:33904",
  display: "123 SE 10th Pl",
  zip: "33904",
  city: "Cape Coral",
  county: "Lee",
  listPrice: 620000,
  sqft: 1800,
  domDays: 90,
  domIsFloor: false,
  cdomDays: 90,
  listedDate: "2026-04-01",
  propertyId: "9",
  status: "for_sale",
  ...over,
});

const pos = (over: Partial<PricePosition> = {}): PricePosition => ({
  pricePctile: 91,
  ppsfPctile: null,
  priceN: 40,
  ppsfN: 0,
  ...over,
});

const asOf = "07/19/2026";

test("high price percentile with a real sample flags above the market", () => {
  const r = pricePosition(subject(), pos({ pricePctile: 91, priceN: 40 }), asOf);
  expect(r.status).toBe("flag");
  expect(r.headline).toContain("priced above 91% of active listings in 33904");
});

test("mid percentile stays clear", () => {
  expect(pricePosition(subject(), pos({ pricePctile: 55 }), asOf).status).toBe("clear");
});

test("null position or a thin sample is unavailable", () => {
  expect(pricePosition(subject(), null, asOf).status).toBe("unavailable");
  expect(pricePosition(subject(), pos({ priceN: 6 }), asOf).status).toBe("unavailable");
});

test("$/sqft percentile figure renders only with sample >= 10 and subject sqft", () => {
  const withPpsf = pricePosition(subject(), pos({ ppsfPctile: 84, ppsfN: 22 }), asOf);
  expect(withPpsf.figures.some((f) => /sq ft/i.test(f.label))).toBe(true);
  const thinPpsf = pricePosition(subject(), pos({ ppsfPctile: 84, ppsfN: 4 }), asOf);
  expect(thinPpsf.figures.some((f) => /sq ft/i.test(f.label))).toBe(false);
  const noSqft = pricePosition(subject({ sqft: null }), pos({ ppsfPctile: 84, ppsfN: 22 }), asOf);
  expect(noSqft.figures.some((f) => /sq ft/i.test(f.label))).toBe(false);
});
