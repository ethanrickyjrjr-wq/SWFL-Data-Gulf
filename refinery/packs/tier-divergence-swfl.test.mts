import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { TierDivergenceZipLatestRow } from "../sources/tier-divergence-zip-latest-source.mts";
import { classifyPolarity, tierDivergenceSwfl } from "./tier-divergence-swfl.mts";
import {
  buildTierDivergenceSnapshots,
  type TierDivergenceRawRow,
} from "./_tier-divergence-oracle.mts";
import { env } from "../config/env.mts";

// ── classifyPolarity (pure) — the POLARITY AUDIT, MUST-FIX #1 ─────────────────
// DEADBAND = 1.0. spread widening OR starter falling = bearish; spread
// compressing AND starter rising = bullish; else neutral. top NEVER votes.

describe("tier-divergence-swfl classifyPolarity (locked polarity audit)", () => {
  it("spread widening past deadband -> bearish", () => {
    const v = classifyPolarity(3.0, 0);
    expect(v.direction).toBe("bearish");
  });

  it("starter tier falling past deadband -> bearish (even if spread flat)", () => {
    const v = classifyPolarity(0, -3.0);
    expect(v.direction).toBe("bearish");
  });

  it("spread compressing AND starter rising -> bullish (the fracture healing)", () => {
    const v = classifyPolarity(-3.0, 3.0);
    expect(v.direction).toBe("bullish");
  });

  it("within the deadband -> neutral", () => {
    const v = classifyPolarity(0.5, 0.5);
    expect(v.direction).toBe("neutral");
  });

  it("null spread AND null bottom -> neutral, magnitude 0", () => {
    const v = classifyPolarity(null, null);
    expect(v.direction).toBe("neutral");
    expect(v.magnitude).toBe(0);
    expect(v.caveats.length).toBeGreaterThan(0);
  });

  it("magnitude clamps to 1 on an extreme spread YoY", () => {
    expect(classifyPolarity(50, 0).magnitude).toBe(1);
  });
});

// ── oracle: raw rows -> per-ZIP spread + YoY (local parity sanity) ────────────

function makeRaw(
  zip: string,
  period_end: string,
  top: number | null,
  bottom: number | null,
): TierDivergenceRawRow {
  return {
    zip_code: zip,
    period_end,
    top_tier_value: top,
    bottom_tier_value: bottom,
    metro: "Cape Coral-Fort Myers, FL",
    county_name: "Lee County",
    city: "Cape Coral",
  };
}

describe("tier-divergence oracle (buildTierDivergenceSnapshots)", () => {
  it("computes spread + signed YoY for a two-point both-tier ZIP", () => {
    const rows = [
      makeRaw("33914", "2025-04-30", 680000, 287000),
      makeRaw("33914", "2026-04-30", 700000, 280000),
    ];
    const snaps = buildTierDivergenceSnapshots(rows);
    expect(snaps.length).toBe(1);
    const s = snaps[0]!;
    expect(s.latest_period).toBe("2026-04-30");
    expect(s.tier_spread_ratio).toBeCloseTo(2.5, 5);
    // luxury up ~2.9%, starter down ~2.4% -> spread widening (positive), K-shape.
    expect(s.top_tier_yoy_pct!).toBeGreaterThan(0);
    expect(s.bottom_tier_yoy_pct!).toBeLessThan(0);
    expect(s.tier_spread_yoy_pct!).toBeGreaterThan(0);
  });

  it("drops a ZIP that never carries both tiers (held-out set)", () => {
    const rows = [
      makeRaw("33972", "2025-04-30", 500000, null),
      makeRaw("33972", "2026-04-30", 520000, null),
    ];
    expect(buildTierDivergenceSnapshots(rows).length).toBe(0);
  });

  it("YoY is null when no ±7d look-back partner exists", () => {
    const snaps = buildTierDivergenceSnapshots([makeRaw("34102", "2026-04-30", 3000000, 600000)]);
    expect(snaps[0]!.tier_spread_yoy_pct).toBeNull();
    expect(snaps[0]!.bottom_tier_yoy_pct).toBeNull();
  });

  it("tier_spread_ratio LEVEL is the 3-CALENDAR-month trailing avg (excludes the 4th month back)", () => {
    const rows = [
      // Jan-31 = exactly 3 calendar months before the Apr-30 anchor → MUST be excluded.
      // Regression lock for the 2026-06-14 window bug: the old `- 3 months - 7 days`
      // window resolved to > Jan-23 and silently averaged Jan..Apr (4 months).
      makeRaw("33914", "2026-01-31", 120000, 350000),
      makeRaw("33914", "2026-02-28", 600000, 300000),
      makeRaw("33914", "2026-03-31", 660000, 290000),
      makeRaw("33914", "2026-04-30", 720000, 280000), // anchor (latest)
    ];
    const s = buildTierDivergenceSnapshots(rows)[0]!;
    // 3-calendar-month avg = Feb/Mar/Apr ONLY: top (600k+660k+720k)/3 = 660k;
    // bottom (300k+290k+280k)/3 = 290k. The Jan row is outside the window.
    expect(s.top_tier_value_3m_avg).toBeCloseTo(660000, 4);
    expect(s.bottom_tier_value_3m_avg).toBeCloseTo(290000, 4);
    expect(s.tier_spread_ratio).toBeCloseTo(660000 / 290000, 6); // 2.2759 (smoothed)
    // NOT the buggy 4-month avg (top 525k / bottom 305k ≈ 1.721).
    expect(s.top_tier_value_3m_avg).not.toBeCloseTo((120000 + 600000 + 660000 + 720000) / 4, 0);
    // NOT the raw latest-month ratio 720000/280000 = 2.571 — proves smoothing.
    expect(s.tier_spread_ratio).not.toBeCloseTo(720000 / 280000, 3);
  });
});

