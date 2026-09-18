import { expect, test } from "bun:test";
import { assertFutureTarget, freezeForecastRecord } from "./forecast-contract.mts";
import { seasonalNaiveForecast } from "./seasonal-naive.mts";
import { scoreNumericForecast } from "./score-forecast.mts";

test("seasonal baseline requires the exact prior-year month", () => {
  expect(seasonalNaiveForecast("2026-10", [{ period: "2025-10", value: 42 }])).toBe(42);
  expect(seasonalNaiveForecast("2026-10", [{ period: "2025-09", value: 42 }])).toBeNull();
});

test("numeric scoring has explicit zero behavior", () => {
  expect(scoreNumericForecast(100, 0)).toEqual({
    absolute_error: 100,
    squared_error: 10000,
    absolute_percentage_error: null,
    symmetric_absolute_percentage_error: 2,
  });
});

test("a frozen record hashes its complete contents and rejects elapsed targets", () => {
  const frozen = freezeForecastRecord({
    schema_version: 1,
    record_type: "rsw_passenger_forecast",
    state: "awaiting_release",
    created_at: "2026-09-18T20:00:00Z",
    forecast_origin: "2026-09-18T20:00:00Z",
    target_period: "2026-10",
    target_definition: "RSW total passenger movements for the calendar month",
    entity: { geo_type: "airport", geo_id: "RSW", unit: "passenger_movements" },
    last_usable_input_period: "2026-07",
    input_manifest_sha256: "a".repeat(64),
    model: { id: "seasonal_naive_same_month_prior_year_v1", prediction: 1 },
    baseline: { id: "seasonal_naive_same_month_prior_year_v1", prediction: 1 },
    scoring: {
      primary_metric: "MAE",
      secondary_metric: "sMAPE",
      mape_zero_outcome: "unscorable_for_mape",
      direction_rule:
        "reported only when both target and prior-year value are nonzero; not a success criterion",
    },
    outcome_policy: {
      authoritative_source: "LCPA Total Passengers monthly PDF",
      first_grade: "first retained observed vintage after target period",
      revision: "append a versioned grade; never replace the original grade",
      due_after: "2026-11-01",
      grace_until: "2026-12-31",
    },
    replay_quality:
      "historical replay is lag-assumed exploratory because exact historical availability is unknown",
  });
  expect(frozen.forecast_id).toHaveLength(64);
  expect(() => assertFutureTarget("2026-10-01T00:00:00Z", "2026-10")).toThrow();
});
