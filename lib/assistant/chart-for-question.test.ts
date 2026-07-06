import { test, expect } from "bun:test";
import { filterOutputToZips, computeMetricChart } from "@/refinery/lib/chart-from-metrics.mts";
import type { BrainOutput } from "@/refinery/types/brain-output.mts";

// buildChartForQuestion itself fetches brains over the network (fetchBrain), so the
// live route is covered by the *_live_verify check. Here we pin the COMPOSITION seam
// the opt-in { zips } path relies on — the same filter + producer wiring, importable
// across the lib/ ↔ refinery/ alias boundary — so a broken import or a regressed
// filter reddens here instead of silently shipping a wrong-city chart.
function swflByZip(): BrainOutput {
  return {
    refined_at: "2026-07-06T00:00:00.000Z",
    key_metrics: [],
    detail_tables: [
      {
        id: "by_zip",
        title: "Median list price by ZIP",
        grain: "zip",
        columns: [
          { id: "v", label: "Median list price", display_format: "currency", units: "USD" },
        ],
        rows: [
          { key: "33904", label: "33904", cells: { v: 410000 } }, // Cape Coral
          { key: "33914", label: "33914", cells: { v: 560000 } }, // Cape Coral
          { key: "33990", label: "33990", cells: { v: 380000 } }, // Cape Coral
          { key: "34102", label: "34102", cells: { v: 2200000 } }, // Naples — drop
          { key: "34145", label: "34145", cells: { v: 1500000 } }, // Marco — drop
        ],
      },
    ],
  } as unknown as BrainOutput;
}

const CAPE_ZIPS = ["33904", "33909", "33914", "33990", "33991", "33993"];

test("scoped path charts only the city's ZIPs (filter + detailTablesOnly)", () => {
  const scoped = filterOutputToZips(swflByZip(), CAPE_ZIPS);
  const chart = computeMetricChart(scoped, { detailTablesOnly: true });
  expect(chart).not.toBeNull();
  expect(chart!.rows.map((r) => r[0])).toEqual(["33904", "33914", "33990"]);
  // The dropped region ZIPs never reach the chart the model is grounded on.
  expect(JSON.stringify(chart)).not.toContain("34102");
  expect(JSON.stringify(chart)).not.toContain("2200000");
});

test("default path (no zips) leaves the output untouched — the chat-regression seam", () => {
  const o = swflByZip();
  expect(filterOutputToZips(o, [])).toBe(o); // identity → chat's computeMetricChart(output) is unchanged
});
