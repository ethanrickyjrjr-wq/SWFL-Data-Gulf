// lib/back-on-market/load-zip.test.ts
import { expect, test } from "bun:test";
import { loadBackOnMarketZip } from "./load-zip";

// A minimal fake seller-stress brain: one scored ZIP (33904), one suppressed (33999).
const fakeBrain = {
  output: {
    detail_tables: [
      {
        id: "seller_stress_by_zip",
        title: "SWFL seller stress by ZIP — 2026-03-01 (vs 2019–2021 baseline)",
        source: {
          url: "https://www.redfin.com/news/data-center/",
          citation:
            "Redfin Data Center — price_drops, contract_cancellations, delistings_relistings.",
          fetched_at: "2026-07-12T04:17:26Z",
        },
        rows: [
          {
            key: "33904",
            label: "33904",
            cells: {
              cancellation_rate_pct: 14.2,
              share_relisted_pct: 6.1,
              share_delisted_pct: 11.8,
              seller_stress_score: 71,
            },
          },
          {
            key: "33999",
            label: "33999",
            cells: {
              cancellation_rate_pct: null,
              share_relisted_pct: null,
              share_delisted_pct: null,
              seller_stress_score: null,
            },
          },
        ],
      },
    ],
  },
};
const deps = { loadBrain: async () => fakeBrain as never, place: "Cape Coral" };

test("reads a scored ZIP's rates + as-of from the seller-stress table", async () => {
  const r = await loadBackOnMarketZip("33904", deps);
  expect(r).not.toBeNull();
  expect(r!.cancellationRatePct).toBe(14.2);
  expect(r!.relistRatePct).toBe(6.1);
  expect(r!.delistRatePct).toBe(11.8);
  expect(r!.asOf).toBe("03/01/2026"); // parsed from the table title, MM/DD/YYYY
  expect(r!.source.label).toContain("Redfin");
});

test("a suppressed ZIP returns the row with null rates (never a guessed number)", async () => {
  const r = await loadBackOnMarketZip("33999", deps);
  expect(r).not.toBeNull();
  expect(r!.cancellationRatePct).toBeNull();
});

test("a ZIP absent from the table returns null (caller degrades)", async () => {
  const r = await loadBackOnMarketZip("00000", deps);
  expect(r).toBeNull();
});

// Region/area ranking — folded in from the former lib/seller-stress/read.ts (07/17/2026
// reconciliation). Same 5-ZIP fixture shape that module's tests used.
const rankedBrain = {
  output: {
    direction: "bearish",
    key_metrics: [
      {
        metric: "seller_stress_score_swfl",
        value: 60.9,
        label: "SWFL median seller stress score (0-100) at 2026-03-01 — 52 ZIPs scored",
      },
    ],
    detail_tables: [
      {
        id: "seller_stress_by_zip",
        title: "SWFL seller stress by ZIP — 2026-03-01 (vs 2019–2021 baseline)",
        source: {
          url: "https://www.redfin.com/news/data-center/",
          citation:
            "Redfin Data Center — price_drops, contract_cancellations, delistings_relistings.",
          fetched_at: "2026-07-12T04:17:26Z",
        },
        rows: [
          { key: "34145", label: "34145", cells: { seller_stress_score: 83.8 } },
          { key: "33904", label: "33904", cells: { seller_stress_score: 65.2 } },
          { key: "33912", label: "33912", cells: { seller_stress_score: 53.5 } },
          { key: "33966", label: "33966", cells: { seller_stress_score: 47.1 } },
          { key: "34101", label: "34101", cells: { seller_stress_score: null } },
        ],
      },
    ],
  },
};
const rankedDeps = { loadBrain: async () => rankedBrain as never };

test("relays the region's published direction + median unchanged (no re-banding)", async () => {
  const r = await loadBackOnMarketZip("34145", rankedDeps);
  expect(r!.region).toEqual({
    direction: "bearish",
    stateLabel: "under elevated seller pressure right now",
    median: 60.9,
  });
});

test("ranks the top-stress ZIP first and reports vsMedian=above", async () => {
  const r = await loadBackOnMarketZip("34145", rankedDeps);
  expect(r!.stressScore).toBe(83.8);
  expect(r!.area).toEqual({ rank: { position: 1, total: 4 }, vsMedian: "above" });
});

test("reports vsMedian=below for a low-stress ZIP", async () => {
  const r = await loadBackOnMarketZip("33966", rankedDeps);
  expect(r!.area).toEqual({ rank: { position: 4, total: 4 }, vsMedian: "below" });
});

test("a suppressed ZIP still relays region but reports null area", async () => {
  const r = await loadBackOnMarketZip("34101", rankedDeps);
  expect(r!.stressScore).toBeNull();
  expect(r!.region).not.toBeNull();
  expect(r!.area).toBeNull();
});

test("no region/area when the brain carries no key_metrics (e.g. minimal fixture)", async () => {
  const r = await loadBackOnMarketZip("33904", deps);
  expect(r!.region).toBeNull();
  expect(r!.area).toBeNull();
});
