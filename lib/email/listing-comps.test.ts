import { test, expect } from "bun:test";
import { deriveAreaUrl, buildCompsSpec } from "./listing-comps";
import type { ListingFacts } from "./listing-scrape";

// ── deriveAreaUrl ─────────────────────────────────────────────────────────────

test("deriveAreaUrl: strips last path segment to get area page", () => {
  const url =
    "https://www.beach-homes.com/florida/bonita-springs/27804-hickory-blvd-bonita-springs-fl-34134-lhrmls-03646837";
  expect(deriveAreaUrl(url)).toBe("https://www.beach-homes.com/florida/bonita-springs");
});

test("deriveAreaUrl: handles trailing slash on listing URL", () => {
  const url = "https://www.johnrwood.com/listing/225043462/3412-atlantic-circle-naples-fl-34119/";
  expect(deriveAreaUrl(url)).toBe("https://www.johnrwood.com/listing/225043462");
});

test("deriveAreaUrl: returns null for single-segment path", () => {
  expect(deriveAreaUrl("https://example.com/only-one-segment")).toBeNull();
});

test("deriveAreaUrl: returns null for root path", () => {
  expect(deriveAreaUrl("https://example.com/")).toBeNull();
});

test("deriveAreaUrl: returns null for invalid URL", () => {
  expect(deriveAreaUrl("not-a-url")).toBeNull();
});

// ── buildCompsSpec ────────────────────────────────────────────────────────────

const SAMPLE_FACTS: ListingFacts = {
  address: "27804 Hickory Blvd, BONITA SPRINGS, FL 34134",
  city: "BONITA SPRINGS",
  state: "FL",
  zip: "34134",
  price: "$20,895,000",
  beds: "5",
  baths: "7",
  sqft: "7453",
  photos: [],
  sourceUrl: "https://www.beach-homes.com/florida/bonita-springs/27804-hickory-blvd-...",
};

const SAMPLE_COMPS = [
  { label: "27030 Hickory Blvd", price: 21_000_000 },
  { label: "27566 Hickory Blvd", price: 18_250_000 },
  { label: "27450 Hickory Blvd", price: 15_250_000 },
];

const AREA_URL = "https://www.beach-homes.com/florida/bonita-springs";

test("buildCompsSpec: returns a valid bar ChartSpec with subject first", () => {
  const spec = buildCompsSpec(SAMPLE_COMPS, SAMPLE_FACTS, AREA_URL, "2026-06-29");
  expect(spec).not.toBeNull();
  expect(spec!.value_format).toBe("usd");
  // Subject bar is first row
  expect(spec!.rows[0][0]).toContain("Subject");
  expect(spec!.rows[0][1]).toBe(20_895_000);
  // Total rows = 1 subject + 3 comps
  expect(spec!.rows.length).toBe(4);
});

test("buildCompsSpec: comps sorted price-desc after subject", () => {
  const spec = buildCompsSpec(SAMPLE_COMPS, SAMPLE_FACTS, AREA_URL, "2026-06-29");
  expect(spec!.rows[1][1]).toBe(21_000_000); // highest comp first
  expect(spec!.rows[2][1]).toBe(18_250_000);
  expect(spec!.rows[3][1]).toBe(15_250_000);
});

test("buildCompsSpec: carries correct asOf + source", () => {
  const spec = buildCompsSpec(SAMPLE_COMPS, SAMPLE_FACTS, AREA_URL, "2026-06-29");
  expect(spec!.asOf).toBe("2026-06-29");
  expect(spec!.source?.citation).toContain("beach-homes.com");
  expect(spec!.source?.url).toBe(AREA_URL);
});

test("buildCompsSpec: returns null with fewer than 2 comps", () => {
  expect(buildCompsSpec([SAMPLE_COMPS[0]], SAMPLE_FACTS, AREA_URL, "2026-06-29")).toBeNull();
  expect(buildCompsSpec([], SAMPLE_FACTS, AREA_URL, "2026-06-29")).toBeNull();
});

test("buildCompsSpec: returns null when subject has no price", () => {
  const noPrice: ListingFacts = { ...SAMPLE_FACTS, price: undefined };
  expect(buildCompsSpec(SAMPLE_COMPS, noPrice, AREA_URL, "2026-06-29")).toBeNull();
});
