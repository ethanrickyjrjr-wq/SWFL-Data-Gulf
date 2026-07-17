// lib/should-i-sell/load-market-snapshot.ts
//
// Section 2 of the Should I Sell read — the market snapshot for a seller's own area,
// read off ALREADY-PUBLISHED brain output (no ingest, no metered calls), the same seam
// lib/back-on-market/load-zip.ts uses: loadParsedBrain → per-ZIP detail row.
//
//   • months of supply, median DOM, sale-to-list  ← housing-swfl (housing_by_zip)
//   • price-cut share                             ← listing-momentum-swfl (listing_momentum_by_zip)
//
// Two halves, each nullable and each carrying its OWN asOf + source. A ZIP absent from
// a table → that half is null → its card is omitted (never guessed). Absent from BOTH
// → the whole object is null (the section is omitted). These are absolute sourced
// figures — no ranking, no re-derivation.
import { loadParsedBrain } from "../fetch-brain";
import type { ParsedBrain } from "../../refinery/render/speaker.mts";
import type { BrainOutputDetailTable } from "../../refinery/types/brain-output.mts";

type LoadBrain = (slug: string) => Promise<ParsedBrain | null>;

export interface SnapshotSource {
  label: string;
  url: string;
  /** The reading's currency (data period), MM/DD/YYYY. */
  asOf: string;
}

export interface HousingHalf {
  monthsOfSupply: number | null;
  medianDom: number | null;
  saleToListPct: number | null;
  source: SnapshotSource;
}

export interface MomentumHalf {
  priceCutSharePct: number | null;
  source: SnapshotSource;
}

export interface MarketSnapshot {
  zip: string;
  place: string;
  /** null = this ZIP is absent from the housing table (card omitted). */
  housing: HousingHalf | null;
  /** null = this ZIP is absent from the listing-momentum table (card omitted). */
  momentum: MomentumHalf | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** First ISO date found across the candidate strings → MM/DD/YYYY, else "". The
 *  housing table dates itself in its title ("data through YYYY-MM-DD"); the momentum
 *  table dates itself in its source citation ("as of YYYY-MM-DD"). */
function asOfMdy(...candidates: (string | undefined | null)[]): string {
  for (const c of candidates) {
    if (!c) continue;
    const m = c.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[2]}/${m[3]}/${m[1]}`;
  }
  return "";
}

function tableOf(brain: ParsedBrain | null, id: string): BrainOutputDetailTable | undefined {
  return brain?.output?.detail_tables?.find((t) => t.id === id);
}

function readHousingHalf(brain: ParsedBrain | null, zip: string): HousingHalf | null {
  const table = tableOf(brain, "housing_by_zip");
  if (!table) return null;
  const row = table.rows.find((r) => r.key === zip);
  if (!row) return null;
  return {
    monthsOfSupply: num(row.cells["months_of_supply"]),
    medianDom: num(row.cells["median_dom"]),
    saleToListPct: num(row.cells["avg_sale_to_list_pct"]),
    source: {
      label: table.source?.citation ?? "Redfin Data Center",
      url: table.source?.url ?? "",
      asOf: asOfMdy(table.title, table.source?.fetched_at),
    },
  };
}

function readMomentumHalf(brain: ParsedBrain | null, zip: string): MomentumHalf | null {
  const table = tableOf(brain, "listing_momentum_by_zip");
  if (!table) return null;
  const row = table.rows.find((r) => r.key === zip);
  if (!row) return null;
  return {
    priceCutSharePct: num(row.cells["price_reduced_share"]),
    source: {
      label: table.source?.citation ?? "SWFL for-sale listing momentum",
      url: table.source?.url ?? "",
      asOf: asOfMdy(table.title, table.source?.citation, table.source?.fetched_at),
    },
  };
}

export interface MarketSnapshotDeps {
  loadBrain?: LoadBrain;
  place?: string;
}

/**
 * Load the market snapshot for a ZIP. Returns null only when the ZIP is absent from
 * BOTH tables (nothing to show). Never throws — a missing/unreadable brain degrades
 * to a null half.
 */
export async function loadMarketSnapshot(
  zip: string,
  deps: MarketSnapshotDeps = {},
): Promise<MarketSnapshot | null> {
  const loadBrain: LoadBrain = deps.loadBrain ?? loadParsedBrain;
  const [housingBrain, momentumBrain] = await Promise.all([
    loadBrain("housing-swfl"),
    loadBrain("listing-momentum-swfl"),
  ]);
  const housing = readHousingHalf(housingBrain, zip);
  const momentum = readMomentumHalf(momentumBrain, zip);
  if (!housing && !momentum) return null;
  return { zip, place: deps.place ?? zip, housing, momentum };
}

/**
 * This ZIP's trailing median-sale-price YoY as a DECIMAL fraction (the housing brain
 * stores it as a PERCENT, e.g. 9.8 → 0.098), for the sell-now-vs-wait projection.
 * Null when the ZIP is absent or the cell is null (the projection then doesn't render).
 * Kept beside the snapshot loader because it reads the SAME housing_by_zip table.
 */
export async function loadZipYoyFraction(
  zip: string,
  deps: { loadBrain?: LoadBrain } = {},
): Promise<number | null> {
  const loadBrain: LoadBrain = deps.loadBrain ?? loadParsedBrain;
  const brain = await loadBrain("housing-swfl");
  const table = tableOf(brain, "housing_by_zip");
  const row = table?.rows.find((r) => r.key === zip);
  const pct = num(row?.cells["median_sale_price_yoy_pct"]);
  return pct == null ? null : pct / 100;
}
