// lib/project/watch-event.ts
//
// Pure classification core for Property Watch (spec 2026-07-07-property-watch-design.md). Turns one
// nearby comp (its latest transition + its listing_state row) into a ScoredEvent ready for the
// existing insertProjectEvent path — or null when it doesn't qualify. No DB, no disk, no Date.now();
// the adapter (scripts/project-feed/watch-scan.mts) supplies the real rows + the haversine distance.
//
// The brand_tier/brand_weight/final_score fields are written as fixed NEUTRAL values: a residential
// comp has no CRE brand, and inventing a score would be a fabricated number. Watch gating is done by
// classification here, not by the CRE score.

import type { ScoredEvent } from "@/lib/signals/types";
import {
  computeWatchDelta,
  describeWatchEvent,
  priceCutExceedsThreshold,
  type SubjectSpec,
  type WatchEventType,
} from "./watch-delta";

/** The tracked property's own spec (projects.watch_*). */
export type WatchSubject = SubjectSpec;

/** Latest transition for a nearby comp (data_lake.listing_transitions). */
export interface CompTransition {
  from_state: string | null;
  to_state: string;
  /** YYYY-MM-DD detection date. */
  at: string;
  price: number | null;
  price_delta: number | null;
  sold_date: string | null;
  sold_price: number | null;
}

/** The comp's current listing_state row. lat/lon are REQUIRED — the adapter excludes null-geo rows. */
export interface CompState {
  address_key: string;
  lat: number;
  lon: number;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  list_price: number | null;
}

/** Classify a transition into a watch event type, or null if it's none of the three. Sold wins. */
export function classifyTransition(t: CompTransition): WatchEventType | null {
  if (t.to_state === "sold" && t.sold_date != null) return "nearby_sale";
  if (t.from_state === null) return "nearby_new_listing";
  if (t.price_delta != null && t.price_delta < 0) return "nearby_price_cut";
  return null;
}

/**
 * Build a neutral-scored ScoredEvent for one nearby comp, or null when it doesn't qualify
 * (outside radius, unclassifiable, or a price cut below the user's threshold). Pure: identical
 * inputs → identical event. entity_name/entity_brand_key are the comp's address_key — INTERNAL
 * only (never surfaced to the user; the feed/digest render the ai_summary line, which names no id).
 */
export function buildWatchEvent(
  subject: WatchSubject,
  transition: CompTransition,
  state: CompState,
  distanceMiles: number,
  radiusMiles: number,
  priceCutThresholdPct: number,
): ScoredEvent | null {
  if (distanceMiles > radiusMiles) return null;

  const eventType = classifyTransition(transition);
  if (eventType === null) return null;

  // The comp price used for the delta + copy: the sold price for a sale, else the transition's
  // list price, falling back to the state's current list price. Any absent value stays null.
  const compPrice =
    eventType === "nearby_sale"
      ? (transition.sold_price ?? transition.price ?? state.list_price)
      : (transition.price ?? state.list_price);

  if (eventType === "nearby_price_cut") {
    // The threshold is measured on the ACTUAL cut (transition.price + price_delta), independent of
    // the state fallback, so a null transition.price fails closed rather than passing on stale data.
    if (!priceCutExceedsThreshold(transition.price, transition.price_delta, priceCutThresholdPct)) {
      return null;
    }
  }

  const comp = {
    beds: state.beds,
    baths: state.baths,
    sqft: state.sqft,
    price: compPrice,
  };
  const delta = computeWatchDelta(subject, comp);

  const eventDate = eventType === "nearby_sale" ? (transition.sold_date as string) : transition.at;

  const ai_summary = describeWatchEvent({
    event_type: eventType,
    distance_miles: distanceMiles,
    comp,
    delta,
    sold_date: transition.sold_date,
    sold_price: transition.sold_price,
    price_cut_amount: transition.price_delta,
  });

  return {
    entity_name: state.address_key,
    entity_brand_key: state.address_key,
    event_type: eventType,
    lat: state.lat,
    lng: state.lon,
    event_date: eventDate,
    source: "listing_lifecycle_lake",
    // Neutral scoring — a residential comp has no brand tier; watch gating is classification, above.
    brand_tier: 0,
    brand_weight: 0,
    distance_miles: distanceMiles,
    radius_band: `${radiusMiles}mi`,
    final_score: 0,
    notify_user: true, // the daily digest is the batcher; insertProjectEvent gets bypassBatchWindow
    // inject_ai:false is load-bearing ISOLATION, not just an opt-out: every existing CRE consumer of
    // project_events (page.tsx AI-context read, ProjectWorkspace display, lib/project/digest) gates on
    // inject_ai=true, so watch rows are invisible to them — no CRE sender consumes a watch row, no CRE
    // label map renders one. The watch feed/digest read nearby_* by event_type directly instead.
    inject_ai: false,
    ai_summary,
  };
}
