// lib/should-i-sell/load-stress-read.test.ts
import { expect, test } from "bun:test";
import { loadSellerStressRead } from "./load-stress-read";

// A fake seller-stress brain mirroring the served shape: the region key_metric, the
// per-ZIP table, and the real caveats block (including the condo caveat that ends with
// an internal `condo-sirs-swfl` cross-reference).
const brain = {
  freshness_token: "SWFL-7421-v8-20260712",
  output: {
    direction: "bearish",
    key_metrics: [
      { metric: "seller_stress_score_swfl", value: 60.9, label: "SWFL median seller stress" },
    ],
    detail_tables: [
      {
        id: "seller_stress_by_zip",
        title: "SWFL seller stress by ZIP — 2026-03-01 (vs 2019–2021 baseline)",
        grain: "zip",
        source: {
          url: "https://www.redfin.com/news/data-center/",
          citation:
            "Redfin Data Center — price_drops, contract_cancellations, delistings_relistings.",
          fetched_at: "2026-07-12T04:17:26Z",
        },
        rows: [
          {
            key: "34145",
            label: "34145",
            cells: {
              seller_stress_score: 83.8,
              share_delisted_pct: 15.63,
              pct_active_with_drops: 47.95,
              cancellation_rate_pct: 12.97,
              share_relisted_pct: 5.64,
            },
          },
          {
            key: "33966",
            label: "33966",
            cells: {
              seller_stress_score: 47.1,
              share_delisted_pct: 6.2,
              pct_active_with_drops: 21.4,
              cancellation_rate_pct: 9.1,
              share_relisted_pct: 3.0,
            },
          },
          {
            key: "34101",
            label: "34101",
            cells: {
              seller_stress_score: null,
              share_delisted_pct: null,
              pct_active_with_drops: null,
              cancellation_rate_pct: null,
              share_relisted_pct: null,
            },
          },
        ],
      },
    ],
    caveats: [
      "~50% of SWFL transactions are all-cash (Lee County, Attom 2024) — rate-sensitive national thresholds do not apply; this score is calibrated to SWFL's own 2019–2021 baseline.",
      "Hurricane Ian (Sept 2022) produced a natural spike; scores from Oct 2022–Mar 2023 reflect forced delistings, not organic seller stress — treat as a labeled distress event, not a trend.",
      "Condo segment is not separated in this score; SB 4-D special assessment delistings inflate stress in condo-heavy ZIPs (e.g., Marco Island corridor). See `condo-sirs-swfl` for the condo-specific read.",
      "3 ZIPs suppressed (insufficient baseline data in 2019–2021 or no recent observations).",
    ],
  },
};

const deps = { loadBrain: async () => brain as never, place: "Marco Island" };

test("relays the region state + this area's rank/vsMedian from the shared authority", async () => {
  const r = await loadSellerStressRead("34145", deps);
  expect(r).not.toBeNull();
  expect(r!.place).toBe("Marco Island");
  expect(r!.scored).toBe(true);
  expect(r!.region).toEqual({
    direction: "bearish",
    stateLabel: "under elevated seller pressure right now",
    median: 60.9,
  });
  expect(r!.area).toEqual({ rank: { position: 1, total: 2 }, vsMedian: "above" });
});

test("drivers are the composite's top 3 in order: delistings, price drops, cancellations", async () => {
  const r = await loadSellerStressRead("34145", deps);
  expect(r!.drivers.map((d) => d.label)[0]).toContain("Delistings");
  expect(r!.drivers[1].label).toContain("Price drops");
  expect(r!.drivers[2].label).toContain("cancellations");
  // delistings first, then price-drop breadth (~48% for 34145 — the loudest signal), then cancellations
  expect(r!.drivers.map((d) => d.valuePct)).toEqual([15.63, 47.95, 12.97]);
});

test("caveats include all-cash + condo, and NEVER leak an internal brain slug", async () => {
  const r = await loadSellerStressRead("34145", deps);
  const joined = r!.caveats.join(" ");
  expect(joined).toContain("all-cash");
  expect(joined.toLowerCase()).toContain("condo");
  expect(joined).toContain("SB 4-D");
  // the internal cross-reference sentence + the slug are stripped
  expect(joined).not.toContain("condo-sirs-swfl");
  expect(joined).not.toContain("`");
  expect(joined).not.toContain("See ");
  // the Hurricane Ian + suppression-count notes are not surfaced as seller caveats
  expect(joined).not.toContain("Hurricane Ian");
  expect(joined).not.toContain("suppressed");
});

test("the two dates are distinct: data period vs last-checked refresh date", async () => {
  const r = await loadSellerStressRead("34145", deps);
  expect(r!.dataThrough).toBe("03/01/2026"); // reading currency (table title)
  expect(r!.lastChecked).toBe("07/12/2026"); // refresh (freshness token)
});

test("a suppressed ZIP still relays region but reports scored=false with no rank", async () => {
  const r = await loadSellerStressRead("34101", deps);
  expect(r!.scored).toBe(false);
  expect(r!.region).not.toBeNull();
  expect(r!.area).toBeNull();
  expect(r!.drivers).toEqual([]);
});

test("a ZIP absent from the table → null (page degrades)", async () => {
  const r = await loadSellerStressRead("00000", deps);
  expect(r).toBeNull();
});
