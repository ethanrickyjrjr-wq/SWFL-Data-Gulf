import { describe, expect, it } from "bun:test";
import { projectTierTrend } from "./tier-projection-series";
import type { ChartRow } from "@/types/viz";

function rows(n: number, base: number, slope: number): ChartRow[] {
  return Array.from({ length: n }, (_, i) => ({
    luxury_index: base + slope * i,
    starter_index: base + slope * i,
  })) as unknown as ChartRow[];
}

describe("projectTierTrend", () => {
  it("projects from the FITTED LINE, not the last observed value", () => {
    // 12 months on an exact line, then spike the LAST point. The old trailingSlope
    // implementation anchored at that spike and dragged the projection with it.
    const r = rows(12, 100, 2);
    (r[11] as { luxury_index: number }).luxury_index = 500; // outlier
    const p = projectTierTrend(r, 6, 12)!;
    // The fitted line at month 11 is ~122, so a 6-month projection lands nowhere
    // near 500 + slope*6. Anchoring at the observed 500 would.
    expect(p.luxuryEnd).toBeLessThan(400);
  });

  it("returns null below the window size", () => {
    expect(projectTierTrend(rows(5, 100, 2), 6, 12)).toBeNull();
  });

  it("keeps its shape so TierProjectionChart needs no change", () => {
    const p = projectTierTrend(rows(24, 100, 2), 6, 12)!;
    expect(p).toHaveProperty("luxuryLatest");
    expect(p).toHaveProperty("starterLatest");
    expect(p).toHaveProperty("luxuryEnd");
    expect(p).toHaveProperty("starterEnd");
    expect(p.horizonMonths).toBe(6);
  });
});
