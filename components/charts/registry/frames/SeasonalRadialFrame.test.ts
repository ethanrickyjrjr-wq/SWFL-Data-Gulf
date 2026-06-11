import { describe, it, expect } from "bun:test";
import type { SeasonalRadialEntry } from "@/types/viz";
import type { ChartSpec } from "../chart-spec";

/**
 * Pure data-shaping tests for SeasonalRadialFrame (no DOM by repo design).
 * Verifies that options.data is correctly typed and that the frame resolves
 * through the registry to a defined component.
 */

import { CHART_REGISTRY } from "../registry";

describe("seasonal-radial registry entry", () => {
  it("is registered with component, accepts, and label", () => {
    const def = CHART_REGISTRY["seasonal-radial"];
    expect(def).toBeDefined();
    expect(typeof def.component).toBe("function");
    expect(def.accepts.length).toBeGreaterThan(0);
    expect(def.label.length).toBeGreaterThan(0);
  });

  it("accepts time-series shape", () => {
    expect(CHART_REGISTRY["seasonal-radial"].accepts).toContain("time-series");
  });
});

describe("SeasonalRadialEntry fixture shape", () => {
  const FIXTURE: SeasonalRadialEntry[] = [
    { corridor: "US 41 - Downtown Fort Myers", seasonal_index: 0.85 },
    { corridor: "Cape Coral SW", seasonal_index: 0.64 },
    { corridor: "Bonita Springs / Estero", seasonal_index: 0.42 },
    { corridor: "Naples 5th Ave", seasonal_index: 0.77 },
    { corridor: "Lehigh Acres Industrial", seasonal_index: 0.18 },
  ];

  const FIXTURE_SPEC: ChartSpec = {
    frameId: "seasonal-radial",
    title: "Corridor Seasonality Index",
    columns: ["Corridor", "Seasonal Index"],
    rows: FIXTURE.map((d) => [d.corridor, d.seasonal_index]),
    asOf: "2026-03-31",
    options: { data: FIXTURE },
  };

  it("fixture spec carries required ChartSpec fields", () => {
    expect(FIXTURE_SPEC.frameId).toBe("seasonal-radial");
    expect(FIXTURE_SPEC.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(FIXTURE_SPEC.options?.data)).toBe(true);
  });

  it("every fixture entry has a non-empty corridor name and 0→1 index", () => {
    for (const entry of FIXTURE) {
      expect(entry.corridor.length).toBeGreaterThan(0);
      expect(entry.seasonal_index).toBeGreaterThanOrEqual(0);
      expect(entry.seasonal_index).toBeLessThanOrEqual(1);
    }
  });

  it("options.data round-trips as SeasonalRadialEntry[]", () => {
    const recovered = FIXTURE_SPEC.options?.data as SeasonalRadialEntry[];
    expect(recovered).toHaveLength(FIXTURE.length);
    expect(recovered[0].corridor).toBe("US 41 - Downtown Fort Myers");
    expect(recovered[0].seasonal_index).toBe(0.85);
  });
});
