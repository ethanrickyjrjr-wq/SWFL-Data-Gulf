import { test } from "bun:test";
import assert from "node:assert/strict";

import type { ObservationV1 } from "./observation-contract.mts";
import { comparePriorYearPeriods, selectLatestVintages } from "./compare-periods.mts";

function row(overrides: Partial<ObservationV1> = {}): ObservationV1 {
  return {
    schema_version: 1,
    source_id: "rsw_monthly",
    metric_id: "total_passenger_movements_monthly",
    definition_version: "1",
    geo_type: "airport",
    geo_id: "RSW",
    period_start: "2025-01-01",
    period_end: "2025-01-31",
    frequency: "monthly",
    value: 100,
    unit: "passenger_movements",
    status: "observed",
    value_basis: "reported",
    published_at: "2025-02-20T15:00:00.000Z",
    first_seen_at: "2025-02-20T16:00:00.000Z",
    retrieved_at: "2025-02-20T16:05:00.000Z",
    available_at: "2025-02-20T15:00:00.000Z",
    availability_basis: "publisher_release",
    source_url: "https://example.test/source",
    source_sha256: "a".repeat(64),
    vintage_id: "release-1",
    quality_flags: [],
    ...overrides,
  };
}

test("missing exact prior year is insufficient evidence rather than a two-year comparison", () => {
  const result = comparePriorYearPeriods(
    [
      row({ period_start: "2023-01-01", period_end: "2023-01-31" }),
      row({ period_start: "2025-01-01", period_end: "2025-01-31", value: 120 }),
    ],
    { from: "2025-01", through: "2025-01" },
  );
  assert.equal(result.series[0].classification, "insufficient_evidence");
  assert.match(result.series[0].gap_reason!, /exact prior-year period 2024-01-01/);
});

test("observed zero is compared while a suppressed null stays insufficient", () => {
  const result = comparePriorYearPeriods(
    [
      row({ period_start: "2024-01-01", period_end: "2024-01-31", value: 5 }),
      row({ period_start: "2025-01-01", period_end: "2025-01-31", value: 0 }),
      row({
        metric_id: "freight_tons_monthly",
        period_start: "2024-01-01",
        period_end: "2024-01-31",
        value: 9,
        unit: "short_tons",
      }),
      row({
        metric_id: "freight_tons_monthly",
        period_start: "2025-01-01",
        period_end: "2025-01-31",
        value: null,
        unit: "short_tons",
        status: "suppressed",
      }),
    ],
    { from: "2025-01", through: "2025-01" },
  );
  const passengers = result.series.find((item) => item.metric_id.includes("passenger"))!;
  const freight = result.series.find((item) => item.metric_id.includes("freight"))!;
  assert.equal(passengers.current_value, 0);
  assert.equal(passengers.absolute_change, -5);
  assert.equal(passengers.percent_change, -100);
  assert.equal(passengers.direction, "decrease");
  assert.equal(freight.classification, "insufficient_evidence");
});

test("quarterly and annual observations never satisfy a monthly prior-period lookup", () => {
  const result = comparePriorYearPeriods(
    [
      row({
        period_start: "2024-01-01",
        period_end: "2024-12-31",
        frequency: "annual",
      }),
      row({ period_start: "2025-01-01", period_end: "2025-01-31", value: 110 }),
    ],
    { from: "2025-01", through: "2025-01" },
  );
  assert.equal(result.series[0].classification, "insufficient_evidence");
  assert.match(result.series[0].gap_reason!, /exact prior-year period/);
});

test("county data cannot serve as the prior observation for an airport series", () => {
  const result = comparePriorYearPeriods(
    [
      row({
        geo_type: "county_fips",
        geo_id: "12071",
        period_start: "2024-01-01",
        period_end: "2024-01-31",
      }),
      row({ period_start: "2025-01-01", period_end: "2025-01-31", value: 110 }),
    ],
    { from: "2025-01", through: "2025-01" },
  );
  assert.equal(result.series.length, 1);
  assert.equal(result.series[0].geo_type, "airport");
  assert.equal(result.series[0].classification, "insufficient_evidence");
});

test("latest-vintage selection is deterministic and reports the chosen revision", () => {
  const first = row();
  const revision = row({
    value: 105,
    vintage_id: "release-2",
    source_sha256: "b".repeat(64),
    published_at: "2025-03-20T15:00:00.000Z",
    first_seen_at: "2025-03-20T16:00:00.000Z",
    retrieved_at: "2025-03-20T16:05:00.000Z",
    available_at: "2025-03-20T15:00:00.000Z",
  });
  const selected = selectLatestVintages([revision, first]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].value, 105);
  assert.equal(selected[0].vintage_id, "release-2");
});

test("period assessments distinguish agreement, divergence, and insufficient evidence", () => {
  const bps = (geoId: string, value2024: number, value2025: number): ObservationV1[] => [
    row({
      source_id: "census_bps_county",
      metric_id: "residential_units_authorized_monthly",
      geo_type: "county_fips",
      geo_id: geoId,
      period_start: "2024-01-01",
      period_end: "2024-01-31",
      value: value2024,
      unit: "housing_units_authorized",
    }),
    row({
      source_id: "census_bps_county",
      metric_id: "residential_units_authorized_monthly",
      geo_type: "county_fips",
      geo_id: geoId,
      period_start: "2025-01-01",
      period_end: "2025-01-31",
      value: value2025,
      unit: "housing_units_authorized",
    }),
  ];
  const rsw = [
    row({ period_start: "2024-01-01", period_end: "2024-01-31", value: 100 }),
    row({ period_start: "2025-01-01", period_end: "2025-01-31", value: 120 }),
  ];
  const agreement = comparePriorYearPeriods([...rsw, ...bps("12071", 10, 15)], {
    from: "2025-01",
    through: "2025-01",
  });
  assert.equal(agreement.periods[0].classification, "agreement");

  const divergence = comparePriorYearPeriods([...rsw, ...bps("12071", 15, 10)], {
    from: "2025-01",
    through: "2025-01",
  });
  assert.equal(divergence.periods[0].classification, "divergence");

  const insufficient = comparePriorYearPeriods(rsw, { from: "2025-01", through: "2025-01" });
  assert.equal(insufficient.periods[0].classification, "insufficient_evidence");
  assert.match(insufficient.periods[0].gap_reason!, /two distinct sources/);

  const optionalMissing = comparePriorYearPeriods(
    [
      ...rsw,
      ...bps("12071", 10, 15),
      row({
        source_id: "optional_third_source",
        metric_id: "optional_monthly_metric",
        period_start: "2025-01-01",
        period_end: "2025-01-31",
        value: null,
        status: "unavailable",
      }),
    ],
    { from: "2025-01", through: "2025-01" },
  );
  assert.equal(optionalMissing.periods[0].classification, "agreement");
  assert.match(optionalMissing.periods[0].gap_reason!, /additional series/);
});
