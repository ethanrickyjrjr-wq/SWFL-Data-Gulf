import { test, expect } from "bun:test";
import { loadWinsReport, type WinsDeps } from "./load-report";
import type { MarketSnapshot } from "../should-i-sell/load-market-snapshot";

// Full injected deps — the loader never touches the network in tests. The subject row is
// the raw listing_dom shape the default fetch returns; checks receive the mapped inputs.
const SUBJECT_KEY_Q = "15756 Modena St, Naples, FL 34114";

const snapshot: MarketSnapshot = {
  zip: "34114",
  place: "Naples",
  housing: {
    monthsOfSupply: 7,
    medianDom: 71,
    saleToListPct: 96.4,
    source: {
      label: "Redfin Data Center",
      url: "https://www.redfin.com/news/data-center/",
      asOf: "03/01/2026",
    },
  },
  momentum: {
    priceCutSharePct: 31.2,
    source: { label: "SWFL for-sale listing momentum", url: "", asOf: "07/25/2026" },
  },
};

const fullDeps = (): WinsDeps => ({
  geocode: async () => ({ lat: 26.0, lon: -81.6, zip: "34114", place: "Naples" }) as never,
  fetchSubject: async () => ({
    address_key: "15756MODENAST:34114",
    street_address: "15756 Modena St",
    city: "Naples",
    county: "Collier",
    zip_code: "34114",
    list_price: 819000,
    sqft: 2100,
    status: "for_sale",
    state: "active",
    sale_or_rent: "sale",
    dom_days: 212,
    dom_is_floor: false,
    cdom_days: 240,
    listed_date: "2025-12-19",
    property_id: "P1",
  }),
  heal: async () => {},
  fetchZipMedian: async () => ({ median_dom: 102, sample_size: 900 }),
  fetchBands: async () => [
    { band: 3, price_lo: 550000, price_hi: 900000, median_dom: 120, sample_size: 40 },
  ],
  fetchStale: async () => ({ active_count: 200, exact_count: 100, over_90: 45, over_180: 12 }),
  fetchPricePosition: async () => ({
    price_pctile: 91,
    ppsf_pctile: 88,
    price_n: 200,
    ppsf_n: 180,
  }),
  loadSnapshot: async () => snapshot,
  fetchHeat: async () => ({ medianDom: 74, asOf: "06/30/2026" }),
  loadCuts: async () => [{ at: "2026-03-01", price: 850000, delta: -31000 }],
  loadParcel: async () => ({
    salePrice: 610000,
    saleYear: 2021,
    saleMonth: 6,
    yearBuilt: 1998,
    livingAreaSqft: 2100,
    county: "Collier",
  }),
  loadZhvi: async () => ({ pctChange: 14, fromMdy: "06/2021", asOf: "06/30/2026" }),
  loadRelist: async () => null,
  now: new Date("2026-07-25T12:00:00Z"),
});

test("address hit → home report with all seven checks present", async () => {
  const r = await loadWinsReport(SUBJECT_KEY_Q, fullDeps());
  expect(r).not.toBeNull();
  expect(r!.kind).toBe("home");
  expect(r!.subjectMiss).toBe(false);
  expect(r!.subject?.display).toBe("15756 Modena St");
  const ids = r!.checks.map((c) => c.id);
  expect(ids).toEqual([
    "market-speed",
    "cumulative-time",
    "price-cuts",
    "price-position",
    "anchor-gap",
    "competition",
    "cross-check",
  ]);
  expect(r!.areaFigures.length).toBeGreaterThan(0);
});

test("address miss → area read with subjectMiss true, area checks only", async () => {
  const deps = { ...fullDeps(), fetchSubject: async () => null };
  const r = await loadWinsReport(SUBJECT_KEY_Q, deps);
  expect(r!.kind).toBe("area");
  expect(r!.subjectMiss).toBe(true);
  expect(r!.checks.every((c) => ["competition", "cross-check"].includes(c.id))).toBe(true);
});

test("bare ZIP → area read, subjectMiss false", async () => {
  const r = await loadWinsReport("34114", fullDeps());
  expect(r!.kind).toBe("area");
  expect(r!.subjectMiss).toBe(false);
});

test("out-of-scope ZIP → null (the route renders the plain ask)", async () => {
  const deps = {
    ...fullDeps(),
    geocode: async () => ({ lat: 0, lon: 0, zip: "32801", place: "Orlando" }) as never,
  };
  expect(await loadWinsReport("32801", deps)).toBeNull();
});

test("a throwing dep drops its check, never the report", async () => {
  const deps = {
    ...fullDeps(),
    loadParcel: async () => {
      throw new Error("lake down");
    },
  };
  const r = await loadWinsReport(SUBJECT_KEY_Q, deps);
  expect(r).not.toBeNull();
  expect(r!.checks.some((c) => c.id === "anchor-gap")).toBe(false);
  expect(r!.checks.some((c) => c.id === "market-speed")).toBe(true);
});

test("every rendered figure carries a source and an as-of", async () => {
  const r = await loadWinsReport(SUBJECT_KEY_Q, fullDeps());
  for (const c of r!.checks) {
    for (const f of c.figures) {
      expect(f.source.length).toBeGreaterThan(0);
      expect(f.asOf.length).toBeGreaterThan(0);
    }
  }
});
