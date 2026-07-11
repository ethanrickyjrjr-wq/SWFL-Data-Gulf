import { describe, expect, it } from "bun:test";
import {
  CORE_SCOPE_ZIPS,
  CORE_SCOPE_COUNTY_FIPS,
  CORE_SCOPE_COUNTY_NAMES,
  TOTAL_CORE_ZIPS,
  isCoreScope,
  isCoreCounty,
} from "./core-scope.mts";

describe("core-scope", () => {
  it("derives exactly 57 core ZIPs (Lee 35 + Collier 22)", () => {
    expect(CORE_SCOPE_ZIPS.size).toBe(57);
    expect(TOTAL_CORE_ZIPS).toBe(57);
  });

  it("scopes to Lee (12071) + Collier (12021) only", () => {
    expect(CORE_SCOPE_COUNTY_FIPS.has("12071")).toBe(true);
    expect(CORE_SCOPE_COUNTY_FIPS.has("12021")).toBe(true);
    expect(CORE_SCOPE_COUNTY_FIPS.size).toBe(2);
  });

  it("includes known Lee/Collier ZIPs", () => {
    expect(isCoreScope("33901")).toBe(true); // Fort Myers (Lee)
    expect(isCoreScope("34102")).toBe(true); // Naples (Collier)
    expect(isCoreScope("33904")).toBe(true); // Cape Coral (Lee)
  });

  it("excludes non-core SWFL counties (in the crosswalk, not core)", () => {
    expect(isCoreScope("34285")).toBe(false); // Venice (Sarasota)
    expect(isCoreScope("33950")).toBe(false); // Punta Gorda (Charlotte)
    expect(isCoreScope("33440")).toBe(false); // Clewiston (Hendry)
  });

  it("excludes pure-leak ZIPs not in the crosswalk at all", () => {
    expect(isCoreScope("34205")).toBe(false); // Bradenton (Manatee — spillover)
    expect(isCoreScope("33101")).toBe(false); // Miami
  });

  it("handles empty / garbage / non-string input", () => {
    expect(isCoreScope("")).toBe(false);
    expect(isCoreScope("  ")).toBe(false);
    expect(isCoreScope(null)).toBe(false);
    expect(isCoreScope(undefined)).toBe(false);
    expect(isCoreScope("not-a-zip")).toBe(false);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(isCoreScope(" 33901 ")).toBe(true);
  });

  it("derives the two core county NAMES from the same crosswalk (Lee, Collier)", () => {
    expect(CORE_SCOPE_COUNTY_NAMES.size).toBe(2);
    expect(CORE_SCOPE_COUNTY_NAMES.has("Lee")).toBe(true);
    expect(CORE_SCOPE_COUNTY_NAMES.has("Collier")).toBe(true);
  });

  it("isCoreCounty accepts core counties, rejects Hendry and other SWFL counties", () => {
    expect(isCoreCounty("Lee")).toBe(true);
    expect(isCoreCounty("Collier")).toBe(true);
    expect(isCoreCounty("Hendry")).toBe(false); // in the lake, not a display county
    expect(isCoreCounty("Charlotte")).toBe(false);
    expect(isCoreCounty("Sarasota")).toBe(false);
  });

  it("isCoreCounty strips a trailing ' County' and trims", () => {
    expect(isCoreCounty("Lee County")).toBe(true);
    expect(isCoreCounty(" Collier ")).toBe(true);
    expect(isCoreCounty("collier")).toBe(false); // case-sensitive: matches the view's stored casing
  });

  it("isCoreCounty handles empty / garbage / null input", () => {
    expect(isCoreCounty("")).toBe(false);
    expect(isCoreCounty(null)).toBe(false);
    expect(isCoreCounty(undefined)).toBe(false);
  });
});
