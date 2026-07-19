import { test, expect } from "bun:test";
import { normalizeTypedUnits } from "./typed-address";

test("rewrites #-form units to Unit-form", () => {
  expect(normalizeTypedUnits("14977 Rivers Edge Ct #217")).toBe("14977 Rivers Edge Ct Unit 217");
  expect(normalizeTypedUnits("15756 Modena St")).toBe("15756 Modena St");
  expect(normalizeTypedUnits("100 Main St # 5")).toBe("100 Main St Unit 5");
});
