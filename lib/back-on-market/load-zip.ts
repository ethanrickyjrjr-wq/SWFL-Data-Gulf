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
import { asOfFromToken } from "../project/as-of";
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
  /** The reading's CURRENCY — the Redfin data period, MM/DD/YYYY (e.g. "03/01/2026").
   *  A rolling-monthly figure; surfaces should display it as a month label ("March
   *  2026"), not a bare day (which over-states precision). */
  asOf: string;
  source: { label: string; url: string };
  // ── Seller-facing additions (07/17/2026) — consumed by /r/should-i-sell's Section 1.
  //    ADDITIVE ONLY: the region/area/rate fields above are unchanged. One read seam —
  //    these ride the SAME parsed brain, no second parseBrainMarkdown of seller-stress-swfl.
  /** Plain-English seller-pressure signals, leading signal (delistings) FIRST. */
  drivers: { label: string; valuePct: number }[];
  /** Seller-material caveats, substance-verbatim from the brain, internal brain
   *  cross-references stripped (no system-noun leak): the ~50%-all-cash calibration note
   *  (always) + the SB 4-D / condo-assessment note. */
  sellerCaveats: string[];
  /** When the read was last refreshed — the freshness token's date, MM/DD/YYYY (or null).
   *  A SECONDARY line, distinct from `asOf` (the data period). */
  refreshedAt: string | null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** First ISO date in the table title → MM/DD/YYYY; fallback to the source fetched_at date. */
function asOfFrom(title: string, fetchedAt: string): string {
  const iso = title.match(/(\d{4})-(\d{2})-(\d{2})/) ?? fetchedAt.match(/(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[2]}/${iso[3]}/${iso[1]}` : "";
}

/**
 * A seller-material caveat, substance-only. The brain's caveats are analyst-authored and
 * can carry an internal cross-reference (e.g. "…See `condo-sirs-swfl` for the condo read.")
 * — a brain slug that would be a display-leak / system-noun violation in seller copy. This
 * direct `output.caveats` read does NOT pass through the speaker's scrubBrainSlugs, so the
 * internal cross-reference is stripped here and any stray backtick slug unwrapped.
 */
function scrubSellerCaveat(text: string): string {
  return text
    .replace(/\s*See\s+`[a-z0-9-]+`[^.]*\.?/gi, "") // drop "See `slug` …" cross-refs
    .replace(/`([a-z0-9-]+)`/g, "$1") // safety: unwrap any remaining backtick slug
    .replace(/\s{2,}/g, " ")
    .trim();
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

  const cancellationRatePct = num(row.cells["cancellation_rate_pct"]);
  const relistRatePct = num(row.cells["share_relisted_pct"]);
  const delistRatePct = num(row.cells["share_delisted_pct"]);
  const priceDropSharePct = num(row.cells["pct_active_with_drops"]);

  // Plain-English seller-pressure signals — the composite's TOP 3, in its own weighting
  // order: delistings (leading) → price-drop breadth → cancellations. (Drop depth and
  // relistings are the lower-weight #4/#5 signals; relistRatePct stays a top-level field
  // for the back-on-market surface but is not a headline seller driver here.)
  const drivers = [
    { label: "Delistings — homes pulled off the market", value: delistRatePct },
    { label: "Price drops — share of active listings cutting price", value: priceDropSharePct },
    { label: "Contract cancellations", value: cancellationRatePct },
  ]
    .filter((d): d is { label: string; value: number } => d.value != null)
    .map((d) => ({ label: d.label, valuePct: d.value }));

  // Seller-material caveats: the ~50%-all-cash calibration note (always) + the condo /
  // SB 4-D assessment note. There is NO per-ZIP condo flag anywhere (seller-stress rows
  // carry none, condo-sirs-swfl has no per-ZIP table), so gating the condo note on a
  // fabricated classifier would invent data — and the note's own "in condo-heavy ZIPs"
  // wording already conditions it. Relayed substance-verbatim, slugs stripped. The
  // Hurricane-Ian event note and the suppression-count note are not seller-decision
  // material here (suppression is surfaced as honest no-score copy by the consumer).
  const sellerCaveats = (output?.caveats ?? [])
    .filter((c) => /all-cash|SB 4-D|condo/i.test(c))
    .map(scrubSellerCaveat)
    .filter(Boolean);

  return {
    zip,
    place: deps.place ?? zip,
    cancellationRatePct,
    relistRatePct,
    delistRatePct,
    stressScore,
    region,
    area,
    asOf: asOfFrom(table.title ?? "", table.source?.fetched_at ?? ""),
    source: { label: table.source?.citation ?? "Redfin Data Center", url: table.source?.url ?? "" },
    drivers,
    sellerCaveats,
    refreshedAt: asOfFromToken(brain?.freshness_token),
  };
}
