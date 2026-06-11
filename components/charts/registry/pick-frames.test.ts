import { describe, it, expect } from "bun:test";
import { pickFramesForData } from "./pick-frames";
import type { BrainOutputDetailTable, BrainOutputMetric } from "@/refinery/types/brain-output.mts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TIME_SERIES_TABLE: BrainOutputDetailTable = {
  grain: "month",
  columns: [
    { id: "date", label: "Month" },
    { id: "value", label: "Index", display_format: "raw" },
  ],
  rows: [
    { label: "2025-01", cells: { date: "2025-01", value: 102.1 } },
    { label: "2025-02", cells: { date: "2025-02", value: 104.5 } },
    { label: "2025-03", cells: { date: "2025-03", value: 108.0 } },
  ],
};

const RANKED_TABLE: BrainOutputDetailTable = {
  grain: "zip",
  columns: [
    { id: "zip", label: "ZIP" },
    { id: "aal_usd", label: "AAL ($)", display_format: "currency" },
  ],
  rows: [
    { label: "33901", cells: { zip: "33901", aal_usd: 12000 } },
    { label: "33908", cells: { zip: "33908", aal_usd: 30074 } },
    { label: "33931", cells: { zip: "33931", aal_usd: 18500 } },
  ],
};

const TWO_NUMERIC_TABLE: BrainOutputDetailTable = {
  grain: "corridor",
  columns: [
    { id: "corridor", label: "Corridor" },
    { id: "vacancy_rate", label: "Vacancy %", display_format: "percent" },
    { id: "asking_rent", label: "Asking Rent ($)", display_format: "currency" },
  ],
  rows: [
    { label: "Bonita", cells: { corridor: "Bonita", vacancy_rate: 0.04, asking_rent: 18.5 } },
    { label: "Airport", cells: { corridor: "Airport", vacancy_rate: 0.06, asking_rent: 22.0 } },
    { label: "Estero", cells: { corridor: "Estero", vacancy_rate: 0.03, asking_rent: 20.5 } },
  ],
};

const PERCENT_METRICS: BrainOutputMetric[] = [
  {
    metric: "sfha_pct",
    label: "SFHA zone",
    value: 0.19,
    display_format: "percent",
    variable_type: "intensive",
    units: "ratio",
    source: { citation: "FEMA" },
  },
  {
    metric: "ve_zone_pct",
    label: "V/VE zone",
    value: 0.031,
    display_format: "percent",
    variable_type: "intensive",
    units: "ratio",
    source: { citation: "FEMA" },
  },
  {
    metric: "non_sfha_pct",
    label: "Non-SFHA",
    value: 0.779,
    display_format: "percent",
    variable_type: "intensive",
    units: "ratio",
    source: { citation: "FEMA" },
  },
];

const SINGLE_METRIC: BrainOutputMetric[] = [
  {
    metric: "post_ian_recovery",
    label: "Post-Ian Recovery",
    value: 108.1,
    display_format: "raw",
    variable_type: "intensive",
    units: "index (2022=100)",
    source: { citation: "FDOT" },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("pickFramesForData", () => {
  it("time-series table → includes zhvi-area frame", () => {
    const result = pickFramesForData([TIME_SERIES_TABLE], []);
    const frameIds = result.map((r) => r.frameId);
    expect(frameIds).toContain("zhvi-area");
  });

  it("ranked table (single numeric col) → includes bar-table frame", () => {
    const result = pickFramesForData([RANKED_TABLE], []);
    const frameIds = result.map((r) => r.frameId);
    expect(frameIds).toContain("bar-table");
  });

  it("two-numeric-column table → includes corridor-scatter frame", () => {
    const result = pickFramesForData([TWO_NUMERIC_TABLE], []);
    const frameIds = result.map((r) => r.frameId);
    expect(frameIds).toContain("corridor-scatter");
  });

  it("percent key_metrics summing to ~1.0 → includes composition frame", () => {
    const result = pickFramesForData(undefined, PERCENT_METRICS);
    const frameIds = result.map((r) => r.frameId);
    expect(frameIds).toContain("composition");
  });

  it("single numeric metric → includes z-gauge frame", () => {
    const result = pickFramesForData(undefined, SINGLE_METRIC);
    const frameIds = result.map((r) => r.frameId);
    expect(frameIds).toContain("z-gauge");
  });

  it("empty input → empty result (no crash)", () => {
    expect(pickFramesForData(undefined, [])).toEqual([]);
    expect(pickFramesForData([], [])).toEqual([]);
  });

  it("all results carry a non-empty reason string", () => {
    const result = pickFramesForData([RANKED_TABLE], []);
    for (const r of result) {
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it("detail_tables take priority over key_metrics (no key_metric fallback when table qualifies)", () => {
    // Table qualifies → key_metric shapes should not be inferred
    const result = pickFramesForData([RANKED_TABLE], SINGLE_METRIC);
    const frameIds = result.map((r) => r.frameId);
    // Should include bar (from table), but z-gauge (from single metric) should NOT appear
    // because we only fall back to key_metrics when table shapes is empty
    expect(frameIds).toContain("bar-table");
    expect(frameIds).not.toContain("z-gauge");
  });
});
