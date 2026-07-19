// lib/why-not-selling/zhvi-change.ts — the ZIP's TYPICAL-home-value change since the owner
// bought, from Zillow's ZHVI monthly series. Feeds the anchor-gap check as the honest,
// market-wide comparator to the gain the owner's ASK implies.
//
// ZHVI is a TYPICAL home value — never a median. The word "median" must not appear in any
// ZHVI label or source string (binding repo rule); the anchor-gap check that renders this
// value uses the source string "Zillow ZHVI (typical home value)".
//
// baseline = the first monthly point on/after the purchase month; it must be within
// MAX_BASELINE_GAP_DAYS of that month, else the series does not actually cover the purchase
// and we return null rather than anchor on a far-off point. latest = the newest point.
// pctChange = (latest − baseline) / baseline × 100. No rounding here — the check rounds for
// display; the raw value drives the check's flag math.
//
// Empty-tolerant (four-lane / ODD): no creds, no rows, no in-window baseline, a zero/invalid
// baseline, or ANY query/parse error → null. Never throws, never invents.
//
// KNOWN-DEBT(data_lake): zhvi_swfl lives in the data_lake schema, which the typed Supabase
// client intentionally does not cover — see utils/supabase/service-role.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { ZhviChange } from "./types";

/** One ZHVI monthly point as this read consumes it — nullable, as the lake returns it. */
export interface ZhviRow {
  period_end: string | null;
  home_value: number | null;
}

export interface ZhviChangeDeps {
  /** Injectable series fetch — tests never touch Supabase. The baseline selection + 92-day
   *  window are applied in loadZhviChange, so a mock can prove the window guard. */
  fetchSeries?: (zip: string) => Promise<ZhviRow[]>;
}

/** How far the first available ZHVI point may sit after the purchase month before it stops
 *  being a fair baseline. A judgment value: 92 days ≈ one quarter — the series is monthly,
 *  so a gap larger than that means the purchase month itself simply isn't covered. */
const MAX_BASELINE_GAP_DAYS = 92;
const DAY_MS = 86_400_000;

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** "2026-06-30" → "06/30/2026" (MM/DD/YYYY, the repo's as-of format). Returns the input
 *  unchanged if it isn't an ISO date, so a caller never receives an invented date. */
function toMdy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
}

async function defaultFetchSeries(zip: string): Promise<ZhviRow[]> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema("data_lake")
    .from("zhvi_swfl")
    .select("period_end, home_value")
    .eq("zip_code", zip)
    .order("period_end", { ascending: true })
    .limit(600);
  return Array.isArray(data) ? (data as ZhviRow[]) : [];
}

/**
 * The ZIP's typical-home-value % change from the purchase month to the latest ZHVI point.
 * Empty-tolerant: any error, no rows, no baseline within MAX_BASELINE_GAP_DAYS of the
 * purchase month, or a zero/invalid baseline → null.
 */
export async function loadZhviChange(
  zip: string,
  saleYear: number,
  saleMonth: number,
  deps: ZhviChangeDeps = {},
): Promise<ZhviChange | null> {
  const fetchSeries = deps.fetchSeries ?? defaultFetchSeries;
  try {
    const rows = (await fetchSeries(zip)).filter(
      (r): r is { period_end: string; home_value: number } =>
        typeof r.period_end === "string" &&
        r.period_end.length > 0 &&
        typeof r.home_value === "number" &&
        Number.isFinite(r.home_value),
    );
    if (rows.length === 0) return null;

    const saleIso = `${saleYear}-${pad2(saleMonth)}-01`;
    const saleMs = new Date(saleIso).getTime();

    // ISO date strings sort lexically = chronologically, so ascending order is safe.
    const ascending = [...rows].sort((a, b) => (a.period_end < b.period_end ? -1 : 1));

    // baseline = earliest point on/after the purchase month, within the 92-day window.
    const baseline = ascending.find((r) => r.period_end >= saleIso);
    if (!baseline) return null;
    const gapDays = (new Date(baseline.period_end).getTime() - saleMs) / DAY_MS;
    if (!(gapDays <= MAX_BASELINE_GAP_DAYS)) return null;
    if (baseline.home_value === 0) return null;

    const latest = ascending[ascending.length - 1];

    return {
      pctChange: ((latest.home_value - baseline.home_value) / baseline.home_value) * 100,
      fromMdy: `${pad2(saleMonth)}/${saleYear}`,
      asOf: toMdy(latest.period_end),
    };
  } catch {
    return null;
  }
}
