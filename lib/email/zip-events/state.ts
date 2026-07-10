// lib/email/zip-events/state.ts
//
// The ONLY impure module in zip-events: snapshot load/assemble/advance.
// BATCH-shaped: one pass covers all 58 footprint ZIPs (scales with geography,
// never list size). Fetches are windowed + column-pruned (watch-scan.mts
// precedent — PostgREST can't GROUP BY, so bounded window rows come back and
// aggregate here; never a full-table haul). Every metric that cannot be
// computed is null; detectors fail closed on null. NO Date.now() — the runner
// injects `now`.

import { selectAllPaged } from "@/refinery/lib/paginate.mts";
import { loadRankedZipSignals } from "@/lib/zip-report/load-ranked-signals";
import type { MetricKey, ZipMetricsSnapshot } from "./types";

/** Untyped service-role client (data_lake schema + new public tables are not in
 *  Database types) — matches createServiceRoleClientUntyped's return. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const SOLD_WINDOW_DAYS = 30;
const BURST_WINDOW_DAYS = 7;
const TRAILING_BASELINE_WEEKS = 8;
/** [PROVISIONAL] Medians/ratios/momenta need ≥ this many sales in the window —
 *  a 2-sale "median" is noise that would fire threshold-cross constantly
 *  (observed live 07/10/2026: 34102 median $8.2M on 8 sales). */
const MIN_SOLD_SAMPLE = 5;
/** [PROVISIONAL] Trailing new-listing baseline is trusted only when the trailing
 *  window actually holds this many rows — lifecycle history begins ~06/27/2026,
 *  so an 8-week window read this early yields a false near-zero baseline that
 *  would fire the surge detector on every ZIP. */
const MIN_TRAILING_TOTAL = 8;

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(now: Date, days: number): string {
  return toDateOnly(new Date(now.getTime() - days * 86_400_000));
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** address_key → footprint ZIP, via listing_state (transitions carry no zip_code). */
async function zipJoin(
  db: Db,
  addressKeys: string[],
  footprint: Set<string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunk([...new Set(addressKeys)], 200)) {
    const { data, error } = await db
      .schema("data_lake")
      .from("listing_state")
      .select("address_key, zip_code")
      .eq("sale_or_rent", "sale")
      .in("address_key", part);
    if (error) throw new Error(`listing_state zip join: ${error.message}`);
    for (const r of (data ?? []) as { address_key: string; zip_code: string | null }[]) {
      if (r.zip_code && footprint.has(r.zip_code)) out.set(r.address_key, r.zip_code);
    }
  }
  return out;
}

export async function loadStoredSnapshots(
  db: Db,
  zips: string[],
): Promise<Map<string, ZipMetricsSnapshot>> {
  const { data, error } = await db
    .from("market_event_snapshots")
    .select("zip, payload")
    .in("zip", zips);
  if (error) throw new Error(`load snapshots: ${error.message}`);
  return new Map(
    ((data ?? []) as { zip: string; payload: ZipMetricsSnapshot }[]).map((r) => [r.zip, r.payload]),
  );
}

interface SoldRow {
  address_key: string;
  sold_price: number;
  sold_date: string;
  price: number | null;
  days_in_prev_state: number | null;
}

/**
 * Fresh per-ZIP snapshots for the whole footprint in one pass.
 * Windows: current = trailing 30 days of sold transitions; momentum compares it
 * to the 30 days before. actives = listing_state state='active' count.
 * rank_position = loadRankedZipSignals position (best-effort; null on failure).
 */
