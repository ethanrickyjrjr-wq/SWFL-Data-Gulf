import { describe, test, expect, mock, beforeEach } from "bun:test";
import { blendedT, quantileT } from "./home-map-types";

/**
 * Loader tests — mocked db per house pattern. Contracts under test:
 *  - happy path: live views → value/activity/dom metrics, computed bounds,
 *    live badge, stats cells, Home Value wearing the orange brand ramp
 *  - value failure: FIXTURE with sample:true + the sample badge (never blanks)
 *  - listing failure: activity + dom pills absent (no fixture by design)
 *  - color positions: rank spread + magnitude blend behave
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

const { loadHomeMapData } = await import("./load-home-map-data");

// Market Activity ← listing_active_stats (active inventory, full Lee+Collier).
// The null-zip county-rollup row must be DROPPED by the loader's zip_code gate —
// its 7,673 must never leak into the "Active Listings" total (stays 30+120=150).
const ACTIVITY = [
  {
    zip_code: "33901",
    county: "Lee",
    listing_count: 30,
    median_list_price: 552500,
    latest_scraped_at: "2026-07-02T00:00:00Z",
  },
  {
    zip_code: "34102",
    county: "Collier",
    listing_count: 120,
    median_list_price: 900000,
    latest_scraped_at: "2026-07-02T00:00:00Z",
  },
  {
    zip_code: null,
    county: "Collier",
    listing_count: 7673,
    median_list_price: 615000,
    latest_scraped_at: "2026-07-02T00:00:00Z",
  },
];
// Median Sold Price AND Days on Market both ← market_details_swfl_latest
// (realtor.com per-ZIP monthly) — ONE shared root since 07/18/2026 (the ZHVI
// index left user surfaces), so one table failure takes both layers down.
// Sold medians are the live-verified 07/18/2026 values for these ZIPs.
const MARKET_DETAILS = [
  {
    zip_code: "33901",
    county: "Lee",
    median_sold_price: 320000,
    median_days_on_market: 157,
    captured_date: "2026-07-02",
  },
  {
    zip_code: "34102",
    county: "Collier",
    median_sold_price: 1650000,
    median_days_on_market: 90,
    captured_date: "2026-07-02",
  },
  {
    zip_code: "99999",
    county: "Lee",
    median_sold_price: 111111,
    median_days_on_market: 10,
    captured_date: "2026-07-02",
  }, // off-map: dropped
];

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables["listing_active_stats"] = { data: ACTIVITY, error: null };
  tables["market_details_swfl_latest"] = { data: MARKET_DETAILS, error: null };
});

describe("loadHomeMapData", () => {
  test("happy path: live metrics, computed bounds, live badge, stats", async () => {
    const p = await loadHomeMapData();
    expect(p.anySample).toBe(false);
    expect(p.badge).toContain("Live data");
    expect(p.badge).toContain("07/02/2026");

    const value = p.data.metrics.value!;
    expect(value.sample).toBeUndefined();
    expect(value.label).toBe("Median Sold Price");
    expect(value.low).toBe(320000);
    expect(value.high).toBe(1650000);
    expect(value.data["99999"]).toBeUndefined(); // off-map row dropped
    expect(value.asOf).toBe("07/02/2026");
    // Operator ruling 07/03/2026: the value layer is the first map and wears the
    // orange brand ramp — dark slate base, gold→coral top.
    expect([value.c0, value.c1, value.c2]).toEqual(["#33525e", "#d4b370", "#e08158"]);

    const activity = p.data.metrics.activity!;
    expect(activity.label).toBe("Market Activity");
    expect(activity.data["34102"]).toBe(120);

    const dom = p.data.metrics.dom!;
    expect(dom.label).toBe("Days on Market");
    expect(dom.data["33901"]).toBe(157);
    expect(dom.asOf).toBe("07/02/2026");

    const labels = p.stats.map((s) => s.label);
    expect(labels).toContain("Active Listings");
    expect(labels).toContain("Highest Median Sold");
    const total = p.stats.find((s) => s.label === "Active Listings")!;
    expect(total.value).toBe("150");
  });

  test("shared-root query fails → value fixture fallback + dom absent (one table, one failure)", async () => {
    tables["market_details_swfl_latest"] = { data: null, error: { message: "boom" } };
    const p = await loadHomeMapData();
    expect(p.data.metrics.value!.sample).toBe(true);
    expect(p.data.metrics.dom).toBeUndefined();
    expect(p.anySample).toBe(true);
    expect(p.badge).toContain("Sample data");
    // No live value rows → no value-derived stat cells (never mock stats).
    expect(p.stats.map((s) => s.label)).not.toContain("Highest Median Sold");
  });

  test("activity query fails → activity pill absent, page stays live", async () => {
    tables["listing_active_stats"] = { data: null, error: { message: "boom" } };
    const p = await loadHomeMapData();
    expect(p.data.metrics.activity).toBeUndefined();
    expect(p.stats.map((s) => s.label)).not.toContain("Active Listings");
    expect(p.data.metrics.value!.sample).toBeUndefined();
  });

  test("empty result sets → fixture fallback, never empty metrics", async () => {
    tables["market_details_swfl_latest"] = { data: [], error: null };
    const p = await loadHomeMapData();
    expect(p.data.metrics.value!.sample).toBe(true);
    expect(Object.keys(p.data.metrics.value!.data).length).toBeGreaterThan(40);
  });
});

describe("quantileT (rank positions)", () => {
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

describe("blendedT (rank + magnitude — decisive gaps pop)", () => {
  test("a decisive outlier separates from its rank-neighbor; near-ties compress", () => {
    const data: Record<string, number> = { a: 100, b: 110, c: 120, d: 10000 };
    const rank = quantileT(data);
    const blend = blendedT(data);
    // Under pure rank, c→d is one forced step; the blend widens a decisive gap.
    expect(blend["d"] - blend["c"]).toBeGreaterThan(rank["d"] - rank["c"] - 1e-9);
    // Near-ties compress: a→b closer under blend than the forced rank step.
    expect(blend["b"] - blend["a"]).toBeLessThan(rank["b"] - rank["a"]);
    // Endpoints hold.
    expect(blend["a"]).toBeCloseTo(0);
    expect(blend["d"]).toBeCloseTo(1);
  });

  test("empty input", () => {
    expect(blendedT({})).toEqual({});
  });
});
