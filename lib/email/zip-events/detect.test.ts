// lib/email/zip-events/detect.test.ts
import { describe, expect, test } from "bun:test";
import type { ZipMetricsSnapshot } from "./types";
import type { MarketArea } from "./market-areas";
import {
  BURST_PRICE_CUTS_N,
  detectLifecycleBurst,
  detectNearbyNews,
  detectRankFlip,
  detectThresholdCross,
  RANK_TOP_N,
  SURGE_RATIO,
  THRESHOLD_PCT_BAND,
} from "./detect";

const AREA: MarketArea = {
  area_id: "cape-coral",
  label: "the Cape Coral market",
  county: "12071",
  anchor_place: "Cape Coral",
  zips: ["33904", "33914"],
  needs_review: [],
};

function snap(metrics: Partial<ZipMetricsSnapshot["metrics"]>): ZipMetricsSnapshot {
  return {
    zip: "33904",
    as_of: "2026-07-09",
    metrics: {
      median_sale_price: null,
      median_dom: null,
      actives: null,
      sold_count_30d: null,
      sale_to_list_ratio: null,
      ...metrics,
    },
    rank_position: null,
    heat: {
      median_dom_trend: null,
      sale_to_list_ratio: null,
      price_momentum_pct: null,
      sold_momentum_pct: null,
    },
  };
}

describe("detectThresholdCross", () => {
  test("fires when a metric moves ≥ the pct band", () => {
    const prev = snap({ median_sale_price: 400_000 });
    const fresh = snap({ median_sale_price: 400_000 * (1 + THRESHOLD_PCT_BAND + 0.01) });
    const events = detectThresholdCross(prev, fresh, AREA);
    expect(events.length).toBe(1);
    expect(events[0].type).toBe("threshold_cross");
    expect(events[0].zip).toBe("33904");
    expect(events[0].facts[0].from).toBe(400_000);
  });

  test("fires on a round-level cross even under the pct band", () => {
    const prev = snap({ median_sale_price: 449_000 });
    const fresh = snap({ median_sale_price: 451_000 }); // crosses 450k
    expect(detectThresholdCross(prev, fresh, AREA).length).toBe(1);
  });

  test("fails closed: null previous metric or missing snapshot emits nothing", () => {
    const fresh = snap({ median_sale_price: 500_000 });
    expect(detectThresholdCross(null, fresh, AREA)).toEqual([]);
    expect(detectThresholdCross(snap({}), fresh, AREA)).toEqual([]);
  });

  test("identical inputs → identical events (pure)", () => {
    const prev = snap({ median_dom: 40 });
    const fresh = snap({ median_dom: 50 });
    expect(detectThresholdCross(prev, fresh, AREA)).toEqual(
      detectThresholdCross(prev, fresh, AREA),
    );
  });
});

describe("detectRankFlip", () => {
  test("fires on entering top-N", () => {
    const e = detectRankFlip(RANK_TOP_N + 4, RANK_TOP_N, "33904", AREA);
    expect(e?.type).toBe("rank_flip");
  });
  test("null on no previous position (first run) — fail closed", () => {
    expect(detectRankFlip(null, 2, "33904", AREA)).toBeNull();
  });
  test("null on a 1-place wiggle", () => {
    expect(detectRankFlip(10, 9, "33904", AREA)).toBeNull();
  });
});

describe("detectLifecycleBurst", () => {
  test("price-cut burst at the N threshold", () => {
    const events = detectLifecycleBurst(
      {
        zip: "33904",
        price_cuts: BURST_PRICE_CUTS_N,
        new_listings: 0,
        trailing_weekly_new_listings: 0,
        notable_sale: null,
      },
      AREA,
    );
    expect(events.some((e) => e.class === "alert")).toBe(true);
  });
  test("new-listing surge needs a real trailing baseline (fail closed at 0)", () => {
    const events = detectLifecycleBurst(
      {
        zip: "33904",
        price_cuts: 0,
        new_listings: 12,
        trailing_weekly_new_listings: 0,
        notable_sale: null,
      },
      AREA,
    );
    expect(events).toEqual([]);
  });
  test("surge fires at ratio", () => {
    const events = detectLifecycleBurst(
      {
        zip: "33904",
        price_cuts: 0,
        new_listings: Math.ceil(8 * SURGE_RATIO),
        trailing_weekly_new_listings: 8,
        notable_sale: null,
      },
      AREA,
    );
    expect(events.length).toBe(1);
  });
  test("notable sale needs a held area median — fail closed on null", () => {
    const events = detectLifecycleBurst(
      {
        zip: "33904",
        price_cuts: 0,
        new_listings: 0,
        trailing_weekly_new_listings: 0,
        notable_sale: { sold_price: 5_000_000, area_median_sale_price: null },
      },
      AREA,
    );
    expect(events).toEqual([]);
  });
});

describe("detectNearbyNews", () => {
  test("maps items to one weekly-class area event; empty in → empty out", () => {
    expect(detectNearbyNews([], AREA)).toEqual([]);
    const events = detectNearbyNews(
      [
        {
          title: "Bridge repair funded",
          zip: "33904",
          distance_band: "0-2mi",
          published_at: "2026-07-08",
        },
      ],
      AREA,
    );
    expect(events.length).toBe(1);
    expect(events[0].grain).toBe("area");
    expect(events[0].class).toBe("weekly");
  });
});
