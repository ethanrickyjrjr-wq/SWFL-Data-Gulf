import { test, expect, mock, afterAll } from "bun:test";
import { filterOutputToZips, computeMetricChart } from "@/refinery/lib/chart-from-metrics.mts";
import * as fetchBrainModule from "@/lib/fetch-brain";
import type { BrainOutput } from "@/refinery/types/brain-output.mts";

// Bun's mock.module is process-global and mock.restore() does NOT undo it. Snapshot the
// real module and re-install it in afterAll, or this stub leaks into every later file
// that imports fetch-brain for real (conversation-path.test.ts among them).
const ORIG_FETCH_BRAIN = { ...fetchBrainModule };
afterAll(() => {
  mock.module("@/lib/fetch-brain", () => ORIG_FETCH_BRAIN);
});

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

// --- Which brain does a prompt actually reach? (the AI-authored email chart) ---
//
// `lib/email/build-doc.ts` buildPromptChart hands the user's prompt straight to
// buildChartForQuestion, which routes through resolveReachTargets. Before 07/09/2026 the
// router had no rule for heat or inventory, so an email prompt about either fell to
// CHART_FALLBACKS[0] = housing-swfl and rendered a median-sale-price bar — the wrong
// column, silently. This pins the slug the producer fetches, which is the whole fix.
// (This assertion cannot live in build-doc.test.ts: that file module-mocks
// buildChartForQuestion to null for its entire run.)

const fetched: string[] = [];
mock.module("@/lib/fetch-brain", () => ({
  ...ORIG_FETCH_BRAIN,
  fetchBrain: async (slug: string) => {
    fetched.push(slug);
    throw new Error("no network in this test — we only assert the routing decision");
  },
}));
const { buildChartForQuestion } = await import("./chart-for-question");

test("an inventory-tightening prompt reaches market-heat-swfl, not the price fallback", async () => {
  fetched.length = 0;
  await buildChartForQuestion("a chart of inventory tightening by corridor", "https://x");
  expect(fetched).toContain("market-heat-swfl");
  expect(fetched[0]).not.toBe("housing-swfl"); // the old silent-wrong-column fallback
});

test("a heat prompt reaches market-heat-swfl", async () => {
  fetched.length = 0;
  await buildChartForQuestion("which corridors are heating up?", "https://x");
  expect(fetched).toContain("market-heat-swfl");
});

test("an unroutable prompt still falls back rather than charting nothing", async () => {
  fetched.length = 0;
  await buildChartForQuestion("add a chart", "https://x");
  expect(fetched[0]).toBe("housing-swfl"); // CHART_FALLBACKS[0] — the intended fallback lane
});
