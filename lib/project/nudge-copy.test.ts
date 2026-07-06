import { describe, test, expect } from "bun:test";
import { nudgeChipText } from "./nudge-copy";

describe("nudgeChipText", () => {
  test("appeared", () => {
    expect(nudgeChipText("appeared", null)).toContain("live in the MLS");
  });

  test("departed_holding is explicitly hedged, never asserts a fact", () => {
    const text = nudgeChipText("departed_holding", null);
    expect(text).toContain("may have gone under contract");
  });

  test("resolved_sold with a real price_delta includes the real number and its sign", () => {
    const text = nudgeChipText("resolved_sold", -10000);
    expect(text).toContain("$10,000");
    expect(text.includes("-$10,000") || text.includes("−$10,000")).toBe(true);
  });

  test("resolved_sold with no price_delta omits any invented number", () => {
    const text = nudgeChipText("resolved_sold", null);
    expect(text).not.toMatch(/\$\d/);
  });

  test("time_elapsed", () => {
    expect(nudgeChipText("time_elapsed", null)).toContain("14 days");
  });
});
