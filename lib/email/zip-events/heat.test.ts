// lib/email/zip-events/heat.test.ts
import { describe, expect, test } from "bun:test";
import { areaHeatInputs, detectHeatShift, rankAreaHeat, type AreaHeatInput } from "./heat";
import type { MarketArea } from "./market-areas";
import type { ZipMetricsSnapshot } from "./types";

function input(area_id: string, v: number): AreaHeatInput {
  // Higher absorption = hotter (pace); higher ratio/momentum = hotter.
  return {
    area_id,
    absorption_rate_pct: v,
    sale_to_list_ratio: 90 + v,
    price_momentum_pct: v,
    sold_momentum_pct: v,
  };
}

describe("rankAreaHeat", () => {
  test("deterministic ordering, hotter first, ties by area_id", () => {
    const ranks = rankAreaHeat([input("b", 2), input("a", 2), input("c", 9)]);
    expect(ranks.map((r) => r.area_id)).toEqual(["c", "a", "b"]);
    expect(ranks[0].position).toBe(1);
  });

  test("missing-input areas are EXCLUDED, not zero-filled", () => {
    const partial: AreaHeatInput = {
      area_id: "x",
      absorption_rate_pct: null,
      sale_to_list_ratio: 95,
      price_momentum_pct: 1,
      sold_momentum_pct: 1,
    };
    const ranks = rankAreaHeat([input("a", 5), partial]);
    expect(ranks.map((r) => r.area_id)).toEqual(["a"]);
  });

  test("a component NO area holds drops from the formula for everyone (young-lake momentum)", () => {
    // The 07/20/2026 live state: pace + tightness held, momentum null everywhere
    // (prev-30d sold window predates the lake's transition history). The field
    // still ranks on the held components instead of blanking the leaderboard.
    const noMomentum = (id: string, v: number): AreaHeatInput => ({
      area_id: id,
      absorption_rate_pct: v,
      sale_to_list_ratio: 90 + v,
      price_momentum_pct: null,
      sold_momentum_pct: null,
    });
    const ranks = rankAreaHeat([noMomentum("a", 2), noMomentum("b", 9)]);
    expect(ranks.map((r) => r.area_id)).toEqual(["b", "a"]);
    // renormalized: the best area still scores 1, not 0.7
    expect(ranks[0].score).toBe(1);
  });

  test("a component held by SOME areas keeps the strict rule — the missing area is excluded", () => {
    const noMomentum: AreaHeatInput = {
      area_id: "x",
      absorption_rate_pct: 5,
      sale_to_list_ratio: 95,
      price_momentum_pct: null,
      sold_momentum_pct: null,
    };
    const ranks = rankAreaHeat([input("a", 5), noMomentum]);
    expect(ranks.map((r) => r.area_id)).toEqual(["a"]);
  });

  test("all components null everywhere → empty rank, never an invented order", () => {
    const empty: AreaHeatInput = {
      area_id: "x",
      absorption_rate_pct: null,
      sale_to_list_ratio: null,
      price_momentum_pct: null,
      sold_momentum_pct: null,
    };
    expect(rankAreaHeat([empty])).toEqual([]);
  });
});

describe("areaHeatInputs", () => {
  const AREA: MarketArea = {
    area_id: "t",
    label: "the T market",
    county: "12071",
    anchor_place: "T",
    zips: ["33904", "33914"],
    needs_review: [],
  };
  function snapWithHeat(zip: string, heat: ZipMetricsSnapshot["heat"]): ZipMetricsSnapshot {
    return {
      zip,
      as_of: "2026-07-09",
      metrics: {
        median_sale_price: null,
        median_dom: null,
        actives: null,
        sold_count_30d: null,
        sale_to_list_ratio: null,
      },
      rank_position: null,
      heat,
    };
  }
  test("averages held members; one contributor is enough per component", () => {
    const snaps = new Map([
      [
        "33904",
        snapWithHeat("33904", {
          absorption_rate_pct: -2,
          sale_to_list_ratio: 96,
          price_momentum_pct: 3,
          sold_momentum_pct: 1,
        }),
      ],
      [
        "33914",
        snapWithHeat("33914", {
          absorption_rate_pct: -4,
          sale_to_list_ratio: 98,
          price_momentum_pct: null,
          sold_momentum_pct: 3,
        }),
      ],
    ]);
    const got = areaHeatInputs(AREA, snaps);
    expect(got?.absorption_rate_pct).toBe(-3);
    expect(got?.price_momentum_pct).toBe(3);
  });
  test("null when no member snapshot holds anything", () => {
    expect(areaHeatInputs(AREA, new Map())).toBeNull();
  });
});

describe("detectHeatShift", () => {
  test("fires on entering/leaving the top N; quiet otherwise", () => {
    const prev = rankAreaHeat([input("a", 9), input("b", 8), input("c", 7), input("d", 6)]);
    const fresh = rankAreaHeat([input("d", 9), input("a", 8), input("b", 7), input("c", 6)]);
    const events = detectHeatShift(prev, fresh);
    const ids = events.map((e) => e.area_id).sort();
    expect(ids).toEqual(["c", "d"]); // d entered top-3, c left
    expect(detectHeatShift(fresh, fresh)).toEqual([]);
  });
  test("first run (empty prev) emits nothing — fail closed", () => {
    expect(detectHeatShift([], rankAreaHeat([input("a", 1)]))).toEqual([]);
  });
});
