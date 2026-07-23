// This repo has no DOM test environment by design — tests are bun:test + pure.
// We export `permitBaselineCaveat` from CorridorRentChart and test the core
// display logic directly (see components/project/MaterialRow.test.tsx for the
// same pattern).
import { describe, test, expect } from "bun:test";
import { permitBaselineCaveat } from "./CorridorRentChart";

describe("permitBaselineCaveat", () => {
  test("renders the trailing-365d baseline when backfill_days is >= 365", () => {
    expect(permitBaselineCaveat(365, 42)).toBe(
      "Z-Score measures building permit volumes normalized relative to the trailing-365d baseline. Sample of 42 qualifying permits.",
    );
    expect(permitBaselineCaveat(400, 42)).toBe(
      "Z-Score measures building permit volumes normalized relative to the trailing-365d baseline. Sample of 42 qualifying permits.",
    );
  });

  test("renders the narrower still-filling-in baseline when backfill_days is under 365 (the bug: this used to always claim 365d)", () => {
    expect(permitBaselineCaveat(84, 18)).toBe(
      "Z-Score measures building permit volumes normalized relative to the trailing-84d baseline (still filling in). Sample of 18 qualifying permits.",
    );
  });

  test("treats a missing backfill_days (older sidecar rows) as unknown, defaulting to the 365d wording rather than fabricating a day count", () => {
    expect(permitBaselineCaveat(undefined, 18)).toBe(
      "Z-Score measures building permit volumes normalized relative to the trailing-365d baseline. Sample of 18 qualifying permits.",
    );
  });
});
