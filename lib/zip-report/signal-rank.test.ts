// lib/zip-report/signal-rank.test.ts
import { describe, expect, test } from "bun:test";
import { percentileOf, rankSignals, type SignalCandidate } from "./signal-rank";

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
