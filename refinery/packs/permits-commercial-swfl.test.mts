import { describe, expect, it } from "vitest";
import { buildSnapshot } from "./permits-commercial-swfl.mts";
import type { MhsPermitNormalized } from "../sources/mhs-permits-source.mts";

function row(p: Partial<MhsPermitNormalized>): MhsPermitNormalized {
  return {
    kind: "mhs-permit",
    submarket_slug: "cape-coral",
    jurisdiction: "City of Cape Coral",
    calendar_year: 2025,
    asset_class: "Retail",
    project_name: "Test Project",
    zip_code: "33990",
    permit_value_usd: 1_000_000,
    building_sf: 10_000,
    verified: false,
    source_url: "fixture://x",
    ...p,
  };
}

describe("permits-commercial-swfl buildSnapshot", () => {
  it("sums SWFL-wide count / value / sf across all rows", () => {
    const s = buildSnapshot([
      row({ permit_value_usd: 1_000_000, building_sf: 10_000 }),
      row({ permit_value_usd: 2_000_000, building_sf: 5_000 }),
    ]);
    expect(s.totalCount).toBe(2);
    expect(s.totalValueUsd).toBe(3_000_000);
    expect(s.totalSf).toBe(15_000);
    expect(s.year).toBe(2025);
  });

  it("treats a missing permit_value_usd / building_sf as 0 (never NaN)", () => {
    const s = buildSnapshot([
      row({ permit_value_usd: null, building_sf: null }),
      row({ permit_value_usd: 500_000, building_sf: 2_000 }),
    ]);
    expect(s.totalValueUsd).toBe(500_000);
    expect(s.totalSf).toBe(2_000);
    expect(Number.isNaN(s.totalValueUsd)).toBe(false);
  });

  it("aggregates by submarket, sorted by value desc, excluding unmapped rows", () => {
    const s = buildSnapshot([
      row({ submarket_slug: "naples", permit_value_usd: 5_000_000 }),
      row({ submarket_slug: "cape-coral", permit_value_usd: 1_000_000 }),
      row({ submarket_slug: "cape-coral", permit_value_usd: 1_000_000 }),
      row({ submarket_slug: null, permit_value_usd: 9_000_000 }),
    ]);
    expect(s.bySubmarket.map((x) => x.submarket_slug)).toEqual(["naples", "cape-coral"]);
    expect(s.bySubmarket[1].count).toBe(2);
    expect(s.unmappedCount).toBe(1);
    // the unmapped row is still counted in SWFL totals
    expect(s.totalCount).toBe(4);
  });

  it("aggregates by ZIP only for rows with a (scope-gated) zip, sorted by count desc", () => {
    const s = buildSnapshot([
      row({ zip_code: "34104" }),
      row({ zip_code: "33990" }),
      row({ zip_code: "33990" }),
      row({ zip_code: null }),
    ]);
    expect(s.byZip.map((z) => z.zip_code)).toEqual(["33990", "34104"]);
    expect(s.byZip[0].count).toBe(2);
    expect(s.withZipCount).toBe(3);
  });

  it("reports priorYears empty for a single-year corpus (no trend possible)", () => {
    const s = buildSnapshot([row({ calendar_year: 2025 })]);
    expect(s.priorYears).toEqual([]);
    expect(s.year).toBe(2025);
  });

  it("identifies the top permit by value and its share of the total", () => {
    const s = buildSnapshot([
      row({
        project_name: "Megaproject",
        permit_value_usd: 8_000_000,
        asset_class: "Industrial",
        submarket_slug: "fort-myers",
      }),
      row({ project_name: "Small A", permit_value_usd: 1_000_000 }),
      row({ project_name: "Small B", permit_value_usd: 1_000_000 }),
    ]);
    expect(s.topPermit?.project_name).toBe("Megaproject");
    expect(s.topPermit?.value_usd).toBe(8_000_000);
    expect(s.topPermit?.asset_class).toBe("Industrial");
    // 8M / 10M = 0.8
    expect(s.topPermitShare).toBeCloseTo(0.8, 5);
  });

  it("topPermitShare is 0 and topPermit null when no row carries a positive value", () => {
    const s = buildSnapshot([row({ permit_value_usd: 0 }), row({ permit_value_usd: null })]);
    expect(s.topPermit).toBeNull();
    expect(s.topPermitShare).toBe(0);
  });

  it("ignores null/zero values when picking the top permit (never NaN share)", () => {
    const s = buildSnapshot([
      row({ project_name: "Real", permit_value_usd: 500_000 }),
      row({ project_name: "Null", permit_value_usd: null }),
    ]);
    expect(s.topPermit?.project_name).toBe("Real");
    expect(s.topPermitShare).toBeCloseTo(1, 5);
    expect(Number.isNaN(s.topPermitShare)).toBe(false);
  });

  it("returns a safe empty snapshot for no rows", () => {
    const s = buildSnapshot([]);
    expect(s.totalCount).toBe(0);
    expect(s.totalValueUsd).toBe(0);
    expect(s.bySubmarket).toEqual([]);
    expect(s.byZip).toEqual([]);
    expect(s.year).toBeNull();
  });
});
