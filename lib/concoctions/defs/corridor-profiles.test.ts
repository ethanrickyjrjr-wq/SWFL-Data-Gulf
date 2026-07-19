import { describe, it, expect } from "bun:test";
import { corridorProfiles } from "./corridor-profiles";
import { evaluateGuards } from "../guards";
import { stubSb } from "./test-stub";

const FIXTURE = [
  {
    corridor_name: "Alico Industrial",
    city: "Fort Myers",
    corridor_type: "industrial flex",
    evolution_direction: "growing",
    seasonal_index: 0.1,
    cap_rate_pct: 6.7,
    vacancy_rate_pct: 3.0,
    absorption_sqft: 185000,
    asking_rent_psf: 16.04,
    character: "Logistics corridor.",
    metrics_verified_date: "2026-05-22",
  },
  {
    corridor_name: "Immokalee Rd",
    city: "Naples",
    corridor_type: "highway strip mall",
    evolution_direction: "stable",
    seasonal_index: 0.45,
    cap_rate_pct: 6.7,
    vacancy_rate_pct: 4.2,
    absorption_sqft: 120500,
    asking_rent_psf: 42.5,
    character: "North Collier gravity center.",
    metrics_verified_date: "2026-05-22",
  },
  {
    corridor_name: "Estero Blvd",
    city: "Fort Myers Beach",
    corridor_type: "beachfront tourism",
    evolution_direction: "repositioning",
    seasonal_index: 0.88,
    cap_rate_pct: 8.3,
    vacancy_rate_pct: 7.7,
    absorption_sqft: -5000,
    asking_rent_psf: 60.84,
    character: "Barrier-island rebuild.",
    metrics_verified_date: "2026-06-01",
  },
  {
    corridor_name: "Pine Ridge Rd",
    city: "Naples",
    corridor_type: "medical-anchored",
    evolution_direction: "stable",
    seasonal_index: 0.3,
    cap_rate_pct: 6.7,
    vacancy_rate_pct: 0.2,
    absorption_sqft: 28000,
    asking_rent_psf: 38.0,
    character: "Medical corridor.",
    metrics_verified_date: "2026-05-22",
  },
  {
    corridor_name: "Null Cap Corridor",
    city: "Cape Coral",
    corridor_type: "suburban",
    evolution_direction: "growing",
    seasonal_index: null,
    cap_rate_pct: null,
    vacancy_rate_pct: 5.0,
    absorption_sqft: 32000,
    asking_rent_psf: 32.5,
    character: null,
    metrics_verified_date: null,
  },
];

describe("corridorProfiles def", () => {
  it("loads with the verified predicate", async () => {
    const capture: Record<string, unknown> = {};
    const rows = await corridorProfiles.load(stubSb(FIXTURE, capture), {});
    expect(capture.table).toBe("corridor_profiles");
    expect(capture["is:deleted_at"]).toBeNull();
    expect(capture["eq:verification_status"]).toBe("verified");
    expect(rows).toHaveLength(5);
  });
  it("takes NO params — the table has city, not county (probed 07/12/2026)", () => {
    expect(Object.keys((corridorProfiles.params as { shape?: object }).shape ?? {})).toHaveLength(
      0,
    );
  });
  it("cap_rate_pct is guard-fenced — near-constant on real-shaped data", () => {
    const col = corridorProfiles.columns.find((c) => c.key === "cap_rate_pct")!;
    expect(col.guards?.minDistinct).toBeGreaterThanOrEqual(5);
    const many = [
      ...Array(22).fill(FIXTURE[0]),
      ...Array(3).fill(FIXTURE[2]),
      FIXTURE[4],
      FIXTURE[4],
    ];
    expect(evaluateGuards(many as never, col).ok).toBe(false);
  });
  it("asking_rent_psf and vacancy_rate_pct pass their own guards on the fixture", () => {
    for (const key of ["asking_rent_psf", "vacancy_rate_pct"]) {
      const col = corridorProfiles.columns.find((c) => c.key === key)!;
      expect(evaluateGuards(FIXTURE as never, col).ok).toBe(true);
    }
  });
  it("asOfLabel says the date is a verify date, not the report period", () => {
    expect(corridorProfiles.asOfLabel).toBe("Verified");
  });
  it("asOf = max metrics_verified_date as MM/DD/YYYY; null-safe", () => {
    expect(corridorProfiles.asOf(FIXTURE as never)).toBe("06/01/2026");
  });
  it("defaultLayout references only declared columns", () => {
    const keys = new Set(corridorProfiles.columns.map((c) => c.key));
    for (const spec of corridorProfiles.defaultLayout) {
      for (const m of spec.slice.measures) expect(keys.has(m)).toBe(true);
      if (spec.slice.dimension) expect(keys.has(spec.slice.dimension)).toBe(true);
    }
  });
});
