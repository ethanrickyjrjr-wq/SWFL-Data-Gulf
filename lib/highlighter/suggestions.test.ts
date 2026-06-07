import { test, expect } from "bun:test";
import { suggestionsForMetric } from "./suggestions";

test("returns at least two suggestions", () => {
  const out = suggestionsForMetric(
    { metric: "median_sale_price", value: "$525,000" },
    "cre-swfl",
  );
  expect(out.length).toBeGreaterThanOrEqual(2);
});

test("one suggestion invites a comparison", () => {
  const out = suggestionsForMetric(
    { metric: "median_sale_price", value: "$525,000" },
    "cre-swfl",
  );
  expect(out.some((s) => /compare|other|vs\./i.test(s))).toBe(true);
});

test("humanizes the metric name (underscores → spaces)", () => {
  const out = suggestionsForMetric(
    { metric: "cap_rate", value: "6.2%" },
    "cre-swfl",
  );
  expect(out[0]).toContain("cap rate");
});

test("housing-swfl gets a third flood-risk suggestion", () => {
  const out = suggestionsForMetric(
    { metric: "median_sale_price", value: "$525,000" },
    "housing-swfl",
  );
  expect(out.length).toBe(3);
  expect(out.some((s) => /flood/i.test(s))).toBe(true);
});
