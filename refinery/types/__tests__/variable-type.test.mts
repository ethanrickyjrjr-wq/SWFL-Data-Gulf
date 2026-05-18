/**
 * Lane 1B — type-level contract tests for `BrainOutputMetric.variable_type`.
 *
 * Runtime smoke tests on the validator are in `metric-contract.test.mts`; this
 * file documents what the union must look like so callers (packs, the
 * validator, future role renderers) have a single source of truth.
 *
 * If these tests start failing it means the enum was widened or narrowed
 * without a paired update to:
 *   - refinery/types/brain-output.mts (the enum itself)
 *   - refinery/validate/spec-validator.mts (the runtime guard)
 *   - every refinery/packs/*.mts that emits key_metrics
 * which is the atomic-type-lift rule. Fix all three before re-greening.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  BrainOutputMetric,
  BrainOutputMetricSource,
} from "../brain-output.mts";

test("BrainOutputMetric.variable_type accepts the three locked values", () => {
  // These assignments are compile-time evidence of the enum shape — bun-test
  // treats them as no-op asserts but the build fails if the type is changed.
  const source: BrainOutputMetricSource = {
    url: "https://example.test/metric",
    fetched_at: "2026-05-18T00:00:00Z",
    tier: 1,
    citation: "example",
  };

  const extensive: BrainOutputMetric = {
    metric: "employee_count",
    value: 42,
    direction: "rising",
    label: "Employees",
    variable_type: "extensive",
    units: "count",
    source,
  };
  const intensive: BrainOutputMetric = {
    metric: "unemployment_rate",
    value: 3.2,
    direction: "falling",
    label: "Unemployment rate",
    variable_type: "intensive",
    units: "percent",
    source,
  };
  const categorical: BrainOutputMetric = {
    metric: "dominant_land_use",
    value: "residential",
    direction: "stable",
    label: "Dominant land use",
    variable_type: "categorical",
    source,
  };

  assert.equal(extensive.variable_type, "extensive");
  assert.equal(intensive.variable_type, "intensive");
  assert.equal(categorical.variable_type, "categorical");
});

test("BrainOutputMetric.display_format optional enum accepts every documented value", () => {
  const source: BrainOutputMetricSource = {
    url: "https://example.test/metric",
    fetched_at: "2026-05-18T00:00:00Z",
    tier: 1,
    citation: "example",
  };
  const formats: NonNullable<BrainOutputMetric["display_format"]>[] = [
    "currency",
    "percent",
    "count",
    "ratio",
    "raw",
  ];
  for (const fmt of formats) {
    const m: BrainOutputMetric = {
      metric: "m",
      value: 1,
      direction: "stable",
      label: "M",
      variable_type: "intensive",
      units: "ratio",
      display_format: fmt,
      source,
    };
    assert.equal(m.display_format, fmt);
  }
});

test("BrainOutputMetric.value accepts number OR string (categoricals carry strings)", () => {
  const source: BrainOutputMetricSource = {
    url: "https://example.test/metric",
    fetched_at: "2026-05-18T00:00:00Z",
    tier: 1,
    citation: "example",
  };
  const numeric: BrainOutputMetric = {
    metric: "count",
    value: 7,
    direction: "stable",
    label: "Count",
    variable_type: "extensive",
    units: "count",
    source,
  };
  const labelish: BrainOutputMetric = {
    metric: "shock_state",
    value: "anomaly",
    direction: "stable",
    label: "Shock state",
    variable_type: "categorical",
    source,
  };
  assert.equal(typeof numeric.value, "number");
  assert.equal(typeof labelish.value, "string");
});

test("BrainOutputMetricSource.citation_ref is optional but typed as string when present", () => {
  const withRef: BrainOutputMetricSource = {
    url: "https://example.test/metric",
    fetched_at: "2026-05-18T00:00:00Z",
    tier: 2,
    citation: "example",
    citation_ref: "s01",
  };
  const withoutRef: BrainOutputMetricSource = {
    url: "https://example.test/metric",
    fetched_at: "2026-05-18T00:00:00Z",
    tier: 2,
    citation: "example",
  };
  assert.equal(withRef.citation_ref, "s01");
  assert.equal(withoutRef.citation_ref, undefined);
});
