import { describe, test, expect, mock, beforeEach } from "bun:test";

/**
 * ZIP email prebuild tests (spec: 2026-07-03-lab-first-funnel-landing-design.md).
 * The db is mocked at the service-role seam (market-context's chain:
 * .schema().from().select().eq().maybeSingle()). Contracts:
 *  - known ZIP → deterministic doc: hero carries the live value verbatim,
 *    stats/list rows cite source + as-of, report button links the ZIP report
 *  - unknown ZIP / no figures / no creds → null (caller opens unseeded)
 *  - prose carries NO digits (no invented numbers — figures ride blocks only)
 */

type Row = Record<string, unknown> | null;
const rows: Record<string, Row> = {};

function chain(table: string) {
  return {
    select: (_c: string) => chain(table),
    eq: (_k: string, _v: string) => chain(table),
    maybeSingle: () => Promise.resolve({ data: rows[table] ?? null, error: null }),
  };
}

mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClientUntyped: () => ({
    schema: (_s: string) => ({ from: (table: string) => chain(table) }),
  }),
}));

const { buildZipSeedDoc } = await import("./zip-seed");

beforeEach(() => {
  for (const k of Object.keys(rows)) delete rows[k];
  rows["zhvi_zip_latest"] = {
    home_value_latest: 421000,
    value_yoy_pct: -2.1,
    latest_period: "2026-05-31",
    city: "Cape Coral",
    county_name: "Lee County",
  };
  rows["listing_active_stats"] = {
    listing_count: 154,
    median_list_price: 399000,
    avg_days_on_market: 121,
    latest_scraped_at: "2026-07-02T00:00:00Z",
    county: "Lee",
  };
});

describe("buildZipSeedDoc", () => {
  test("known ZIP → deterministic doc with verbatim cited figures", async () => {
    const doc = await buildZipSeedDoc("33914");
    expect(doc).not.toBeNull();
    const types = doc!.blocks.map((b) => b.type);
    expect(types[0]).toBe("header");
    expect(types).toContain("hero");
    expect(types).toContain("stats");
    expect(types).toContain("button");
    expect(types.at(-1)).toBe("footer");

    const hero = doc!.blocks.find((b) => b.type === "hero")!.props as {
      kicker: string;
      value: string;
      label: string;
      prose: string;
    };
    expect(hero.kicker).toBe("This Week in Cape Coral");
    expect(hero.value).toBe("$421,000"); // verbatim from the figure, never re-derived
    expect(hero.label).toContain("Zillow ZHVI");
    expect(hero.label).toContain("05/31/2026"); // as-of stated MM/DD/YYYY
    expect(hero.prose).not.toMatch(/\d/); // prose carries NO numbers

    const stats = doc!.blocks.find((b) => b.type === "stats")!.props as {
      stats: { value: string; label: string }[];
    };
    const labels = stats.stats.map((s) => s.label);
    expect(labels).toContain("Active Listings");
    expect(stats.stats.find((s) => s.label === "Active Listings")!.value).toBe("154");

    const button = doc!.blocks.find((b) => b.type === "button")!.props as { url: string };
    expect(button.url).toBe("https://www.swfldatagulf.com/r/zip-report/33914");
  });

  test("no rows anywhere → null (caller opens unseeded)", async () => {
    rows["zhvi_zip_latest"] = null;
    rows["listing_active_stats"] = null;
    expect(await buildZipSeedDoc("33914")).toBeNull();
  });

  test("malformed ZIP → null without touching the db", async () => {
    expect(await buildZipSeedDoc("abc")).toBeNull();
    expect(await buildZipSeedDoc("1234")).toBeNull();
  });

  test("value missing but listings present → still seeds (median list leads)", async () => {
    rows["zhvi_zip_latest"] = null;
    const doc = await buildZipSeedDoc("33914");
    expect(doc).not.toBeNull();
    const hero = doc!.blocks.find((b) => b.type === "hero")!.props as { value: string };
    expect(hero.value).toBe("$399,000");
  });
});
