import { test, expect } from "bun:test";
import { marketSpeed } from "./market-speed";
import { formatDom } from "../../listings/dom";
import type { SubjectHome, ZipDomMedian, BandRow } from "../types";

const subject = (over: Partial<SubjectHome> = {}): SubjectHome => ({
  addressKey: "15756MODENAST:34114",
  display: "15756 Modena St",
  zip: "34114",
  city: "Naples",
  county: "Collier",
  listPrice: 600000,
  sqft: 2000,
  domDays: 212,
  domIsFloor: false,
  cdomDays: 212,
  listedDate: "2025-12-19",
  propertyId: "1",
  status: "for_sale",
  ...over,
});
const median: ZipDomMedian = { medianDom: 102, sampleSize: 900, asOf: "07/19/2026" };
const bands: BandRow[] = [
  { band: 3, priceLo: 550000, priceHi: 700000, medianDom: 120, sampleSize: 40 },
];

test("flags a home sitting 1.5x the ZIP typical; headline uses formatDom wording", () => {
  const r = marketSpeed(subject(), median, bands);
  expect(r.status).toBe("flag");
  expect(r.headline).toContain(formatDom({ domDays: 212, isFloor: false })!);
  expect(r.figures.some((f) => f.value.includes("102"))).toBe(true);
});

test("clear when at/below typical", () => {
  expect(marketSpeed(subject({ domDays: 60, cdomDays: 60 }), median, bands).status).toBe("clear");
});

test("unavailable when the ZIP sample is under the floor", () => {
  const r = marketSpeed(subject(), { ...median, sampleSize: 3 }, null);
  expect(r.status).toBe("unavailable");
  expect(r.figures.length).toBe(0);
});

test("floored subject renders the honest floor phrase", () => {
  const r = marketSpeed(subject({ domIsFloor: true }), median, bands);
  expect(r.headline).toContain("212+");
});
