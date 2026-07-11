// lib/desk/mappers.ts — pure, unit-tested shaping logic for /desk zones.
// No I/O here: loaders fetch, these functions decide. Keeping the honesty
// rules (partial-scan detection, outlier clamp, delta-vs-prior-reading) in
// pure code is what makes them testable instead of aspirational.

import type { DeskDirection } from "./types";

// makeTakeaway lives in lib/geo-takeaway.ts — the one shared authority for the
// GEO quotable sentence, also used by /r/* report pages. Re-exported here so
// existing desk imports don't need to change.
export { makeTakeaway } from "../geo-takeaway";

/** ISO date or timestamp → MM/DD/YYYY (the one date convention in copy). */
export function mdY(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return undefined;
  return `${m[2]}/${m[3]}/${m[1]}`;
}

/** ISO date → short MM/DD label for dense axes. */
export function mD(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}` : iso;
}

export function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function fmtCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

export function directionOf(delta: number | null | undefined): DeskDirection {
  if (delta == null || delta === 0) return "flat";
  return delta > 0 ? "up" : "down";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A day whose event total falls below this share of the window median is an
 *  incomplete sweep, not a market lull (07/07/2026: 31 events vs. ~1,200). */
export const PARTIAL_SCAN_FRACTION = 0.3;

/** Minimum days of history before any day can be called partial — with fewer
 *  there is no baseline to compare against, so nothing is flagged. */
export const PARTIAL_SCAN_MIN_DAYS = 4;

/**
 * Flag incomplete sweep days. Each day is compared against the median of the
 * OTHER days' totals in the loaded window, so one bad day can't poison its own
 * baseline. Returns a same-length boolean array.
 */
export function detectPartialScans(totals: number[]): boolean[] {
  if (totals.length < PARTIAL_SCAN_MIN_DAYS) return totals.map(() => false);
  return totals.map((total, i) => {
    const others = totals.filter((_, j) => j !== i);
    const base = median(others);
    if (base == null || base <= 0) return false;
    return total < base * PARTIAL_SCAN_FRACTION;
  });
}

/**
 * A day right after a partial-scan day likely absorbed some of the prior day's undetected
 * activity — the diff engine only stamps the day it DETECTED a change, never a vendor-asserted
 * event date (07/11/2026: confirmed SteadyAPI's `listed_date`/`days_on_market` are unpopulated
 * for every row we hold, so there is no honest way to re-split the blend after the fact). This
 * flags the day for a caveat label; it never re-buckets or estimates a split number.
 */
export function flagCarryoverDays(partials: boolean[]): boolean[] {
  return partials.map((_, i) => i > 0 && partials[i - 1]);
}

export interface SeriesPoint {
  /** ISO date. */
  period: string;
  value: number;
}

export interface LatestDelta {
  latest: number;
  latestPeriod: string;
  prev: number | null;
  prevPeriod: string | null;
  delta: number | null;
  deltaPct: number | null;
  direction: DeskDirection;
}

/**
 * Latest reading + change vs. the PREVIOUS AVAILABLE reading. Sparse feeds
 * (mortgage: a handful of observations) make "day-over-day" a lie — the caller
 * must caption the delta with `prevPeriod`, not assume yesterday.
 */
export function latestDelta(points: SeriesPoint[]): LatestDelta | null {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.period.localeCompare(b.period));
  if (sorted.length === 0) return null;
  const last = sorted[sorted.length - 1];
  const prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  const delta = prev ? last.value - prev.value : null;
  return {
    latest: last.value,
    latestPeriod: last.period,
    prev: prev ? prev.value : null,
    prevPeriod: prev ? prev.period : null,
    delta,
    deltaPct: prev && prev.value !== 0 && delta != null ? (delta / prev.value) * 100 : null,
    direction: directionOf(delta),
  };
}

/** Rebase a series to % change from its first point (day-0 = 0%). */
export function rebaseFromFirst(points: SeriesPoint[]): SeriesPoint[] {
  const sorted = [...points]
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.period.localeCompare(b.period));
  if (sorted.length === 0 || sorted[0].value === 0) return [];
  const base = sorted[0].value;
  return sorted.map((p) => ({ period: p.period, value: ((p.value - base) / base) * 100 }));
}

export interface CutCandidate {
  reducedAmount: number | null;
  listPrice: number | null;
}

/** Cut-share ceiling: a "cut" of 60%+ of the original ask is a bad row, not a
 *  price move (observed: a $222M reduced_amount on an ordinary listing). */
export const MAX_CUT_SHARE = 0.6;
/** Original-ask ceiling — nothing in this market lists at $100M+. */
export const MAX_ORIGINAL_PRICE = 100_000_000;

/** True when a price-cut row is trustworthy enough to surface individually. */
export function isPlausibleCut(row: CutCandidate): boolean {
  const cut = row.reducedAmount;
  const list = row.listPrice;
  if (cut == null || list == null || !Number.isFinite(cut) || !Number.isFinite(list)) return false;
  if (cut <= 0 || list <= 0) return false;
  const original = list + cut;
  if (original > MAX_ORIGINAL_PRICE) return false;
  return cut / original < MAX_CUT_SHARE;
}

export interface MomentumRow {
  zip_code: string | null;
  county: string | null;
  active_listing_count: number | null;
  price_reduced_share: number | null;
  new_listing_share: number | null;
}

/** ZIPs with fewer actives than this are excluded from mover rankings — a
 *  3-listing ZIP posting "33% reduced" is noise, not a mover. */
export const MOVERS_MIN_ACTIVE = 50;

/** Top-N ZIP rows by a share column, noise-guarded and null-safe. */
export function rankMovers(
  rows: MomentumRow[],
  key: "price_reduced_share" | "new_listing_share",
  topN = 5,
  minActive = MOVERS_MIN_ACTIVE,
): MomentumRow[] {
  return rows
    .filter(
      (r) =>
        r.zip_code != null &&
        (r.active_listing_count ?? 0) >= minActive &&
        typeof r[key] === "number" &&
        Number.isFinite(r[key] as number),
    )
    .sort((a, b) => (b[key] as number) - (a[key] as number))
    .slice(0, topN);
}
