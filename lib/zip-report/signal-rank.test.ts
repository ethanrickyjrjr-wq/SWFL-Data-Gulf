// lib/zip-report/signal-rank.test.ts
import { describe, expect, test } from "bun:test";
import { percentileOf, rankSignals, sampleThinCaveat, type SignalCandidate } from "./signal-rank";

function cand(over: Partial<SignalCandidate>): SignalCandidate {
  return {
    key: "x",
    label: "X",
    display: "1",
    percentile: null,
    movementPct: null,
    covered: true,
    ...over,
  };
}

describe("percentileOf", () => {
  test("max value → 100th percentile, rank #1 of N", () => {
    const r = percentileOf([100, 200, 300, 400], 400)!;
    expect(r.percentile).toBe(100);
    expect(r.rankPos).toBe(1);
    expect(r.rankOf).toBe(4);
  });
  test("min value → 0th percentile, last rank", () => {
    const r = percentileOf([100, 200, 300, 400], 100)!;
    expect(r.percentile).toBe(0);
    expect(r.rankPos).toBe(4);
  });
  test("empty distribution → null", () => {
    expect(percentileOf([], 5)).toBeNull();
  });
});

describe("rankSignals", () => {
  test("extremity-led winner: 98th-percentile flood beats mid-pack price; why = rank text", () => {
    const ranked = rankSignals([
      cand({ key: "median_sale_price", percentile: 60, rankPos: 23, rankOf: 57 }),
      cand({ key: "flood_aal", percentile: 98, rankPos: 2, rankOf: 57 }),
    ]);
    expect(ranked[0].key).toBe("flood_aal");
    expect(ranked[0].why).toBe("#2 of 57 SWFL ZIPs");
  });

  test("movement-led winner: +18% YoY beats a quieter more-extreme metric; why = movement text", () => {
    const ranked = rankSignals([
      cand({ key: "median_dom", percentile: 70, rankPos: 17, rankOf: 57 }),
      cand({
        key: "median_sale_price",
        percentile: 55,
        rankPos: 26,
        rankOf: 57,
        movementPct: 18,
        movementText: "↑ 18% YoY",
      }),
    ]);
    expect(ranked[0].key).toBe("median_sale_price");
    expect(ranked[0].why).toBe("↑ 18% YoY");
  });

  test("uncovered candidates are excluded — they never compete", () => {
    const ranked = rankSignals([
      cand({ key: "permits_90d", percentile: 99, covered: false }),
      cand({ key: "median_sale_price", percentile: 51 }),
    ]);
    expect(ranked.map((r) => r.key)).toEqual(["median_sale_price"]);
  });

  test("deterministic tie-break follows SIGNAL_PRIORITY order", () => {
    const ranked = rankSignals([
      cand({ key: "median_dom", percentile: 80 }),
      cand({ key: "flood_aal", percentile: 80 }),
      cand({ key: "median_sale_price", percentile: 80 }),
    ]);
    expect(ranked.map((r) => r.key)).toEqual(["flood_aal", "median_sale_price", "median_dom"]);
  });

  test("movement is capped at 1 (|yoy|/20): 40% YoY does not double-count", () => {
    const a = rankSignals([cand({ key: "a", movementPct: 40 })])[0];
    const b = rankSignals([cand({ key: "b", movementPct: 20 })])[0];
    expect(a.score).toBeCloseTo(b.score, 10);
  });
});

describe("rankSignals — sampleThin guard (the 33993 one-permit crowning, 07/12/2026)", () => {
  test("a sampleThin candidate at percentile 0 cannot outrank a modest real signal", () => {
    const ranked = rankSignals([
      cand({ key: "permits_90d", percentile: 0, rankPos: 23, rankOf: 23, sampleThin: true }),
      cand({ key: "median_sale_price", percentile: 60, rankPos: 23, rankOf: 57 }),
    ]);
    expect(ranked[0].key).toBe("median_sale_price");
  });

  test("sampleThin zeroes extremity but held movement still counts", () => {
    const thin = rankSignals([
      cand({
        key: "a",
        percentile: 0,
        sampleThin: true,
        movementPct: 10,
        movementText: "↑ 10% YoY",
      }),
    ])[0];
    const moveOnly = rankSignals([
      cand({ key: "a", movementPct: 10, movementText: "↑ 10% YoY" }),
    ])[0];
    expect(thin.score).toBeCloseTo(moveOnly.score, 10);
  });

  test("sampleThin still displays: rank/percentile fields pass through untouched", () => {
    const r = rankSignals([
      cand({ key: "a", percentile: 0, rankPos: 23, rankOf: 23, sampleThin: true }),
    ])[0];
    expect(r.rankPos).toBe(23);
    expect(r.rankOf).toBe(23);
    expect(r.percentile).toBe(0);
  });
});

describe("sampleThinCaveat — reader-facing caveat copy (sa0718, 07/22/2026)", () => {
  test("thin candidate gets caveat text — the '#23 of 23' framing must not read as a confident extreme", () => {
    expect(sampleThinCaveat(cand({ key: "a", sampleThin: true }))).toBe(
      "Small sample — shown for context only",
    );
  });

  test("non-thin candidate gets no caveat", () => {
    expect(sampleThinCaveat(cand({ key: "a" }))).toBeNull();
  });
});

describe("rankSignals — footnote passthrough", () => {
  test("an optional footnote on a candidate survives ranking unchanged, and doesn't affect score", () => {
    const withFootnote = rankSignals([
      cand({ key: "a", percentile: 80, footnote: "tracks within 6% of the index" }),
    ])[0];
    const without = rankSignals([cand({ key: "a", percentile: 80 })])[0];
    expect(withFootnote.footnote).toBe("tracks within 6% of the index");
    expect(withFootnote.score).toBeCloseTo(without.score, 10);
  });
});
