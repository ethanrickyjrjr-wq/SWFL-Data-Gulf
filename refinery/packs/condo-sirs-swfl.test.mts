import { describe, it, expect } from "vitest";
import type { RawFragment } from "../types/fragment.mts";

describe("condo-sirs-swfl pack", async () => {
  const { condoSirsSwfl } = await import("./condo-sirs-swfl.mts");

  function makeFragment(summary: Record<string, unknown>): RawFragment {
    return {
      fragment_id: "dbpr_sirs_submissions:summary:test",
      source_id: "dbpr_sirs_submissions",
      source_trust_tier: 1,
      fetched_at: "2026-06-01T00:00:00Z",
      raw: {
        kind: "dbpr-sirs-summary",
        sirs_confirmed_swfl: summary.sirs_confirmed_swfl,
      },
      normalized: { kind: "dbpr-sirs-summary", ...summary },
    };
  }

  const fullFixture = makeFragment({
    sirs_confirmed_swfl: 239,
    sirs_lee_count: 80,
    sirs_collier_count: 159,
    sirs_july2025_plus_count: 230,
    result_truncated_any: true,
    latest_scraped_at: "2026-06-01T07:06:53Z",
    fetched_at: "2026-06-01T00:00:00Z",
  });

  it("returns zero-data path when no fragments", () => {
    condoSirsSwfl.corpusSummary!([]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.direction).toBe("neutral");
    expect(result.magnitude).toBe(0);
    expect(result.key_metrics).toHaveLength(0);
  });

  it("emits 5 metrics from a full fixture", () => {
    condoSirsSwfl.corpusSummary!([fullFixture]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.key_metrics).toHaveLength(5);
    expect(result.direction).toBe("neutral");
  });

  it("magnitude scales correctly — 239/280 ≈ 0.85", () => {
    condoSirsSwfl.corpusSummary!([fullFixture]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.magnitude).toBeCloseTo(239 / 280, 2);
  });

  it("magnitude caps at 1.0 when count exceeds floor", () => {
    const highFrag = makeFragment({
      sirs_confirmed_swfl: 400,
      sirs_lee_count: 150,
      sirs_collier_count: 250,
      sirs_july2025_plus_count: 380,
      result_truncated_any: true,
      latest_scraped_at: "2026-06-01T00:00:00Z",
      fetched_at: "2026-06-01T00:00:00Z",
    });
    condoSirsSwfl.corpusSummary!([highFrag]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.magnitude).toBe(1.0);
  });

  it("magnitude scales correctly at half-floor", () => {
    const halfFrag = makeFragment({
      sirs_confirmed_swfl: 140,
      sirs_lee_count: 50,
      sirs_collier_count: 90,
      sirs_july2025_plus_count: 130,
      result_truncated_any: true,
      latest_scraped_at: "2026-06-01T00:00:00Z",
      fetched_at: "2026-06-01T00:00:00Z",
    });
    condoSirsSwfl.corpusSummary!([halfFrag]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.magnitude).toBeCloseTo(0.5, 2);
  });

  it("categorical metric has no units and string value", () => {
    condoSirsSwfl.corpusSummary!([fullFixture]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    const m = result.key_metrics.find((k) => k.metric === "sirs_result_truncated");
    expect(m).toBeDefined();
    expect(m!.units).toBeUndefined();
    expect(m!.variable_type).toBe("categorical");
    expect(typeof m!.value).toBe("string");
  });

  it("every non-categorical metric has units", () => {
    condoSirsSwfl.corpusSummary!([fullFixture]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    for (const m of result.key_metrics) {
      if (m.variable_type !== "categorical") {
        expect(m.units, `${m.metric} missing units`).toBeDefined();
      }
    }
  });

  it("every metric has a non-empty source url and citation at tier 1", () => {
    condoSirsSwfl.corpusSummary!([fullFixture]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    for (const m of result.key_metrics) {
      expect(m.source.url, `${m.metric} missing source.url`).toBeTruthy();
      expect(m.source.citation, `${m.metric} missing source.citation`).toBeTruthy();
      expect(m.source.tier).toBe(1);
    }
  });

  it("conclusion references total count", () => {
    condoSirsSwfl.corpusSummary!([fullFixture]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.conclusion).toContain("239");
  });

  const baselineFixture: RawFragment = {
    fragment_id: "condo_baseline_swfl:summary:test",
    source_id: "condo_baseline_swfl",
    source_trust_tier: 1,
    fetched_at: "2026-08-30T00:00:00Z",
    raw: { kind: "condo-baseline-summary", buildings_lee: 1426, buildings_collier: 926 },
    normalized: {
      kind: "condo-baseline-summary",
      buildings_lee: 1426,
      buildings_collier: 926,
      buildings_with_sirs_lee: 900,
      buildings_with_sirs_collier: 700,
      collier_delinquent: 18,
      collier_cycle_completed: 553,
      collier_not_due: 353,
      xref_total: 1366,
      xref_accepted: 1000,
      xref_llm_tiebreak: 120,
      xref_needs_review: 60,
      xref_unmatched: 306,
      latest_scraped_at: "2026-08-30T05:23:52Z",
      fetched_at: "2026-08-30T00:00:00Z",
    },
  };

  it("with the building baseline: 11 metrics, lower-bound shares, baseline caveats", () => {
    const facts = condoSirsSwfl.corpusSummary!([fullFixture, baselineFixture]);
    expect(facts).toHaveLength(2);
    expect(facts[0].topic).toBe("dbpr_sirs_snapshot");
    expect(facts[1].topic).toBe("condo_baseline_snapshot");

    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.key_metrics).toHaveLength(11);
    const lee = result.key_metrics.find((k) => k.metric === "sirs_matched_share_lee");
    expect(lee!.value).toBeCloseTo(900 / 1426, 4);
    expect(lee!.units).toBe("ratio");
    const review = result.key_metrics.find((k) => k.metric === "sirs_xref_needs_review");
    expect(review!.value).toBe(60);
    for (const m of result.key_metrics) {
      expect(m.source.url, `${m.metric} missing source.url`).toBeTruthy();
      expect(m.source.citation, `${m.metric} missing source.citation`).toBeTruthy();
    }
    expect(result.caveats.some((c) => c.includes("LOWER BOUND"))).toBe(true);
    expect(result.caveats.some((c) => c.includes("PROGRAM-REGISTERED"))).toBe(true);
    expect(result.caveats.some((c) => c.includes("cannot be derived"))).toBe(false);
    expect(result.conclusion).toContain("lower bound");
    expect(result.conclusion).toContain("1,426");
  });

  it("an empty baseline fragment does not unlock baseline metrics", () => {
    const empty: RawFragment = {
      ...baselineFixture,
      normalized: {
        ...(baselineFixture.normalized as object),
        buildings_lee: 0,
        buildings_collier: 0,
      },
    };
    condoSirsSwfl.corpusSummary!([fullFixture, empty]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.key_metrics).toHaveLength(5);
    expect(result.caveats.some((c) => c.includes("cannot be derived"))).toBe(true);
  });

  it("low count triggers 4th caveat", () => {
    const lowFrag = makeFragment({
      sirs_confirmed_swfl: 30,
      sirs_lee_count: 10,
      sirs_collier_count: 20,
      sirs_july2025_plus_count: 25,
      result_truncated_any: false,
      latest_scraped_at: "2026-06-01T00:00:00Z",
      fetched_at: "2026-06-01T00:00:00Z",
    });
    condoSirsSwfl.corpusSummary!([lowFrag]);
    const result = condoSirsSwfl.outputProducer!({} as never);
    expect(result.caveats).toHaveLength(4);
    expect(result.caveats[3]).toContain("very low");
  });
});
