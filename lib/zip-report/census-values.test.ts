import { describe, expect, it } from "bun:test";
import { filterCensusValues, type CensusFigureInput } from "./census-values";

const fig = (key: string, label: string, display: string): CensusFigureInput => ({
  key,
  label,
  value: display,
  source_label: "U.S. Census ACS",
  source_url: "https://census.gov",
});

const FIGURES: CensusFigureInput[] = [
  fig("median_household_income", "Median household income", "$72,662"),
  fig("total_population", "Population", "43,283"),
  fig("owner_occupied", "Owner-occupied homes", "78%"),
];

const NUMERIC = new Map<string, number>([
  ["median_household_income", 72662],
  ["total_population", 43283],
  ["owner_occupied", 78],
]);

describe("filterCensusValues", () => {
  it("income-only keeps ONLY the income figure", () => {
    const out = filterCensusValues(FIGURES, NUMERIC, "income-only");
    expect(out.map((c) => c.key)).toEqual(["median_household_income"]);
    expect(out[0].value).toBe(72662);
    expect(out[0].display).toBe("$72,662");
  });

  it("all keeps every figure that has a numeric value", () => {
    const out = filterCensusValues(FIGURES, NUMERIC, "all");
    expect(out.map((c) => c.key)).toEqual([
      "median_household_income",
      "total_population",
      "owner_occupied",
    ]);
  });

  it("drops a figure with no numeric value (never a fabricated number)", () => {
    const out = filterCensusValues(FIGURES, new Map([["total_population", 43283]]), "all");
    expect(out.map((c) => c.key)).toEqual(["total_population"]);
  });

  it("income-only with no income figure yields an empty pool (not a fallback)", () => {
    const noIncome = FIGURES.filter((f) => f.key !== "median_household_income");
    expect(filterCensusValues(noIncome, NUMERIC, "income-only")).toEqual([]);
  });
});
