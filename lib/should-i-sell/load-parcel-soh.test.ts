// lib/should-i-sell/load-parcel-soh.test.ts
import { describe, expect, test } from "bun:test";
import { loadParcelSoh, normalizeStreetAddress, type RawParcelRow } from "./load-parcel-soh";

describe("normalizeStreetAddress", () => {
  test("uppercases, trims to the street line, collapses spaces", () => {
    expect(normalizeStreetAddress("123  Main St, Fort Myers, FL 33901")).toBe("123 MAIN ST");
    expect(normalizeStreetAddress(" 45 palm ave ")).toBe("45 PALM AVE");
  });
  test("strips trailing unit tokens", () => {
    expect(normalizeStreetAddress("123 Main St Unit 4B")).toBe("123 MAIN ST");
    expect(normalizeStreetAddress("123 Main St Apt 12")).toBe("123 MAIN ST");
    expect(normalizeStreetAddress("123 Main St #7")).toBe("123 MAIN ST");
  });
});

const ROW: RawParcelRow = {
  phy_addr1: "123 MAIN ST",
  jv: "400000",
  jv_hmstd: 380000,
  av_hmstd: "250000",
  assessment_year: 2025,
};

describe("loadParcelSoh", () => {
  test("single match maps + coerces string numerics", async () => {
    const r = await loadParcelSoh("33901", "123 Main St, Fort Myers", ["Lee"], {
      fetchRows: async () => [ROW],
    });
    expect(r).not.toBeNull();
    expect(r!.county).toBe("Lee");
    expect(r!.jv).toBe(400_000);
    expect(r!.jvHmstd).toBe(380_000);
    expect(r!.avHmstd).toBe(250_000);
    expect(r!.homesteaded).toBe(true);
    expect(r!.assessmentYear).toBe(2025);
  });
  test("no match → null", async () => {
    const r = await loadParcelSoh("33901", "9 Nowhere Rd", ["Lee"], { fetchRows: async () => [] });
    expect(r).toBeNull();
  });
  test("two matches (multi-unit) → null, never a guess", async () => {
    const r = await loadParcelSoh("33901", "123 Main St", ["Lee"], {
      fetchRows: async () => [ROW, { ...ROW, jv_hmstd: 100000 }],
    });
    expect(r).toBeNull();
  });
  test("non-homesteaded parcel maps with homesteaded=false", async () => {
    const r = await loadParcelSoh("33901", "123 Main St", ["Lee"], {
      fetchRows: async () => [{ ...ROW, jv_hmstd: 0, av_hmstd: 0 }],
    });
    expect(r!.homesteaded).toBe(false);
  });
  test("straddle ZIP: falls through county order to the county that matches", async () => {
    const calls: string[] = [];
    const r = await loadParcelSoh("34134", "123 Main St", ["Collier", "Lee"], {
      fetchRows: async (county) => {
        calls.push(county);
        return county === "Lee" ? [ROW] : [];
      },
    });
    expect(calls).toEqual(["Collier", "Lee"]);
    expect(r!.county).toBe("Lee");
  });
  test("non-core county names are skipped", async () => {
    const r = await loadParcelSoh("33935", "123 Main St", ["Hendry"], {
      fetchRows: async () => [ROW],
    });
    expect(r).toBeNull();
  });
  test("fetch failure → null, never throws", async () => {
    const r = await loadParcelSoh("33901", "123 Main St", ["Lee"], {
      fetchRows: async () => {
        throw new Error("boom");
      },
    });
    expect(r).toBeNull();
  });
});
