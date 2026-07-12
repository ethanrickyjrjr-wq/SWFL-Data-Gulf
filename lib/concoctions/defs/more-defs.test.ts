import { describe, it, expect } from "bun:test";
import { zipListingActivity } from "./zip-listing-activity";
import { nfipStormYears } from "./nfip-storm-years";
import { askingPriceTrend } from "./asking-price-trend";
import { evaluateGuards } from "../guards";
import { stubSb } from "./test-stub";

describe("zipListingActivity", () => {
  const FIXTURE = [
    {
      county: null,
      zip_code: null,
      new_listings_90d: 1612,
      price_cuts_90d: 1996,
      sales_90d: 91,
      latest_at: "2026-07-11T00:00:00Z",
    },
    {
      county: "Lee",
      zip_code: null,
      new_listings_90d: 1183,
      price_cuts_90d: 1519,
      sales_90d: 38,
      latest_at: "2026-07-11T00:00:00Z",
    },
    {
      county: "Lee",
      zip_code: "33914",
      new_listings_90d: 92,
      price_cuts_90d: 120,
      sales_90d: 3,
      latest_at: "2026-07-11T00:00:00Z",
    },
    {
      county: "Lee",
      zip_code: "33904",
      new_listings_90d: 61,
      price_cuts_90d: 75,
      sales_90d: 0,
      latest_at: "2026-07-11T00:00:00Z",
    },
    {
      county: "Collier",
      zip_code: "34112",
      new_listings_90d: 45,
      price_cuts_90d: 51,
      sales_90d: 1,
      latest_at: "2026-07-11T00:00:00Z",
    },
    {
      county: "Collier",
      zip_code: "34102",
      new_listings_90d: 38,
      price_cuts_90d: 44,
      sales_90d: 0,
      latest_at: "2026-07-11T00:00:00Z",
    },
    {
      county: "Lee",
      zip_code: "33908",
      new_listings_90d: 77,
      price_cuts_90d: 95,
      sales_90d: 2,
      latest_at: "2026-07-11T00:00:00Z",
    },
    {
      county: "Hendry",
      zip_code: "33935",
      new_listings_90d: 21,
      price_cuts_90d: 30,
      sales_90d: 1,
      latest_at: "2026-07-11T00:00:00Z",
    },
  ];
  it("load returns ONLY per-ZIP rows — county rollups and the SWFL total row are filtered in code", async () => {
    const capture: Record<string, unknown> = {};
    const rows = await zipListingActivity.load(stubSb(FIXTURE, capture), {});
    expect(capture.schema).toBe("data_lake");
    expect(capture.table).toBe("listing_transitions_recent_zip_stats");
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.zip_code !== null && r.county !== null)).toBe(true);
  });
  it("county param narrows", async () => {
    const rows = await zipListingActivity.load(stubSb(FIXTURE), { county: "Lee" });
    expect(rows).toHaveLength(3);
  });
  it("sales_90d is FENCED (thin at ZIP grain, probed 07/12/2026)", () => {
    const col = zipListingActivity.columns.find((c) => c.key === "sales_90d")!;
    const zipRows = FIXTURE.filter((r) => r.zip_code !== null);
    expect(evaluateGuards(zipRows as never, col).ok).toBe(false);
  });
  it("new_listings_90d passes on ZIP rows", () => {
    const col = zipListingActivity.columns.find((c) => c.key === "new_listings_90d")!;
    expect(evaluateGuards(FIXTURE.filter((r) => r.zip_code) as never, col).ok).toBe(true);
  });
  it("asOf from latest_at", () => {
    expect(zipListingActivity.asOf(FIXTURE as never)).toBe("07/11/2026");
  });
});

describe("nfipStormYears", () => {
  const FIXTURE = [
    { county_code: "12071", year: 2017, claim_count: 4200, paid_total_usd: 310000000 },
    { county_code: "12071", year: 2022, claim_count: 21000, paid_total_usd: 2100000000 },
    { county_code: "12071", year: 2024, claim_count: 9800, paid_total_usd: 780000000 },
  ];
  it("loads from data_lake.fema_nfip_county_year (NOT *_view)", async () => {
    const capture: Record<string, unknown> = {};
    await nfipStormYears.load(stubSb(FIXTURE, capture), {});
    expect(capture.schema).toBe("data_lake");
    expect(capture.table).toBe("fema_nfip_county_year");
  });
  it("countyCode param narrows in code", async () => {
    const rows = await nfipStormYears.load(
      stubSb([
        ...FIXTURE,
        { county_code: "12021", year: 2022, claim_count: 5000, paid_total_usd: 40000000 },
      ]),
      { countyCode: "12071" },
    );
    expect(rows).toHaveLength(3);
  });
  it("asOf = max year rendered 12/31/<year>", () => {
    expect(nfipStormYears.asOf(FIXTURE as never)).toBe("12/31/2024");
  });
});

describe("askingPriceTrend", () => {
  const FIXTURE = [
    {
      metric_key: "median_asking_price",
      area: "cape_coral",
      period: "2026-07-01",
      value: 389000,
      unit: "usd",
      source_title: "SWFL Data Gulf daily truth",
    },
    {
      metric_key: "median_asking_price",
      area: "cape_coral",
      period: "2026-07-05",
      value: null,
      unit: "usd",
      source_title: "SWFL Data Gulf daily truth",
    },
    {
      metric_key: "median_asking_price",
      area: "cape_coral",
      period: "2026-07-10",
      value: 391500,
      unit: "usd",
      source_title: "SWFL Data Gulf daily truth",
    },
  ];
  it("requires area; reads median_asking_price (median_sale_price RETIRED 07/12/2026 — all-NULL)", async () => {
    const capture: Record<string, unknown> = {};
    const rows = await askingPriceTrend.load(stubSb(FIXTURE, capture), { area: "cape_coral" });
    expect(capture["eq:metric_key"]).toBe("median_asking_price");
    expect(capture["eq:area"]).toBe("cape_coral");
    // null-value row dropped in code (desk pattern)
    expect(rows).toHaveLength(2);
  });
  it("value column guards against all-null (maxNullShare)", () => {
    const col = askingPriceTrend.columns.find((c) => c.key === "value")!;
    const allNull = FIXTURE.map((r) => ({ ...r, value: null }));
    expect(evaluateGuards(allNull as never, col).ok).toBe(false);
  });
  it("asOf = max period", () => {
    expect(askingPriceTrend.asOf(FIXTURE as never)).toBe("07/10/2026");
  });
});
