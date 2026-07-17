import { describe, it, expect } from "bun:test";
import { buildSellerStressRead, REGION_STATE_LABEL } from "./read";
import type { BrainOutput } from "../../refinery/types/brain-output.mts";

// Minimal published-output fixture: 4 scored ZIPs + 1 suppressed, region median metric,
// three caveats (all-cash + condo-SIRS/Marco + suppressed count). Numbers are frozen so
// the test never depends on the live brain rebuild.
const source = {
  url: "https://www.redfin.com/news/data-center/",
  fetched_at: "2026-07-12T04:17:24Z",
  tier: 3,
  citation: "Redfin Data Center — price_drops, contract_cancellations, delistings_relistings.",
};

const FIXTURE: BrainOutput = {
  brain_id: "seller-stress-swfl",
  direction: "bearish",
  magnitude: 0.52,
  conclusion: "SWFL seller stress is elevated at 61/100.",
  key_metrics: [
    {
      metric: "seller_stress_score_swfl",
      value: 60.9,
      direction: "rising",
      label: "SWFL median seller stress score (0-100) at 2026-03-01 — 52 ZIPs scored",
      variable_type: "intensive",
      units: "score (0-100)",
      display_format: "raw",
      source,
    },
  ],
  detail_tables: [
    {
      id: "seller_stress_by_zip",
      title: "SWFL seller stress by ZIP — 2026-03-01 (vs 2019–2021 baseline)",
      grain: "zip",
      columns: [],
      rows: [
        {
          key: "34145",
          label: "34145",
          cells: {
            seller_stress_score: 83.8,
            share_delisted_pct: 15.63,
            pct_active_with_drops: 47.95,
            cancellation_rate_pct: 12.97,
            avg_price_drop_pct: 4.7,
            share_relisted_pct: 5.64,
            periods_scored: 12,
            baseline_suppressed: false,
          },
        },
        {
          key: "33904",
          label: "33904",
          cells: {
            seller_stress_score: 65.2,
            share_delisted_pct: 15.51,
            pct_active_with_drops: 44.66,
            cancellation_rate_pct: 20.71,
            avg_price_drop_pct: 4.43,
            share_relisted_pct: 7.86,
            periods_scored: 12,
            baseline_suppressed: false,
          },
        },
        {
          key: "33912",
          label: "33912",
          cells: {
            seller_stress_score: 53.5,
            share_delisted_pct: 15.3,
            pct_active_with_drops: 47.7,
            cancellation_rate_pct: 7.08,
            avg_price_drop_pct: 4.96,
            share_relisted_pct: 3.83,
            periods_scored: 12,
            baseline_suppressed: false,
          },
        },
        {
          key: "33966",
          label: "33966",
          cells: {
            seller_stress_score: 47.1,
            share_delisted_pct: 14.63,
            pct_active_with_drops: 53.16,
            cancellation_rate_pct: 4.26,
            avg_price_drop_pct: 3.91,
            share_relisted_pct: 4.22,
            periods_scored: 12,
            baseline_suppressed: false,
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
            avg_price_drop_pct: null,
            share_relisted_pct: null,
            periods_scored: 0,
            baseline_suppressed: true,
          },
        },
      ],
      source,
    },
  ],
  caveats: [
    "~50% of SWFL transactions are all-cash (Lee County, Attom 2024) — rate-sensitive national thresholds do not apply; this score is calibrated to SWFL's own 2019–2021 baseline.",
    "Hurricane Ian (Sept 2022) produced a natural spike; scores from Oct 2022–Mar 2023 reflect forced delistings, not organic seller stress — treat as a labeled distress event, not a trend.",
    "Condo segment is not separated in this score; SB 4-D special assessment delistings inflate stress in condo-heavy ZIPs (e.g., Marco Island corridor). See condo-sirs-swfl for the condo-specific read.",
    "3 ZIPs suppressed (insufficient baseline data in 2019–2021 or no recent observations).",
  ],
  contradicts: [],
  exogenous_signals: [],
} as unknown as BrainOutput;

describe("buildSellerStressRead — region + area", () => {
  it("relays the brain direction unchanged (no re-banding)", () => {
    const r = buildSellerStressRead({
      zip: "34145",
      place: "Marco Island",
      output: FIXTURE,
      freshnessToken: "SWFL-7421-v8-20260712",
    })!;
    expect(r.region.direction).toBe("bearish");
    expect(r.region.stateLabel).toBe(REGION_STATE_LABEL.bearish);
    expect(r.region.median).toBe(60.9);
  });

  it("ranks the top-stress ZIP first and reports vsMedian=above", () => {
    const r = buildSellerStressRead({
      zip: "34145",
      place: "Marco Island",
      output: FIXTURE,
      freshnessToken: "SWFL-7421-v8-20260712",
    })!;
    expect(r.scored).toBe(true);
    expect(r.area).not.toBeNull();
    expect(r.area!.score).toBe(83.8);
    expect(r.area!.rank).toEqual({ position: 1, total: 4 });
    expect(r.area!.vsMedian).toBe("above");
  });

  it("reports vsMedian=below for a low-stress ZIP", () => {
    const r = buildSellerStressRead({
      zip: "33966",
      place: "Fort Myers",
      output: FIXTURE,
      freshnessToken: "SWFL-7421-v8-20260712",
    })!;
    expect(r.area!.rank).toEqual({ position: 4, total: 4 });
    expect(r.area!.vsMedian).toBe("below");
  });

  it("marks a suppressed ZIP scored=false with null area", () => {
    const r = buildSellerStressRead({
      zip: "34101",
      place: "Naples",
      output: FIXTURE,
      freshnessToken: "SWFL-7421-v8-20260712",
    })!;
    expect(r.scored).toBe(false);
    expect(r.area).toBeNull();
  });

  it("returns null when the ZIP is absent from the table", () => {
    const r = buildSellerStressRead({
      zip: "99999",
      place: null,
      output: FIXTURE,
      freshnessToken: "SWFL-7421-v8-20260712",
    });
    expect(r).toBeNull();
  });
});
