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
  rows["listing_transitions_recent_zip_stats"] = {
    price_cuts_30d: 41,
    price_raises_30d: 3,
    new_holdings_30d: 7,
    sales_30d: 12,
    new_listings_30d: 28,
    price_cuts_90d: 90,
    price_raises_90d: 9,
    new_holdings_90d: 20,
    sales_90d: 40,
    new_listings_90d: 80,
    latest_at: "2026-07-02T00:00:00Z",
    sales_price_pending_30d: 0,
    sales_price_pending_90d: 0,
  };
  rows["census_acs_zcta"] = {
    acs_year: 2023,
    total_population: 43283,
    median_household_income: 72662,
    median_age: 48.1,
    owner_occupied_pct: 78,
    moved_in_past_year_pct: 11,
    poverty_rate: 9,
    employment_rate: 55,
    avg_household_size: 2.4,
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

  test("cutout image block rides right after the hero", async () => {
    const doc = await buildZipSeedDoc("33914");
    const types = doc!.blocks.map((b) => b.type);
    expect(types.indexOf("image")).toBe(types.indexOf("hero") + 1);
    const img = doc!.blocks.find((b) => b.type === "image")!.props as {
      url: string;
      alt: string;
      caption: string;
    };
    expect(img.url).toBe("https://www.swfldatagulf.com/api/zip-shape/33914");
    expect(img.alt).toContain("Cape Coral");
  });

  test("market motion signal composes from live transition counts", async () => {
    const doc = await buildZipSeedDoc("33914");
    const signal = doc!.blocks.find((b) => b.type === "signal")!.props as {
      kicker: string;
      title: string;
      body: string;
    };
    expect(signal.title).toContain("last 30 days");
    expect(signal.body).toContain("41 price cuts");
    expect(signal.body).toContain("28 new listings");
    expect(signal.kicker).toContain("SWFL Data Gulf");
  });

  test("2022 census vintage: at most ONE line (income) ships — the rest is dropped", async () => {
    const doc = await buildZipSeedDoc("33914");
    const all = JSON.stringify(doc!.blocks);
    expect(all).toContain("$72,662"); // median income — the one census mention
    expect(all).not.toContain("43,283"); // population dropped
    expect(all).not.toContain("Who lives here"); // demographics section dead
    expect(all).not.toContain("Owner-occupied");
  });

  test("lifecycle/summary failures degrade to the base doc, never block", async () => {
    rows["listing_transitions_recent_zip_stats"] = null;
    rows["census_acs_zcta"] = null;
    const doc = await buildZipSeedDoc("33914");
    expect(doc).not.toBeNull();
    const types = doc!.blocks.map((b) => b.type);
    expect(types).not.toContain("signal");
    expect(types).toContain("hero");
    expect(types).toContain("image"); // the cutout needs no db
  });

  test("no rows anywhere → null (caller opens unseeded)", async () => {
    for (const k of Object.keys(rows)) rows[k] = null;
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
