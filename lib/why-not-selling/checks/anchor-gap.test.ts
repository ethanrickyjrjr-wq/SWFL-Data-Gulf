import { test, expect } from "bun:test";
import { anchorGap } from "./anchor-gap";
import type { ParcelFact, SubjectHome, ZhviChange } from "../types";

const subject = (over: Partial<SubjectHome> = {}): SubjectHome => ({
  addressKey: "15756MODENAST:34114",
  display: "15756 Modena St",
  zip: "34114",
  city: "Naples",
  county: "Collier",
  listPrice: 819000,
  sqft: 2100,
  domDays: 200,
  domIsFloor: false,
  cdomDays: 200,
  listedDate: "2025-12-19",
  propertyId: "1",
  status: "for_sale",
  ...over,
});
const parcel: ParcelFact = {
  salePrice: 610000,
  saleYear: 2021,
  saleMonth: 6,
  yearBuilt: 1998,
  livingAreaSqft: 2100,
  county: "Collier",
};
// (456000 - 400000) / 400000 = +14%
const zhvi: ZhviChange = { pctChange: 14, fromMdy: "06/2021", asOf: "06/30/2026" };

test("flags when the implied gain outruns ZHVI by >= 10 pts; all three figures present", () => {
  // ask 819000 vs paid 610000 => +34.26% implied; 34.26 - 14 = 20.26 >= 10 => flag
  const r = anchorGap(subject(), parcel, zhvi);
  expect(r.status).toBe("flag");
  expect(r.figures.length).toBe(3);
  expect(r.figures.some((f) => f.value.includes("610,000"))).toBe(true);
  expect(r.figures.some((f) => f.value.includes("14%"))).toBe(true);
  expect(r.figures.some((f) => f.value.includes("34%"))).toBe(true);
});

test("ZHVI figure is labelled 'typical home value' and never says 'median'", () => {
  const r = anchorGap(subject(), parcel, zhvi);
  const zhviFig = r.figures.find((f) => f.source.includes("ZHVI"));
  expect(zhviFig).toBeDefined();
  expect(zhviFig!.source).toBe("Zillow ZHVI (typical home value)");
  expect(r.figures.every((f) => !/median/i.test(f.label) && !/median/i.test(f.source))).toBe(true);
});

test("parcel purchase figure cites the county property records", () => {
  const r = anchorGap(subject(), parcel, zhvi);
  const paidFig = r.figures.find((f) => f.value.includes("610,000"));
  expect(paidFig!.source).toBe("Collier County property records");
});

test("clear when the implied gain is within 10 pts of ZHVI", () => {
  // ask 690000 vs paid 610000 => +13.1% implied; 13.1 - 14 = -0.9 < 10 => clear
  const r = anchorGap(subject({ listPrice: 690000 }), parcel, zhvi);
  expect(r.status).toBe("clear");
  expect(r.figures.length).toBe(3);
});

test("unavailable when ZHVI is missing", () => {
  const r = anchorGap(subject(), parcel, null);
  expect(r.status).toBe("unavailable");
  expect(r.figures.length).toBe(0);
});

test("unavailable when the parcel is missing", () => {
  const r = anchorGap(subject(), null, zhvi);
  expect(r.status).toBe("unavailable");
  expect(r.figures.length).toBe(0);
});
