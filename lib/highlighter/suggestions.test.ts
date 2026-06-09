import { test, expect } from "bun:test";
import { suggestionsForMetric, suggestionsForSpan } from "./suggestions";
import { resolveMethod } from "../../refinery/lib/methodology-registry.mts";

test("returns at least two suggestions", () => {
  const out = suggestionsForMetric({ metric: "median_sale_price", value: "$525,000" }, "cre-swfl");
  expect(out.length).toBeGreaterThanOrEqual(2);
});

test("one suggestion invites a comparison", () => {
  const out = suggestionsForMetric({ metric: "median_sale_price", value: "$525,000" }, "cre-swfl");
  expect(out.some((s) => /compare|other|vs\./i.test(s))).toBe(true);
});

test("humanizes the metric name (underscores → spaces)", () => {
  const out = suggestionsForMetric({ metric: "cap_rate", value: "6.2%" }, "cre-swfl");
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

test("value span => break down the figure, no definitional chip", () => {
  const c = suggestionsForSpan({ entry: resolveMethod("asking_rent_psf_median"), value: "$27.51" });
  expect(c[0]).toBe("Break down the $27.51");
  expect(c.some((s) => /^what is/i.test(s))).toBe(false);
});

test("need-component surfaces a find action", () => {
  const c = suggestionsForSpan({
    entry: resolveMethod("asking_rent_nnn_marketbeat_marco_island"),
    value: "$27.9",
    place: "Marco Island",
  });
  expect(c.some((s) => /^Find Marco Island's/.test(s))).toBe(true);
});
