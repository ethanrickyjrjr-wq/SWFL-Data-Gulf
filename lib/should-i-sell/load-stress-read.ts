// lib/should-i-sell/load-stress-read.ts
//
// Section 1 of the Should I Sell read — the seller's own area's honest stress read,
// FACED to them (the score the propensity-to-list industry hides on agent dashboards).
//
// A THIN ADAPTER over the ONE authority — lib/back-on-market/load-zip.ts. That module
// now returns the region/rank/rates PLUS the seller-facing additions (drivers, seller
// caveats, refresh date), all off a single parsed-brain read. This file only reshapes
// that into the Section-1 component's props; it opens no second read of seller-stress-swfl.
//
// Two dates, stated distinctly (design spec): the reading's CURRENCY is the data period
// (displayed as a month label — "Data through March 2026"); the refresh date ("last
// checked 07/12/2026", MM/DD/YYYY) is a separate secondary line.
import { loadBackOnMarketZip } from "../back-on-market/load-zip";
import type { BackOnMarketZip } from "../back-on-market/load-zip";
import { loadParsedBrain } from "../fetch-brain";

export interface StressDriver {
  label: string;
  valuePct: number;
}

export interface SellerStressRead {
  zip: string;
  /** The named place — never framed as "ZIP-level". */
  place: string;
  region: BackOnMarketZip["region"];
  area: BackOnMarketZip["area"];
  /** true = this area has a score; false = suppressed (honest no-score copy). */
  scored: boolean;
  /** Leading seller-pressure signals, delistings first. */
  drivers: StressDriver[];
  /** Seller-material caveats, substance-only (all-cash always; condo/SB 4-D always). */
  caveats: string[];
  /** The reading's currency — data period, MM/DD/YYYY (display as a month label). */
  dataThrough: string;
  /** Refresh date — when the read was last checked, MM/DD/YYYY (or null). */
  lastChecked: string | null;
  source: { label: string; url: string };
}

export interface StressReadDeps {
  loadBrain?: typeof loadParsedBrain;
  place?: string;
}

export async function loadSellerStressRead(
  zip: string,
  deps: StressReadDeps = {},
): Promise<SellerStressRead | null> {
  const read = await loadBackOnMarketZip(
    zip,
    deps.loadBrain ? { loadBrain: deps.loadBrain, place: deps.place } : { place: deps.place },
  );
  if (!read) return null;

  return {
    zip,
    place: read.place,
    region: read.region,
    area: read.area,
    scored: read.stressScore != null,
    drivers: read.drivers,
    caveats: read.sellerCaveats,
    dataThrough: read.asOf, // e.g. "03/01/2026" → surface renders "March 2026"
    lastChecked: read.refreshedAt,
    source: read.source,
  };
}
