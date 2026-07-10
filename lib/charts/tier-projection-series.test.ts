import { describe, expect, it } from "vitest";
import { projectTierTrend } from "./tier-projection-series";
import type { ChartRow } from "@/types/viz";

const rows = (n: number, lux: (i: number) => number, star: (i: number) => number): ChartRow[] =>
  Array.from({ length: n }, (_, i) => ({
    month: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`,
    luxury_index: lux(i),
    starter_index: star(i),
  }));

describe("projectTierTrend (deterministic trailing-12 linear extrapolation)", () => {
  it("linear series projects linearly: +1/mo → +6 at horizon 6", () => {
    const p = projectTierTrend(
      rows(
        24,
        (i) => 100 + i,
        (i) => 100 + 2 * i,
      ),
      6,
      12,
    );
    expect(p).not.toBeNull();
    expect(p!.luxuryLatest).toBe(123);
    expect(p!.luxuryEnd).toBeCloseTo(129, 5); // slope 1 × 6 months
    expect(p!.starterLatest).toBe(146);
    expect(p!.starterEnd).toBeCloseTo(158, 5); // slope 2 × 6 months
    expect(p!.horizonMonths).toBe(6);
  });

  it("flat series projects flat", () => {
    const p = projectTierTrend(
      rows(
        24,
        () => 100,
        () => 100,
      ),
      6,
      12,
    );
    expect(p!.luxuryEnd).toBeCloseTo(100, 5);
    expect(p!.starterEnd).toBeCloseTo(100, 5);
  });

  it("null under a full trailing window (needs 12 rows)", () => {
    expect(
      projectTierTrend(
        rows(
          8,
          (i) => 100 + i,
          (i) => 100 + i,
        ),
      ),
    ).toBeNull();
    expect(projectTierTrend([])).toBeNull();
  });
});