export async function assembleFreshSnapshots(
  db: Db,
  zips: string[],
  now: Date,
): Promise<Map<string, ZipMetricsSnapshot>> {
  const footprint = new Set(zips);
  const asOf = toDateOnly(now);
  const soldStart = daysAgo(now, SOLD_WINDOW_DAYS * 2);
  const curStart = daysAgo(now, SOLD_WINDOW_DAYS);

  // ── Sold transitions, two 30-day windows, one fetch ────────────────────────
  const sold = await selectAllPaged<SoldRow & { id: number }>(
    () =>
      db
        .schema("data_lake")
        .from("listing_transitions")
        .select("id, address_key, sold_price, sold_date, price, days_in_prev_state")
        .eq("seed", false)
        .eq("sale_or_rent", "sale")
        .eq("to_state", "sold")
        .gte("sold_date", soldStart)
        .gt("sold_price", 0) as never, // 0-priced sold rows are masked/junk, not $0 sales
    "id",
  );
  const zipByKey = await zipJoin(
    db,
    sold.map((r) => r.address_key),
    footprint,
  );

  interface Windowed {
    cur: SoldRow[];
    prev: SoldRow[];
  }
  const byZip = new Map<string, Windowed>();
  for (const r of sold) {
    const zip = zipByKey.get(r.address_key);
    if (!zip) continue;
    const w = byZip.get(zip) ?? { cur: [], prev: [] };
    (r.sold_date >= curStart ? w.cur : w.prev).push(r);
    byZip.set(zip, w);
  }

  // ── Actives per ZIP (count only). NOTE: the source populates neither
  // days_on_market nor listed_date (verified null across active rows,
  // 07/10/2026) — market DOM is NOT held, so median_dom stays null (fail
  // closed) and the heat pace input is absorption rate instead. ──
  const activeRows = await selectAllPaged<{ address_key: string; zip_code: string }>(
    () =>
      db
        .schema("data_lake")
        .from("listing_state")
        .select("address_key, zip_code")
        .eq("sale_or_rent", "sale")
        .eq("state", "active")
        .in("zip_code", zips) as never,
    ["zip_code", "address_key"],
  );
  const activesByZip = new Map<string, number>();
  for (const r of activeRows) {
    activesByZip.set(r.zip_code, (activesByZip.get(r.zip_code) ?? 0) + 1);
  }

  // ── Assemble ───────────────────────────────────────────────────────────────
  const out = new Map<string, ZipMetricsSnapshot>();
  for (const zip of zips) {
    const w = byZip.get(zip) ?? { cur: [], prev: [] };
    // Median-based figures fail closed under MIN_SOLD_SAMPLE — tiny windows are
    // noise, and noise crossing a threshold would be an invented "move".
    const curOk = w.cur.length >= MIN_SOLD_SAMPLE;
    const prevOk = w.prev.length >= MIN_SOLD_SAMPLE;
    const curMedian = curOk ? median(w.cur.map((r) => r.sold_price)) : null;
    const prevMedian = prevOk ? median(w.prev.map((r) => r.sold_price)) : null;
    const ratios = curOk
      ? w.cur
          .filter((r) => r.price != null && r.price > 0)
          .map((r) => (r.sold_price / (r.price as number)) * 100)
      : [];

    const metrics: Record<MetricKey, number | null> = {
      median_sale_price: curMedian,
      median_dom: null, // not held at source (see actives note); lights up if ingest adds it
      actives: activesByZip.get(zip) ?? null,
      sold_count_30d: w.cur.length > 0 ? w.cur.length : null,
      sale_to_list_ratio:
        ratios.length >= MIN_SOLD_SAMPLE ? Math.round((median(ratios) as number) * 10) / 10 : null,
    };

    let rank_position: number | null = null;
    try {
      const signals = await loadRankedZipSignals(zip);
      rank_position = signals && signals.ranked.length > 0 ? 1 : null;
      if (signals && signals.ranked.length > 0) {
        // Position of this ZIP's headline signal within the SWFL rank, when held.
        const head = signals.ranked[0];
        rank_position = (head as { rankPos?: number | null }).rankPos ?? null;
      }
    } catch {
      rank_position = null; // best-effort — a brain load failure never sinks the ZIP
    }

    out.set(zip, {
      zip,
      as_of: asOf,
      metrics,
      rank_position,
      heat: {
        absorption_rate_pct:
          curOk && metrics.actives != null && metrics.actives > 0
            ? Math.round((w.cur.length / metrics.actives) * 1000) / 10
            : null,
        sale_to_list_ratio: metrics.sale_to_list_ratio,
        price_momentum_pct:
          curMedian != null && prevMedian != null && prevMedian > 0
            ? Math.round(((curMedian - prevMedian) / prevMedian) * 1000) / 10
            : null,
        sold_momentum_pct:
          curOk && prevOk
            ? Math.round(((w.cur.length - w.prev.length) / w.prev.length) * 1000) / 10
            : null,
      },
    });
  }
  return out;
}

