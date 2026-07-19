import { test, expect } from "bun:test";
import { loadParcelFact } from "./parcel-read";
import type { ParcelCandidateRow } from "./parcel-read";

// Every row defaults to the matching subject ("15756 Modena St", 34114); a test overrides
// only the field it exercises.
const row = (over: Partial<ParcelCandidateRow> = {}): ParcelCandidateRow => ({
  phy_addr1: "15756 MODENA ST",
  phy_addr2: null,
  phy_city: "NAPLES",
  phy_zipcd: "34114",
  sale_prc1: 610000,
  sale_yr1: 2021,
  sale_mo1: 6,
  actual_year_built: 1998,
  living_area_sqft: 2100,
  multi_parcel_sale_1: null,
  ...over,
});

test("returns the address-key matched row's ParcelFact, ignoring non-matches", async () => {
  const rows = [row({ phy_addr1: "99 SOMEWHERE ELSE DR", sale_prc1: 900000 }), row()];
  const fact = await loadParcelFact("15756 Modena St", "34114", "Collier", {
    fetchCandidates: async () => rows,
  });
  expect(fact).not.toBeNull();
  expect(fact!.salePrice).toBe(610000);
  expect(fact!.saleYear).toBe(2021);
  expect(fact!.saleMonth).toBe(6);
  expect(fact!.yearBuilt).toBe(1998);
  expect(fact!.livingAreaSqft).toBe(2100);
  expect(fact!.county).toBe("Collier");
});

test("omits a multi-parcel sale (multi_parcel_sale_1 present and not 'N')", async () => {
  const fact = await loadParcelFact("15756 Modena St", "34114", "Collier", {
    fetchCandidates: async () => [row({ multi_parcel_sale_1: "Y" })],
  });
  expect(fact).toBeNull();
});

test("omits an FDOR non-arm's-length placeholder price (< 1000)", async () => {
  const fact = await loadParcelFact("15756 Modena St", "34114", "Collier", {
    fetchCandidates: async () => [row({ sale_prc1: 100 })],
  });
  expect(fact).toBeNull();
});

test("empty-tolerant: fetch throws -> null", async () => {
  const fact = await loadParcelFact("15756 Modena St", "34114", "Collier", {
    fetchCandidates: async () => {
      throw new Error("boom");
    },
  });
  expect(fact).toBeNull();
});
