import { test, expect } from "bun:test";
import { loadZhviChange } from "./zhvi-change";

const series = [
  { period_end: "2021-06-30", home_value: 400000 },
  { period_end: "2026-06-30", home_value: 456000 },
];

test("baseline within 92 days of the purchase month -> pctChange + fromMdy", async () => {
  const z = await loadZhviChange("34114", 2021, 6, { fetchSeries: async () => series });
  expect(z).not.toBeNull();
  // (456000 - 400000) / 400000 * 100 = 14
  expect(Math.abs(z!.pctChange - 14)).toBeLessThan(0.1);
  expect(z!.fromMdy).toBe("06/2021");
});

test("no baseline within 92 days of the purchase month -> null", async () => {
  // Purchase 2021-01: the first point on/after 2021-01-01 is 2021-06-30, ~180 days out.
  const z = await loadZhviChange("34114", 2021, 1, { fetchSeries: async () => series });
  expect(z).toBeNull();
});

test("empty-tolerant: fetch throws -> null", async () => {
  const z = await loadZhviChange("34114", 2021, 6, {
    fetchSeries: async () => {
      throw new Error("boom");
    },
  });
  expect(z).toBeNull();
});