// ── outputProducer — end-to-end through the corpusSummary handoff ─────────────

function fragmentsFrom(rows: TierDivergenceZipLatestRow[]) {
  return rows.map((row) => ({
    fragment_id: `test_${row.zip_code}`,
    source_id: "tier_divergence_zip_latest",
    source_trust_tier: 3 as const,
    fetched_at: "2026-05-23T12:00:00Z",
    raw: { zip_code: row.zip_code, latest_period: row.latest_period } as Record<string, unknown>,
    normalized: row,
  }));
}

function row(
  zip: string,
  spread: number,
  spread_yoy: number | null,
  bottom_yoy: number | null,
  top_yoy: number | null,
): TierDivergenceZipLatestRow {
  return {
    zip_code: zip,
    metro: "Cape Coral-Fort Myers, FL",
    county_name: "Lee County",
    city: "Cape Coral",
    latest_period: "2026-04-30",
    top_tier_value_latest: 700000,
    bottom_tier_value_latest: 280000,
    top_tier_value_3m_avg: 700000,
    bottom_tier_value_3m_avg: 280000,
    tier_spread_ratio: spread,
    tier_spread_yoy_pct: spread_yoy,
    bottom_tier_yoy_pct: bottom_yoy,
    top_tier_yoy_pct: top_yoy,
  };
}

function runProducer(rows: TierDivergenceZipLatestRow[]) {
  tierDivergenceSwfl.corpusSummary!(fragmentsFrom(rows));
  return tierDivergenceSwfl.outputProducer!({} as never);
}

