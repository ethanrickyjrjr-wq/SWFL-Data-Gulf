// lib/listings/market-snapshot.ts
//
// Per-ZIP "Local Market Snapshot" read from the housing-swfl brain's baked
// `housing_by_zip` detail table (Redfin, 90-day rolling). Deviation #2 from the
// Showing Prep spec: housing-swfl — NOT market-heat-swfl (no months-of-inventory,
// no sold data there) — and read as a DETAIL ROW (loadParsedBrain), not a frame
// (metric_keys bind region-aggregate only). Pending count is never emitted, so it
// is not surfaced. Market type is INFERRED from months_of_supply (< 3 seller's,
// > 6 buyer's, else balanced). Returns null — so the caller OMITS the section —
// when the ZIP row is missing, thin-sample, or months_of_supply is null.
// Empty-tolerant: never throws.

import { loadParsedBrain } from "@/lib/fetch-brain";
import { asOfFromToken } from "@/lib/project/as-of";

export interface MarketSnapshot {
  zip: string;
  monthsOfSupply: number | null;
  activeInventory: number | null;
  homesSold: number | null;
  medianSalePrice: number | null;
  medianDom: number | null;
  marketType: "Seller's market" | "Buyer's market" | "Balanced" | null;
  /** MM/DD/YYYY, from the brain's freshness token. */
  asOf: string;
  lowSample: boolean;
}

const HOUSING_ZIP_TABLE = "housing_by_zip";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function marketTypeFrom(mos: number | null): MarketSnapshot["marketType"] {
  if (mos == null) return null;
  if (mos < 3) return "Seller's market";
  if (mos > 6) return "Buyer's market";
  return "Balanced";
}

export async function marketSnapshotForZip(
  zip: string,
  deps: { load?: typeof loadParsedBrain } = {},
): Promise<MarketSnapshot | null> {
  const want = String(zip ?? "").match(/\d{5}/)?.[0];
  if (!want) return null;
  const load = deps.load ?? loadParsedBrain;

  const brain = await load("housing-swfl").catch(() => null);
  if (!brain) return null;

  const tables = brain.output?.detail_tables ?? [];
  const table = tables.find((t) => t.id === HOUSING_ZIP_TABLE);
  const row = table?.rows.find((r) => r.key === want);
  if (!row) return null;

  const cells = row.cells as Record<string, unknown>;
  if (cells.low_sample === true) return null; // thin sample — never shown stale
  const monthsOfSupply = num(cells.months_of_supply);
  if (monthsOfSupply == null) return null; // nothing solid to anchor the section

  return {
    zip: want,
    monthsOfSupply,
    activeInventory: num(cells.inventory),
    homesSold: num(cells.homes_sold),
    medianSalePrice: num(cells.median_sale_price),
    medianDom: num(cells.median_dom),
    marketType: marketTypeFrom(monthsOfSupply),
    asOf: asOfFromToken(brain.freshness_token) ?? brain.freshness_token,
    lowSample: false,
  };
}
