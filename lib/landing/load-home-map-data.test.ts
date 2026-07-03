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

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables["zhvi_zip_latest"] = { data: ZHVI, error: null };
  tables["active_listings_residential_zip_stats"] = { data: LISTINGS, error: null };
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
    // Operator ruling 07/03/2026: Home Value is the first map and wears the
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

  test("listing query fails → activity AND dom pills absent, page stays live", async () => {
    tables["active_listings_residential_zip_stats"] = { data: null, error: { message: "boom" } };
    const p = await loadHomeMapData();
    expect(p.data.metrics.activity).toBeUndefined();
    expect(p.data.metrics.dom).toBeUndefined();
    expect(p.stats.map((s) => s.label)).not.toContain("Active Listings");
    expect(p.data.metrics.value!.sample).toBeUndefined();
  });

  test("empty result sets → fixture fallback, never empty metrics", async () => {
    tables["zhvi_zip_latest"] = { data: [], error: null };
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
