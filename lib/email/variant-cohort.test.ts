import { describe, expect, it } from "bun:test";
import { cohortIndex } from "./variant-cohort";

describe("cohortIndex", () => {
  it("is stable for the same contact id and variant count", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(cohortIndex(id, 3)).toBe(cohortIndex(id, 3));
  });

  it("always returns 0 when variantCount <= 1", () => {
    expect(cohortIndex("abc", 1)).toBe(0);
    expect(cohortIndex("abc", 0)).toBe(0);
  });

  it("returns an index in [0, variantCount)", () => {
    for (const id of ["a", "bb", "ccc", "123e4567-e89b-12d3-a456-426614174000", "z".repeat(50)]) {
      const i = cohortIndex(id, 3);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(3);
    }
  });

  it("distributes a set of ids across all cohorts (not degenerate)", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `contact-${i}`);
    const buckets = new Set(ids.map((id) => cohortIndex(id, 2)));
    expect(buckets.size).toBe(2);
  });
});
