// lib/back-on-market/load-zip.ts
//
// Lane 1 read: a ZIP's contract-cancellation / relist / delist rates, straight off the
// already-live seller-stress-swfl brain output (its `seller_stress_by_zip` detail table).
// Zero ingest, zero metered calls. Empty-tolerant: an absent ZIP → null; a suppressed ZIP
// → the row with null rates (NEVER a guessed number). The as-of is the Redfin data period
// parsed from the table title, written MM/DD/YYYY (the number is ~4 months lagged by
// Redfin's rolling monthly cadence — that date is stated plainly, it is not "today").
import { loadParsedBrain } from "../fetch-brain";

export interface BackOnMarketZip {
  zip: string;
  place: string;
  cancellationRatePct: number | null;
  relistRatePct: number | null;
  delistRatePct: number | null;
  stressScore: number | null;
  asOf: string;
  source: { label: string; url: string };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** First ISO date in the table title → MM/DD/YYYY; fallback to the source fetched_at date. */
function asOfFrom(title: string, fetchedAt: string): string {
  const iso = title.match(/(\d{4})-(\d{2})-(\d{2})/) ?? fetchedAt.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[2]}/${iso[3]}/${iso[1]}` : "";
}

export async function loadBackOnMarketZip(
  zip: string,
  deps: { loadBrain?: typeof loadParsedBrain; place?: string } = {},
): Promise<BackOnMarketZip | null> {
  const loadBrain = deps.loadBrain ?? loadParsedBrain;
  const brain = await loadBrain("seller-stress-swfl");
  const table = brain?.output?.detail_tables?.find((t) => t.id === "seller_stress_by_zip");
  if (!table) return null;
  const row = table.rows.find((r) => r.key === zip);
  if (!row) return null;
  return {
    zip,
    place: deps.place ?? zip,
    cancellationRatePct: num(row.cells["cancellation_rate_pct"]),
    relistRatePct: num(row.cells["share_relisted_pct"]),
    delistRatePct: num(row.cells["share_delisted_pct"]),
    stressScore: num(row.cells["seller_stress_score"]),
    asOf: asOfFrom(table.title ?? "", table.source?.fetched_at ?? ""),
    source: { label: table.source?.citation ?? "Redfin Data Center", url: table.source?.url ?? "" },
  };
}
