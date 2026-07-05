import { describe, expect, test } from "bun:test";
import { loadAddressFigures } from "./address-context";
import type { CompDeps } from "@/lib/assistant/comp-helper";
import type { NearbyComp, SoldEvent } from "@/lib/listings/steadyapi";

const NOW = new Date("2026-07-05T12:00:00Z");

const comp = (over: Partial<NearbyComp>): NearbyComp => ({
  addressLine: "125 Main St",
  city: "Cape Coral",
  state: "FL",
  zip: "33904",
  beds: 3,
  baths: 2,
  sqft: 1800,
  lotSqft: null,
  status: "sold",
  listPrice: null,
  estimateValue: null,
  estimateDate: null,
  propertyId: null,
  ...over,
});

/** Deps that yield two comps: one enriched recorded sale, one AVM estimate. */
const happyDeps: CompDeps = {
  now: NOW,
  geocode: async () => ({
    lat: 26.56,
    lon: -81.95,
    matchedAddress: "123 Main St, Cape Coral",
    zip: "33904",
    county: "Lee",
    countyFips: "12071",
  }),
  fetchNearby: async () => [
    comp({ propertyId: "p1", listPrice: 450000 }),
    comp({
      addressLine: "130 Main St",
      propertyId: "p2",
      beds: 4,
      baths: 3,
      sqft: 2200,
      estimateValue: 512000,
      estimateDate: "2026-06-01",
    }),
  ],
  fetchSold: async (pid: string): Promise<SoldEvent | null> =>
    pid === "p1" ? { soldPrice: 462500, soldDate: "2026-05-20" } : null,
  enrichN: 1,
};

describe("loadAddressFigures", () => {
  test("comps become cited figures — honest price kinds, MM/DD/YYYY as-of", async () => {
    const figs = await loadAddressFigures("123 Main St, Cape Coral", happyDeps);
    expect(figs.length).toBe(2);
    const sold = figs.find((f) => f.label.includes("125 Main St"))!;
    expect(sold.value).toBe("$462,500");
    expect(sold.label.toLowerCase()).toContain("sold");
    expect(sold.as_of).toBe("05/20/2026");
    expect(sold.source).toBe("SWFL Data Gulf · realtor.com");
    const est = figs.find((f) => f.label.includes("130 Main St"))!;
    expect(est.value).toBe("$512,000");
    expect(est.label.toLowerCase()).toContain("estimate");
    expect(est.label.toLowerCase()).not.toContain("sold");
    expect(est.as_of).toBe("06/01/2026");
  });

  test("figure keys are stable comp_N and labels carry specs", async () => {
    const figs = await loadAddressFigures("123 Main St, Cape Coral", happyDeps);
    expect(figs.map((f) => f.key)).toEqual(["comp_1", "comp_2"]);
    expect(figs[0].label).toContain("3bd/2ba/1,800 sqft");
  });

  test("never surfaces the vendor or a property id", async () => {
    const figs = await loadAddressFigures("123 Main St, Cape Coral", happyDeps);
    const blob = JSON.stringify(figs).toLowerCase();
    expect(blob).not.toContain("steady");
    expect(blob).not.toContain('"p1"');
    expect(blob).not.toContain('"p2"');
  });

  test("a priceless comp is dropped, not surfaced empty", async () => {
    const figs = await loadAddressFigures("123 Main St, Cape Coral", {
      ...happyDeps,
      fetchNearby: async () => [comp({ listPrice: null })],
      fetchSold: async () => null,
    });
    expect(figs).toEqual([]);
  });

  test("empty-tolerant: no address / geocode miss / out-of-footprint / vendor error → []", async () => {
    expect(await loadAddressFigures(null, happyDeps)).toEqual([]);
    expect(await loadAddressFigures("   ", happyDeps)).toEqual([]);
    expect(
      await loadAddressFigures("nowhere", { ...happyDeps, geocode: async () => null }),
    ).toEqual([]);
    expect(
      await loadAddressFigures("1 Ocean Dr, Miami", {
        ...happyDeps,
        geocode: async () => ({
          lat: 25.77,
          lon: -80.13,
          matchedAddress: "1 Ocean Dr, Miami",
          zip: "33139",
          county: null,
          countyFips: null,
        }),
      }),
    ).toEqual([]);
    expect(
      await loadAddressFigures("123 Main St", {
        ...happyDeps,
        fetchNearby: async () => {
          throw new Error("down");
        },
      }),
    ).toEqual([]);
  });
});
