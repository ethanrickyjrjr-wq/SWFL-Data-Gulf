// lib/assistant/comp-source-lake.ts
//
// THE LAKE COMP FEED — our own sold universe, no vendor call.
// Spec: docs/superpowers/specs/2026-07-22-comp-distance-ranker-design.md
//
// WHY THIS EXISTS. The vendor's /nearby-home-values response carries NO sale date;
// real sale dates arrive only from a per-comp enrichment capped at 2 calls. So a
// "sold in the last 6 months" window was not enforceable on the vendor feed without
// treating AVM valuation dates as sale dates — an invented fact. Operator, 07/22/2026:
// "We will find the data we need. Just set it up right." We had it.
//
// ROOT: `data_lake.lee_comp_sales_v` — sale recency + price from `leepa_parcels` (Lee
// Property Appraiser), physical characteristics from `lee_parcels` (FDOR), joined on the
// strap crosswalk that landed 07/19/2026. Live 07/22/2026: 387,609 home sales all-time,
// **8,999 in the last 6 months**, 41 ZIPs, newest 06/01/2026.
//
// TWO PROPERTIES OF THIS SOURCE THAT MUST NOT BE FORGOTTEN:
//   1. `sale_month` is MONTH GRAIN. Every `last_sale_date` is day-of-month 1 (all 31,632
//      rows in the trailing 12 months). Candidates are tagged `dateGrain: "month"` so the
//      renderer says "May 2026" and never a fabricated "05/01/2026".
//   2. NEITHER source has bedroom or bathroom columns. Beds/baths are null by construction;
//      living area is the home test (land has none), per Fannie B4-1.3-08's ban on mixing
//      vacant-land sales into a home comp set.
//
// LEE ONLY. Collier's parcel table carries FDOR month-grain sale fields with no
// exact-date equivalent, so Collier needs its own source before it can be served.

// KNOWN-DEBT(data_lake: this view lives in the data_lake schema, which the typed
// Supabase client intentionally does not cover — see utils/supabase/service-role.ts):
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import type { CompCandidate, CompSubject } from "./comp-rank";

/** One row of `data_lake.lee_comp_sales_v`. */
export interface LeeCompSaleRow {
  parcel_strap: string | null;
  address_line: string | null;
  city: string | null;
  zip_code: string | null;
  living_area_sqft: number | null;
  year_built: number | null;
  /** FDOR use code — the real property class. Phase 2's class-match filter (F4). */
  dor_use_code: string | null;
  /** MONTH GRAIN. Always day-of-month 1; never render as an exact date. */
  sale_month: string | null;
  sale_price: number | null;
}

export const LEE_COMP_VIEW = "lee_comp_sales_v";
export const LEE_COMP_COLUMNS =
  "parcel_strap, address_line, city, zip_code, living_area_sqft, year_built, dor_use_code, sale_month, sale_price";

/** Row cap. The bounded-read guard (failure mode F6) — a comp lookup must never
 *  approach a scan of a 387k-row view. Comfortably above any real ZIP's 6-month
 *  in-band sold count, so the cap never silently truncates a legitimate result. */
const ROW_CAP = 500;

/** Size band, tiers 1-2. OURS, not a cited standard — Fannie publishes no percentage. */
const BAND_PCT = 0.25;

export interface LakeCompFilters {
  /** ISO date; the HARD 6-month window (operator decree 07/22/2026). */
  saleMonthGte: string;
  sqftGte: number;
  sqftLte: number;
  zip: string | null;
  limit: number;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * PURE. The bounded filter set for one subject.
 *
 * Every read is constrained on all three axes at once — window, size band, row cap —
 * so there is no code path that reads the view unbounded.
 */
export function lakeCompFilters(
  subject: CompSubject,
  now: Date,
  opts: { windowMonths?: number; bandPct?: number; limit?: number } = {},
): LakeCompFilters {
  const windowMonths = opts.windowMonths ?? 6;
  const bandPct = opts.bandPct ?? BAND_PCT;

  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - windowMonths);

  return {
    saleMonthGte: isoDay(cutoff),
    sqftGte: Math.floor(subject.sqft * (1 - bandPct)),
    sqftLte: Math.ceil(subject.sqft * (1 + bandPct)),
    zip: subject.zip ?? null,
    limit: opts.limit ?? ROW_CAP,
  };
}

/**
 * PURE. One view row -> a rankable candidate, or null when the row cannot honestly
 * serve as a comp. Dropped rather than defaulted: a missing sale date, a missing
 * living area (that is land), or a missing address (a comp the reader cannot verify).
 */
export function lakeRowToCandidate(row: LeeCompSaleRow): CompCandidate | null {
  if (!row.sale_month) return null;
  if (row.living_area_sqft == null || row.living_area_sqft <= 0) return null;
  if (!row.address_line) return null;

  return {
    addressLine: row.address_line,
    city: row.city ?? "",
    zip: row.zip_code ?? null,
    // Neither leepa_parcels nor lee_parcels has a bedroom or bathroom column.
    // Null is the honest value; the ranker skips absent features rather than
    // scoring them as zero.
    beds: null,
    baths: null,
    sqft: row.living_area_sqft,
    price: row.sale_price ?? null,
    priceDate: row.sale_month,
    // The load-bearing tag: month grain in, month grain out.
    dateGrain: "month",
  };
}

export interface LakeCompDeps {
  /** DI seam so the ranker path is testable with no database. */
  fetchRows?: (f: LakeCompFilters) => Promise<LeeCompSaleRow[]>;
}

/**
 * Fetch candidate sold comps for a subject from our own lake.
 *
 * Empty-tolerant by contract (four-lane / ODD): no creds, no rows, or any query error
 * yields `[]` and never throws. An empty result means "we found no qualifying sales",
 * which the ranker reports as the standard not being met — it never becomes a claim
 * that the market had no sales.
 */
export async function fetchLeeComps(
  subject: CompSubject,
  now: Date,
  deps: LakeCompDeps = {},
): Promise<CompCandidate[]> {
  const filters = lakeCompFilters(subject, now);

  const fetchRows =
    deps.fetchRows ??
    (async (f: LakeCompFilters): Promise<LeeCompSaleRow[]> => {
      const db = createServiceRoleClientUntyped();
      let q = db
        .schema("data_lake")
        .from(LEE_COMP_VIEW)
        .select(LEE_COMP_COLUMNS)
        .gte("sale_month", f.saleMonthGte)
        .gte("living_area_sqft", f.sqftGte)
        .lte("living_area_sqft", f.sqftLte);
      if (f.zip) q = q.eq("zip_code", f.zip);
      const { data } = await q.limit(f.limit);
      return Array.isArray(data) ? (data as unknown as LeeCompSaleRow[]) : [];
    });

  try {
    const rows = await fetchRows(filters);
    return rows.map(lakeRowToCandidate).filter((c): c is CompCandidate => c !== null);
  } catch {
    return [];
  }
}
