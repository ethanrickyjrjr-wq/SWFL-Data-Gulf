import { test, expect, describe } from "bun:test";
import { classifyFamily, FAMILY_BANDS } from "./band-guard";

describe("classifyFamily", () => {
  test("slow prices/values", () => {
    expect(classifyFamily("Median Home Value")).toBe("slow_price");
    expect(classifyFamily("Median Asking Rent")).toBe("slow_price");
    expect(classifyFamily("Price per Square Foot")).toBe("slow_price");
  });
  test("volatile counts", () => {
    expect(classifyFamily("Active Inventory")).toBe("volatile_count");
    expect(classifyFamily("Homes Sold")).toBe("volatile_count");
    expect(classifyFamily("New Permits (90 Days)")).toBe("volatile_count");
  });
  test("bounded ratios/scores", () => {
    expect(classifyFamily("Sale-to-List Ratio")).toBe("bounded_ratio");
    expect(classifyFamily("Market Heat Score")).toBe("bounded_ratio");
    expect(classifyFamily("Months of Supply")).toBe("bounded_ratio");
  });
  test("durations", () => {
    expect(classifyFamily("Days on Market")).toBe("duration");
  });
  test("structural/annual", () => {
    expect(classifyFamily("Median household income")).toBe("structural");
    expect(classifyFamily("Save-Our-Homes Gap")).toBe("structural");
  });
  test("unknown label falls through", () => {
    expect(classifyFamily("Some Novel Metric")).toBe("unknown");
  });
});

describe("FAMILY_BANDS", () => {
  test("every family has a band grounded in the spec", () => {
    expect(FAMILY_BANDS.volatile_count.monthlyBand).toBeGreaterThanOrEqual(10);
    expect(FAMILY_BANDS.slow_price.monthlyBand).toBeLessThanOrEqual(3);
    expect(FAMILY_BANDS.bounded_ratio.kind).toBe("abs");
    expect(FAMILY_BANDS.unknown).toBeDefined();
  });
});