describe("tier-divergence-swfl outputProducer (fixture mode)", () => {
  const orig = env.source;
  beforeAll(() => {
    process.env.REFINERY_SOURCE = "fixture";
  });
  afterAll(() => {
    process.env.REFINERY_SOURCE = orig === "fixture" ? "fixture" : undefined!;
  });

  it("MUST-FIX #1: a soaring luxury tier does NOT make the brain bullish", () => {
    // spread + starter both inside the deadband, top tier +20% -> still neutral.
    const result = runProducer([
      row("33914", 2.5, 0.3, 0.2, 20),
      row("33990", 1.4, 0.4, 0.1, 18),
      row("33901", 1.8, -0.2, 0.3, 25),
    ]);
    expect(result.direction).toBe("neutral");
  });

  it("widening spread + falling starter -> bearish", () => {
    const result = runProducer([
      row("33914", 2.5, 3.0, -2.5, 1.0),
      row("34102", 5.0, 5.0, -4.0, 2.0),
      row("33931", 3.0, 8.0, -6.0, 1.5),
    ]);
    expect(result.direction).toBe("bearish");
  });

  it("counts ZIPs in K-shape (luxury >=0, starter <0)", () => {
    const result = runProducer([
      row("33914", 2.5, 3.0, -2.5, 1.0), // K-shape
      row("34102", 5.0, 5.0, -4.0, 2.0), // K-shape
      row("33901", 1.8, -2.0, 3.0, 1.0), // healing, not K-shape
    ]);
    const k = result.key_metrics.find((m) => m.metric === "tier_kshape_zip_count_swfl");
    expect(k?.value).toBe(2);
  });

  it("emits the 5 headline slugs incl. informational top-tier YoY", () => {
    const result = runProducer([row("33914", 2.5, 3.0, -2.5, 1.0)]);
    const ids = result.key_metrics.map((m) => m.metric);
    expect(ids).toContain("tier_spread_yoy_pct_swfl");
    expect(ids).toContain("tier_spread_ratio_swfl");
    expect(ids).toContain("tier_bottom_yoy_pct_swfl");
    expect(ids).toContain("tier_top_yoy_pct_swfl");
    expect(ids).toContain("tier_kshape_zip_count_swfl");
  });

  it("emits per-ZIP pattern slugs for the widest fractures", () => {
    const result = runProducer([
      row("33914", 2.5, 3.0, -2.5, 1.0),
      row("34102", 5.0, 5.0, -4.0, 2.0),
      row("33931", 3.0, 8.0, -6.0, 1.5),
    ]);
    const perZip = result.key_metrics.filter((m) =>
      /^tier_spread_yoy_pct_zip_\d{5}$/.test(m.metric),
    );
    expect(perZip.length).toBeGreaterThan(0);
  });

  it("every key_metric carries a populated tier-3 source block", () => {
    const result = runProducer([row("33914", 2.5, 3.0, -2.5, 1.0)]);
    for (const m of result.key_metrics) {
      expect(m.source).toBeDefined();
      expect(m.source.url).toMatch(/zillowstatic\.com|fixture/i);
      expect(m.source.tier).toBe(3);
      expect(typeof m.source.fetched_at).toBe("string");
    }
  });

  it("always carries the RAW (not SA) + cash-buyer caveats", () => {
    const result = runProducer([row("33914", 2.5, 3.0, -2.5, 1.0)]);
    expect(result.caveats.some((c) => /not seasonally adjusted|RAW/i.test(c))).toBe(true);
    expect(result.caveats.some((c) => /cash/i.test(c))).toBe(true);
  });

  it("emits a tier_divergence_by_zip detail_table keyed by zip", () => {
    const result = runProducer([
      row("33914", 2.5, 3.0, -2.5, 1.0),
      row("34102", 5.0, 5.0, -4.0, 2.0),
    ]);
    const dt = result.detail_tables?.find((t) => t.id === "tier_divergence_by_zip");
    expect(dt).toBeDefined();
    expect(dt!.grain).toBe("zip");
    expect(dt!.rows.length).toBe(2);
    expect(dt!.rows[0]!.cells).toHaveProperty("spread_ratio");
    expect(dt!.rows[0]!.cells).toHaveProperty("kshape");
  });

  it("does NOT set confidence (Stage 4 owns it)", () => {
    const result = runProducer([row("33914", 2.5, 3.0, -2.5, 1.0)]);
    expect((result as { confidence?: number }).confidence).toBeUndefined();
  });
});

// ── PackDefinition contract ──────────────────────────────────────────────────

describe("tier-divergence-swfl PackDefinition", () => {
  it("declares the locked id, domain, and single tier-3 source", () => {
    expect(tierDivergenceSwfl.id).toBe("tier-divergence-swfl");
    expect(tierDivergenceSwfl.brain_id).toBe("tier-divergence-swfl");
    expect(tierDivergenceSwfl.domain).toBe("real-estate");
    expect(tierDivergenceSwfl.input_brains).toEqual([]);
    expect(tierDivergenceSwfl.sources.length).toBe(1);
    expect(tierDivergenceSwfl.sources[0]!.trust_tier).toBe(3);
  });

  it("is a deterministic leaf — no LLM triage or synthesis", () => {
    expect(tierDivergenceSwfl.skipTriageAgent).toBe(true);
    expect(tierDivergenceSwfl.skipSynthesisAgent).toBe(true);
  });
});
