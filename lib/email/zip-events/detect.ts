// lib/email/zip-events/detect.ts
//
// Pure v1 detectors (spec 2026-07-10-market-area-alerts-design.md §2).
// Discipline mirrors lib/project/watch-delta.ts: NO DB, NO disk, NO Date.now(),
// NO network; missing input ⇒ no event; identical inputs ⇒ identical events.
// Every threshold is a named exported constant, [PROVISIONAL] operator-set v1 —
// tuned later on per-trigger engagement data (the `ma` webhook rows).

import type { MarketArea } from "./market-areas";
import {
  METRIC_LABELS,
  METRIC_UNITS,
  type MarketEvent,
  type MetricKey,
  type ZipMetricsSnapshot,
} from "./types";

export const THRESHOLD_PCT_BAND = 0.05; // [PROVISIONAL] ±5% move vs stored snapshot
export const PRICE_ROUND_LEVEL_USD = 50_000; // [PROVISIONAL] round-level grid for prices
export const RANK_TOP_N = 5; // [PROVISIONAL] "entered the top N"
export const RANK_JUMP_K = 3; // [PROVISIONAL] "moved ≥ K places"
export const BURST_PRICE_CUTS_N = 3; // [PROVISIONAL] cuts per window = a burst
export const SURGE_RATIO = 1.5; // [PROVISIONAL] new listings vs trailing weekly baseline
export const NOTABLE_SALE_AREA_RATIO = 2; // [PROVISIONAL] sold ≥ 2x area median

const SOURCE_LAKE = "SWFL Data Gulf listing lifecycle";
const SOURCE_RANK = "SWFL Data Gulf ranked signals";
const SOURCE_PULSE = "SWFL Data Gulf local pulse";

/** Alert-class metrics: a cross here fires standalone; the rest ride the weekly. */
const ALERT_METRICS: ReadonlySet<MetricKey> = new Set(["median_sale_price", "median_dom"]);

function crossedRoundLevel(from: number, to: number, grid: number): boolean {
  return Math.floor(from / grid) !== Math.floor(to / grid);
}

export function detectThresholdCross(
  prev: ZipMetricsSnapshot | null,
  fresh: ZipMetricsSnapshot,
  area: MarketArea,
): MarketEvent[] {
  if (prev === null) return []; // first run seeds, never fires
  const events: MarketEvent[] = [];
  for (const key of Object.keys(fresh.metrics) as MetricKey[]) {
    const from = prev.metrics[key];
    const to = fresh.metrics[key];
    if (from == null || to == null || from === 0) continue; // fail closed
    const pctMove = Math.abs(to - from) / Math.abs(from);
    const roundCross =
      key === "median_sale_price" && crossedRoundLevel(from, to, PRICE_ROUND_LEVEL_USD);
    if (pctMove < THRESHOLD_PCT_BAND && !roundCross) continue;
    events.push({
      type: "threshold_cross",
      grain: "zip",
      area_id: area.area_id,
      zip: fresh.zip,
      class: ALERT_METRICS.has(key) ? "alert" : "weekly",
      facts: [
        {
          label: METRIC_LABELS[key],
          from,
          to,
          value: to,
          unit: METRIC_UNITS[key],
          source: SOURCE_LAKE,
        },
      ],
    });
  }
  return events;
}

export function detectRankFlip(
  prevPos: number | null,
  freshPos: number | null,
  zip: string,
  area: MarketArea,
): MarketEvent | null {
  if (prevPos == null || freshPos == null) return null; // fail closed
  const enteredTop = freshPos <= RANK_TOP_N && prevPos > RANK_TOP_N;
  const jumped = prevPos - freshPos >= RANK_JUMP_K;
  if (!enteredTop && !jumped) return null;
  return {
    type: "rank_flip",
    grain: "zip",
    area_id: area.area_id,
    zip,
    class: "weekly",
    facts: [
      {
        label: "Regional signal rank",
        from: prevPos,
        to: freshPos,
        value: freshPos,
        unit: "",
        source: SOURCE_RANK,
      },
    ],
  };
}

export interface LifecycleWindow {
  zip: string;
  /** Counts aggregated AT SOURCE from listing transitions for the window. */
  price_cuts: number;
  new_listings: number;
  /** Average weekly new listings over the trailing baseline period; 0 = no baseline held. */
  trailing_weekly_new_listings: number;
  notable_sale: { sold_price: number; area_median_sale_price: number | null } | null;
}

export function detectLifecycleBurst(w: LifecycleWindow, area: MarketArea): MarketEvent[] {
  const events: MarketEvent[] = [];
  if (w.price_cuts >= BURST_PRICE_CUTS_N) {
    events.push({
      type: "lifecycle_burst",
      grain: "zip",
      area_id: area.area_id,
      zip: w.zip,
      class: "alert",
      facts: [
        { label: "Price cuts this week", value: w.price_cuts, unit: "", source: SOURCE_LAKE },
      ],
    });
  }
  // Surge needs a REAL baseline: trailing 0 fails closed (no invented denominator).
  if (
    w.trailing_weekly_new_listings > 0 &&
    w.new_listings >= w.trailing_weekly_new_listings * SURGE_RATIO
  ) {
    events.push({
      type: "lifecycle_burst",
      grain: "zip",
      area_id: area.area_id,
      zip: w.zip,
      class: "weekly",
      facts: [
        {
          label: "New listings this week",
          from: w.trailing_weekly_new_listings,
          to: w.new_listings,
          value: w.new_listings,
          unit: "",
          source: SOURCE_LAKE,
        },
      ],
    });
  }
  if (
    w.notable_sale &&
    w.notable_sale.area_median_sale_price != null &&
    w.notable_sale.area_median_sale_price > 0 &&
    w.notable_sale.sold_price >= w.notable_sale.area_median_sale_price * NOTABLE_SALE_AREA_RATIO
  ) {
    events.push({
      type: "lifecycle_burst",
      grain: "zip",
      area_id: area.area_id,
      zip: w.zip,
      class: "weekly",
      facts: [
        { label: "Notable sale", value: w.notable_sale.sold_price, unit: "$", source: SOURCE_LAKE },
      ],
    });
  }
  return events;
}

export interface AreaNewsItem {
  title: string;
  zip: string;
  distance_band: string;
  published_at: string; // YYYY-MM-DD
}

export function detectNearbyNews(items: AreaNewsItem[], area: MarketArea): MarketEvent[] {
  if (items.length === 0) return [];
  return [
    {
      type: "nearby_news",
      grain: "area",
      area_id: area.area_id,
      class: "weekly",
      facts: items.map((i) => ({ label: i.title, value: null, unit: "", source: SOURCE_PULSE })),
    },
  ];
}
