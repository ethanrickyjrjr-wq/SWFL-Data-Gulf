import { test, expect } from "bun:test";
import { planOpenProject } from "./open-project";

test("in-scope ZIP → plan with grounded title, email seed, brand passthrough", () => {
  const brand = { primary: "#0a7", company_name: "Acme" };
  const plan = planOpenProject({ zip: "33931", brand });
  expect(plan.inScope).toBe(true);
  expect(plan.title).toBe("Fort Myers Beach 33931");
  expect(plan.seed).toEqual({ template: "email", scopeKind: "zip", scopeValue: "33931" });
  expect(plan.brand).toEqual(brand);
});

test("out-of-scope ZIP (Miami) → inScope false (never an invented sub-grain)", () => {
  expect(planOpenProject({ zip: "33101" }).inScope).toBe(false);
});

test("Manatee ZIP outside the 6-county moat → inScope false", () => {
  expect(planOpenProject({ zip: "34201" }).inScope).toBe(false);
});

test("non-5-digit input → inScope false", () => {
  expect(planOpenProject({ zip: "abc" }).inScope).toBe(false);
  expect(planOpenProject({ zip: "3393" }).inScope).toBe(false);
});

test("no brand → brand null; title still grounded", () => {
  const plan = planOpenProject({ zip: "34102" });
  expect(plan.inScope).toBe(true);
  expect(plan.title).toBe("Naples 34102");
  expect(plan.brand).toBeNull();
});
