import { describe, test, expect, mock, beforeEach } from "bun:test";
import { quantileT } from "./home-map-types";

/**
 * Loader tests — mocked db per house pattern. Contracts under test:
 *  - happy path: three live views → three live metrics, computed bounds,
 *    live badge, stats cells
 *  - partial failure: a failed value/flood query serves the FIXTURE with
 *    sample:true and the sample badge (page never blanks)
 *  - activity failure: pill simply absent (no fixture by design)
 *  - NFIP window constant mirrors the refinery's AAL_WINDOW_YEARS
 */

type TableResult = { data: unknown[] | null; error: { message: string } | null };
const tables: Record<string, TableResult> = {};

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClientUntyped: () => ({
    schema: (_s: string) => ({
      from: (table: string) => ({
        select: (_cols: string) =>
          Promise.resolve(tables[table] ?? { data: null, error: { message: "no such table" } }),
      }),
    }),
  }),
}));

const { loadHomeMapData, NFIP_WINDOW_YEARS } = await import("./load-home-map-data");

const ZHVI = [
  { zip_code: "33901", home_value_latest: 285000, latest_period: "2026-04-30", city: null },
  { zip_code: "34102", home_value_latest: 985000, latest_period: "2026-04-30", city: null },
  { zip_code: "34108", home_value_latest: 1250000, latest_period: "2026-04-30", city: null },
  { zip_code: "99999", home_value_latest: 111111, latest_period: "2026-04-30", city: null }, // off-map: dropped
];
const LISTINGS = [
  {
    zip_code: "33901",
    county: "Lee",
    listing_count: 30,
    median_list_price: 552500,
    avg_days_on_market: 157,
    latest_scraped_at: "2026-07-02T00:00:00Z",
  },
  {
    zip_code: "34102",
    county: "Collier",
    listing_count: 120,
    median_list_price: 900000,
    avg_days_on_market: 90,
    latest_scraped_at: "2026-07-02T00:00:00Z",
  },
];
const NFIP = [
  {
    zip: "33901",
    paid_total_in_window_usd: 1000000,
    claim_count_in_window: 10,
    window_end_year: 2026,
  },
  {
    zip: "34102",
    paid_total_in_window_usd: 338413256,
    claim_count_in_window: 2872,
    window_end_year: 2026,
  },
];

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables["zhvi_zip_latest"] = { data: ZHVI, error: null };
  tables["active_listings_residential_zip_stats"] = { data: LISTINGS, error: null };
  tables["fema_nfip_zip_window_agg"] = { data: NFIP, error: null };
});

describe("loadHomeMapData", () => {
  test("happy path: live metrics, computed bounds, live badge, stats", async () => {
    const p = await loadHomeMapData();
    expect(p.anySample).toBe(false);
    expect(p.badge).toContain("Live data");
    expect(p.badge).toContain("07/02/2026");

    const value = p.data.metrics.value!;
    expect(value.sample).toBeUndefined();
    expect(value.low).toBe(285000);
    expect(value.high).toBe(1250000);
    expect(value.data["99999"]).toBeUndefined(); // off-map row dropped
    expect(value.asOf).toBe("04/30/2026");

    const activity = p.data.metrics.activity!;
    expect(activity.label).toBe("Market Activity");
    expect(activity.data["34102"]).toBe(120);

    const flood = p.data.metrics.flood!;
    expect(flood.sublabel).toContain(`${2026 - NFIP_WINDOW_YEARS + 1}–2026`);
    expect(flood.sublabel).not.toContain("per property"); // not derivable from the view

    const labels = p.stats.map((s) => s.label);
    expect(labels).toContain("Active Listings");
    expect(labels).toContain("Highest Home Value");
    const total = p.stats.find((s) => s.label === "Active Listings")!;
    expect(total.value).toBe("150");
  });

  test("value query fails → fixture fallback with sample:true + sample badge", async () => {
    tables["zhvi_zip_latest"] = { data: null, error: { message: "boom" } };
    const p = await loadHomeMapData();
    expect(p.data.metrics.value!.sample).toBe(true);
    expect(p.anySample).toBe(true);
    expect(p.badge).toContain("Sample data");
    // No live value rows → no value-derived stat cells (never mock stats).
    expect(p.stats.map((s) => s.label)).not.toContain("Highest Home Value");
  });

  test("activity query fails → pill absent, no listing stats, page stays live", async () => {
    tables["active_listings_residential_zip_stats"] = { data: null, error: { message: "boom" } };
    const p = await loadHomeMapData();
    expect(p.data.metrics.activity).toBeUndefined();
    expect(p.stats.map((s) => s.label)).not.toContain("Active Listings");
    expect(p.data.metrics.value!.sample).toBeUndefined();
  });

  test("empty result sets → fixture fallback, never empty metrics", async () => {
    tables["zhvi_zip_latest"] = { data: [], error: null };
    tables["fema_nfip_zip_window_agg"] = { data: [], error: null };
    const p = await loadHomeMapData();
    expect(p.data.metrics.value!.sample).toBe(true);
    expect(p.data.metrics.flood!.sample).toBe(true);
    expect(Object.keys(p.data.metrics.value!.data).length).toBeGreaterThan(40);
  });

  test("NFIP window mirrors the refinery constant the view is built on", async () => {
    const { AAL_WINDOW_YEARS } = await import("@/refinery/sources/fema-nfip-source.mts");
    expect(NFIP_WINDOW_YEARS).toBe(AAL_WINDOW_YEARS);
  });
});

describe("quantileT (rank-based color positions)", () => {
  test("skewed data spreads across the full ramp instead of collapsing to c0", () => {
    // 9 low values + 1 huge outlier — linear t would put the 9 at ~0.
    const data: Record<string, number> = {
      a: 600,
      b: 650,
      c: 700,
      d: 750,
      e: 800,
      f: 850,
      g: 900,
      h: 950,
      i: 1000,
      j: 30000,
    };
    const t = quantileT(data);
    expect(t["a"]).toBe(0);
    expect(t["j"]).toBe(1);
    expect(t["e"]).toBeCloseTo(4 / 9);
  });

  test("ties share the average rank", () => {
    const t = quantileT({ a: 1, b: 2, c: 2, d: 3 });
    expect(t["b"]).toBeCloseTo(t["c"]);
    expect(t["b"]).toBeCloseTo(1.5 / 3);
  });

  test("degenerate cases", () => {
    expect(quantileT({})).toEqual({});
    expect(quantileT({ only: 5 })).toEqual({ only: 0.5 });
  });
});