export interface LifecycleCounts {
  zip: string;
  price_cuts: number;
  new_listings: number;
  trailing_weekly_new_listings: number;
  /** Highest confirmed sale in the burst window; null when none. */
  max_sold_price: number | null;
}

/** 7-day burst counts + 8-week trailing new-listing baseline, one fetch. */
export async function assembleLifecycleCounts(
  db: Db,
  zips: string[],
  now: Date,
): Promise<Map<string, LifecycleCounts>> {
  const footprint = new Set(zips);
  const weekStart = daysAgo(now, BURST_WINDOW_DAYS);
  const trailingStart = daysAgo(now, BURST_WINDOW_DAYS + TRAILING_BASELINE_WEEKS * 7);

  const rows = await selectAllPaged<{
    id: number;
    address_key: string;
    from_state: string | null;
    to_state: string;
    at: string;
    price_delta: number | null;
    sold_price: number | null;
    sold_date: string | null;
  }>(
    () =>
      db
        .schema("data_lake")
        .from("listing_transitions")
        .select("id, address_key, from_state, to_state, at, price_delta, sold_price, sold_date")
        .eq("seed", false)
        .eq("sale_or_rent", "sale")
        .gte("at", trailingStart) as never,
    "id",
  );
  const zipByKey = await zipJoin(
    db,
    rows.map((r) => r.address_key),
    footprint,
  );

  const out = new Map<string, LifecycleCounts>();
  const trailingNew = new Map<string, number>();
  for (const zip of zips) {
    out.set(zip, {
      zip,
      price_cuts: 0,
      new_listings: 0,
      trailing_weekly_new_listings: 0,
      max_sold_price: null,
    });
    trailingNew.set(zip, 0);
  }
  for (const r of rows) {
    const zip = zipByKey.get(r.address_key);
    if (!zip) continue;
    const c = out.get(zip)!;
    const inWeek = r.at >= weekStart;
    if (r.from_state === null) {
      if (inWeek) c.new_listings += 1;
      else trailingNew.set(zip, (trailingNew.get(zip) ?? 0) + 1);
    }
    if (inWeek && r.price_delta != null && r.price_delta < 0) c.price_cuts += 1;
    if (
      r.to_state === "sold" &&
      r.sold_price != null &&
      r.sold_price > 0 && // 0-priced sold rows are masked/junk
      r.sold_date != null &&
      r.sold_date >= weekStart
    ) {
      c.max_sold_price = Math.max(c.max_sold_price ?? 0, r.sold_price);
    }
  }
  for (const zip of zips) {
    const c = out.get(zip)!;
    const total = trailingNew.get(zip) ?? 0;
    // A near-empty trailing window is a FALSE baseline (lifecycle history starts
    // ~06/27/2026) — fail closed at 0 so the surge detector stays quiet rather
    // than firing on every ZIP against a fabricated denominator.
    c.trailing_weekly_new_listings =
      total >= MIN_TRAILING_TOTAL ? Math.round((total / TRAILING_BASELINE_WEEKS) * 10) / 10 : 0;
  }
  return out;
}

/** Upsert snapshots AFTER a confirmed send only (never stamp without a send).
 *  DRY_RUN never calls this. */
export async function advanceSnapshots(
  db: Db,
  snaps: ZipMetricsSnapshot[],
  sentAtIso: string,
): Promise<void> {
  for (const s of snaps) {
    const { error } = await db.from("market_event_snapshots").upsert({
      zip: s.zip,
      payload: s,
      as_of: s.as_of,
      advanced_at: sentAtIso,
      updated_at: sentAtIso,
    });
    if (error) throw new Error(`advance snapshot ${s.zip}: ${error.message}`);
  }
}
