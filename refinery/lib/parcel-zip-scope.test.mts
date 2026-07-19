import { describe, it, expect } from "vitest";
import { zipInPrimaryCounty, LEE_FIPS, COLLIER_FIPS } from "./parcel-zip-scope.mts";

describe("zipInPrimaryCounty — straddle-ZIP disjointness", () => {
  it("assigns each Lee/Collier straddle ZIP to exactly one county", () => {
    // 34110 + 34119: Collier-primary (Lee holds only a few hundred parcels of each).
    for (const zip of ["34110", "34119"]) {
      expect(zipInPrimaryCounty(zip, COLLIER_FIPS)).toBe(true);
      expect(zipInPrimaryCounty(zip, LEE_FIPS)).toBe(false);
    }
    // 34134 (Bonita Springs): Lee-primary — its Collier side is the minority sliver.
    expect(zipInPrimaryCounty("34134", LEE_FIPS)).toBe(true);
    expect(zipInPrimaryCounty("34134", COLLIER_FIPS)).toBe(false);
  });

  it("passes ordinary single-county ZIPs for their own county only", () => {
    expect(zipInPrimaryCounty("33901", LEE_FIPS)).toBe(true); // Fort Myers
    expect(zipInPrimaryCounty("33901", COLLIER_FIPS)).toBe(false);
    expect(zipInPrimaryCounty("34102", COLLIER_FIPS)).toBe(true); // Naples
    expect(zipInPrimaryCounty("34102", LEE_FIPS)).toBe(false);
  });

  it("rejects out-of-footprint and malformed ZIPs for every county", () => {
    for (const zip of ["90210", "", "not-a-zip"]) {
      expect(zipInPrimaryCounty(zip, LEE_FIPS)).toBe(false);
      expect(zipInPrimaryCounty(zip, COLLIER_FIPS)).toBe(false);
    }
  });
});
