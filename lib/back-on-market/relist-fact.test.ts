// lib/back-on-market/relist-fact.test.ts
//
// Lane 2 acceptance oracle. resolveRelistFact turns a specific address into its ONE clean
// relist event, or null. The failure mode is a silent no-op (a green suite that resolves
// nothing in prod), so these tests pin the two things the 07/17/2026 lake probe proved
// load-bearing: the >= 7d flicker floor is enforced in CODE (not only in SQL), and the
// derived address_key reproduces the STORED key — including the "#<unit>" -> permalink
// "UNIT<x>" normalization for condos. Fully offline: geocode + lake read are injected, so
// zero network, zero cost.
import { test, expect, describe } from "bun:test";
import { resolveRelistFact, RELIST_MIN_DAYS_OFF_MARKET } from "./relist-fact";
import type { GeocodeFn } from "@/lib/geo/geocode-address";

/** A geocoder stub that always returns the given ZIP (county is derived from it by
 *  geocodeAddress via the real resolveZip — 33901=Lee, 34110=Collier, 33935=Hendry). */
const geoStub =
  (zip: string): GeocodeFn =>
  async () =>
    ({ lat: 26.6, lon: -81.9, place: "Test Place", zip }) as never;

/** A geocoder that misses entirely. */
const geoMiss: GeocodeFn = async () => null;

test("empty input → null (never geocodes, never invents)", async () => {
  expect(await resolveRelistFact("")).toBeNull();
  expect(await resolveRelistFact("   ")).toBeNull();
  expect(await resolveRelistFact(null)).toBeNull();
});

test("a geocoder miss → null", async () => {
  const fact = await resolveRelistFact("123 Nowhere St, Somewhere", {
    geocode: geoMiss,
    fetchRelistRows: async () => [{ at: "2026-07-01", days_off_market: 30 }],
  });
  expect(fact).toBeNull();
});

describe("the Lee/Collier footprint gate", () => {
  test("a Lee address resolves (Cape Coral / Fort Myers ZIP)", async () => {
    const fact = await resolveRelistFact("123 Main St, Fort Myers, FL 33901", {
      geocode: geoStub("33901"),
      fetchRelistRows: async () => [{ at: "2026-07-10", days_off_market: 12 }],
    });
    expect(fact).not.toBeNull();
    expect(fact!.daysOffMarket).toBe(12);
  });

  test("a Collier address resolves (Naples ZIP)", async () => {
    const fact = await resolveRelistFact("100 5th Ave S, Naples, FL 34110", {
      geocode: geoStub("34110"),
      fetchRelistRows: async () => [{ at: "2026-07-10", days_off_market: 9 }],
    });
    expect(fact).not.toBeNull();
  });

  test("a Hendry address (real SWFL ZIP, NOT Lee/Collier) → null — the gate is Lee/Collier, not 'any SWFL'", async () => {
    const fact = await resolveRelistFact("503 Braelyn St, LaBelle, FL 33935", {
      geocode: geoStub("33935"), // Hendry 12051
      fetchRelistRows: async () => [{ at: "2026-07-10", days_off_market: 30 }],
    });
    expect(fact).toBeNull();
  });

  test("an out-of-SWFL address → null", async () => {
    const fact = await resolveRelistFact("1 Rodeo Dr, Beverly Hills, CA 90210", {
      geocode: geoStub("90210"),
      fetchRelistRows: async () => [{ at: "2026-07-10", days_off_market: 30 }],
    });
    expect(fact).toBeNull();
  });
});

describe("the >= 7-day flicker floor (enforced in code, not only in SQL)", () => {
  test("a below-threshold event (3 days off-market) → null", async () => {
    // The mock deliberately hands back a below-threshold row (as if the SQL guard were
    // absent) — so this proves the TS guard, not the .gte filter.
    const fact = await resolveRelistFact("123 Main St, Fort Myers, FL 33901", {
      geocode: geoStub("33901"),
      fetchRelistRows: async () => [{ at: "2026-07-16", days_off_market: 3 }],
    });
    expect(fact).toBeNull();
  });

  test("exactly at the floor (7 days) → the fact", async () => {
    const fact = await resolveRelistFact("123 Main St, Fort Myers, FL 33901", {
      geocode: geoStub("33901"),
      fetchRelistRows: async () => [
        { at: "2026-07-10", days_off_market: RELIST_MIN_DAYS_OFF_MARKET },
      ],
    });
    expect(fact).not.toBeNull();
    expect(fact!.daysOffMarket).toBe(7);
  });

  test("a NULL days_off_market (a pre-Phase-2 row) → null (forward-only)", async () => {
    const fact = await resolveRelistFact("123 Main St, Fort Myers, FL 33901", {
      geocode: geoStub("33901"),
      fetchRelistRows: async () => [{ at: "2026-07-10", days_off_market: null }],
    });
    expect(fact).toBeNull();
  });
});

describe("the resolved fact", () => {
  test("a >= 7d event → the fact with the duration and MM/DD/YYYY date", async () => {
    const fact = await resolveRelistFact("123 Main St, Fort Myers, FL 33901", {
      geocode: geoStub("33901"),
      fetchRelistRows: async () => [{ at: "2026-07-04", days_off_market: 21 }],
    });
    expect(fact).toEqual({
      addressKey: "123MAINST:33901",
      isoDate: "2026-07-04",
      date: "07/04/2026",
      daysOffMarket: 21,
    });
  });

  test("no matching transition → null", async () => {
    const fact = await resolveRelistFact("123 Main St, Fort Myers, FL 33901", {
      geocode: geoStub("33901"),
      fetchRelistRows: async () => [],
    });
    expect(fact).toBeNull();
  });

  test("multiple qualifying events → the freshest one", async () => {
    const fact = await resolveRelistFact("123 Main St, Fort Myers, FL 33901", {
      geocode: geoStub("33901"),
      fetchRelistRows: async () => [
        { at: "2026-05-01", days_off_market: 40 },
        { at: "2026-07-12", days_off_market: 15 },
        { at: "2026-06-20", days_off_market: 22 },
      ],
    });
    expect(fact!.isoDate).toBe("2026-07-12");
    expect(fact!.daysOffMarket).toBe(15);
  });
});

describe("the derived address_key matches the STORED key (the round-trip probe, pinned)", () => {
  test("a single-family address derives its key natively", async () => {
    let seenKey = "";
    await resolveRelistFact("8087 Sherwood Cir, Fort Myers, FL 33901", {
      geocode: geoStub("33901"),
      fetchRelistRows: async (key) => {
        seenKey = key;
        return [];
      },
    });
    expect(seenKey).toBe("8087SHERWOODCIR:33901");
  });

  test("a condo '#<unit>' address normalizes to the permalink 'UNIT<x>' stored key", async () => {
    // The whole reason this normalization exists: the ingest keyed condos off the vendor
    // permalink ("-apt-201" -> "UNIT201"), but a user types the display "#201" form, and
    // addressKey's `\b#` matches neither. Without the "#<x>" -> "Unit <x>" boundary
    // normalization this would derive "...DR201" and silently never match.
    let seenKey = "";
    await resolveRelistFact("5640 Northboro Dr #201, Naples, FL 34110", {
      geocode: geoStub("34110"),
      fetchRelistRows: async (key) => {
        seenKey = key;
        return [];
      },
    });
    expect(seenKey).toBe("5640NORTHBORODRUNIT201:34110");
  });
});
