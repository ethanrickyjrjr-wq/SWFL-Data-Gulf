// lib/email/zip-events/market-areas.ts
//
// Committed-fixture loader for market areas (fixtures/swfl-market-areas.json).
// Static import (Next + Bun both bundle JSON) — a subscriber's market area is a
// stable, citable fixture fact, never runtime clustering. Regenerate the fixture
// deliberately with scripts/geo/build-market-areas.mts; diffs must be intentional.

import fixture from "@/fixtures/swfl-market-areas.json";

export interface MarketArea {
  area_id: string;
  label: string;
  county: string; // "12071" | "12021"
  anchor_place: string;
  zips: string[];
  needs_review: string[];
}

const AREAS: MarketArea[] = (fixture as { areas: MarketArea[] }).areas;
const BY_ZIP = new Map<string, MarketArea>();
for (const a of AREAS) for (const z of a.zips) BY_ZIP.set(z, a);

export function loadMarketAreas(): MarketArea[] {
  return AREAS;
}

/** null = out of footprint (never implied coverage — Hendry etc. resolve null). */
export function areaForZip(zip: string): MarketArea | null {
  return BY_ZIP.get(zip) ?? null;
}
