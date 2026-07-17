// lib/back-on-market/load-zip.ts
//
// Lane 1 read: a ZIP's contract-cancellation / relist / delist rates, straight off the
// already-live seller-stress-swfl brain output (its `seller_stress_by_zip` detail table),
// plus how this ZIP sits relative to the region (published direction + rank vs. the
// published median). Zero ingest, zero metered calls. Empty-tolerant: an absent ZIP →
// null; a suppressed ZIP → the row with null rates and no area read (NEVER a guessed
// number). The as-of is the Redfin data period parsed from the table title, written
// MM/DD/YYYY (the number is ~4 months lagged by Redfin's rolling monthly cadence — that
// date is stated plainly, it is not "today").
//
// Single authority for reading seller-stress-swfl per ZIP (07/17/2026 reconciliation):
// folds in the region/rank logic that started as a second, unfinished reader
// (lib/seller-stress/read.ts, never wired to a live page) — one place, not two, knows how
// to turn this brain's output into a ZIP's stress read.
import { loadParsedBrain } from "../fetch-brain";
import type { BrainOutputDirection } from "../../refinery/types/brain-output.mts";

const REGION_STATE_LABEL: Record<BrainOutputDirection, string> = {
  bearish: "under elevated seller pressure right now",
  mixed: "sending mixed signals for sellers right now",
  neutral: "near its normal level for sellers right now",
  bullish: "in seller-favorable territory right now",
};

const NEAR_BAND = 3; // score points; within ±this of the region median reads "near"

export interface BackOnMarketZip {
  zip: string;
  place: string;
  cancellationRatePct: number | null;
  relistRatePct: number | null;
  delistRatePct: number | null;
  stressScore: number | null;
  region: { direction: BrainOutputDirection; stateLabel: string; median: number } | null;
  area: { rank: { position: number; total: number }; vsMedian: "above" | "near" | "below" } | null;
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
  const output = brain?.output;
  const table = output?.detail_tables?.find((t) => t.id === "seller_stress_by_zip");
  if (!table) return null;
  const row = table.rows.find((r) => r.key === zip);
  if (!row) return null;

  const stressScore = num(row.cells["seller_stress_score"]);

  const medianMetric = output?.key_metrics?.find((m) => m.metric === "seller_stress_score_swfl");
  const median = typeof medianMetric?.value === "number" ? medianMetric.value : null;
  const direction = output?.direction as BrainOutputDirection | undefined;
  const region =
    direction && median !== null
      ? { direction, stateLabel: REGION_STATE_LABEL[direction], median }
      : null;

  let area: BackOnMarketZip["area"] = null;
  if (stressScore !== null && region !== null) {
    const scored = table.rows
      .map((r) => num(r.cells["seller_stress_score"]))
      .filter((v): v is number => v !== null);
    const position = scored.filter((s) => s > stressScore).length + 1;
    const vsMedian: "above" | "near" | "below" =
      Math.abs(stressScore - region.median) <= NEAR_BAND
        ? "near"
        : stressScore > region.median
          ? "above"
          : "below";
    area = { rank: { position, total: scored.length }, vsMedian };
  }

  return {
    zip,
    place: deps.place ?? zip,
    cancellationRatePct: num(row.cells["cancellation_rate_pct"]),
    relistRatePct: num(row.cells["share_relisted_pct"]),
    delistRatePct: num(row.cells["share_delisted_pct"]),
    stressScore,
    region,
    area,
    asOf: asOfFrom(table.title ?? "", table.source?.fetched_at ?? ""),
    source: { label: table.source?.citation ?? "Redfin Data Center", url: table.source?.url ?? "" },
  };
}
