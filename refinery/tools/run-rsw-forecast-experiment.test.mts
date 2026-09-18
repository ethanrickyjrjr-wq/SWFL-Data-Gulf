import { expect, test } from "bun:test";
import { scoreNumericForecast } from "../intelligence/score-forecast.mts";
import { seasonalNaiveForecast } from "../intelligence/seasonal-naive.mts";

test("historical replay has an exact seasonal reference and produces a score", () => {
  const history = [
    { period: "2024-10", value: 100 },
    { period: "2025-10", value: 110 },
  ];
  const prediction = seasonalNaiveForecast("2025-10", history);
  expect(prediction).toBe(100);
  expect(scoreNumericForecast(prediction!, 110).absolute_error).toBe(10);
});
