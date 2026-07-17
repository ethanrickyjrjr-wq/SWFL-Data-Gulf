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
