// lib/why-not-selling/parcel-read.ts — the owner's last recorded arm's-length purchase,
// from the county parcel record. Feeds the anchor-gap check (what the owner paid vs. what
// the current ask implies). It states the recorded sale as a fact; never a "bought at the
// bottom" / "sitting on equity" narrative — the reader draws the conclusion.
//
// Address match: the FDOR parcel `phy_addr1` is matched to the user's typed street via the
// SAME addressKey property identity the listing lifecycle uses (normalizeTypedUnits first,
// so "#3" and "Unit 3" collapse to one key). The ZIP + house-number prefix is only a cheap
// SQL prefilter; the exact identity equality is applied client-side below. Known miss class:
// condo units share one site address across many parcels (Marco Island 0/360) — no unique
// address-key match → return null → the anchor-gap check omits itself.
//
// Guards (documented judgment values, applied to the matched row):
//  - `multi_parcel_sale_1` present and not 'N' → the recorded price covers MORE than this
//    one parcel, so it is not the home's own sale price → omit.
//  - `sale_prc1 < 1000` → an FDOR non-arm's-length placeholder ($0/$100 deed, quitclaim,
//    intra-family transfer, or an unpriced/0 row) → not a market price → omit.
//
// Empty-tolerant (four-lane / ODD): no creds, no rows, no address-key match, a guarded row,
// or ANY query/parse error → null. Never throws, never invents.
//
// KNOWN-DEBT(data_lake): lee_parcels / collier_parcels live in the data_lake schema, which
// the typed Supabase client intentionally does not cover — see utils/supabase/service-role.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { addressKey } from "@/lib/listings/address-key";
import { normalizeTypedUnits } from "@/lib/listings/typed-address";
import type { ParcelFact } from "./types";

/** One parcel row as this read consumes it — every field nullable, as the lake returns it. */
export interface ParcelCandidateRow {
  phy_addr1: string | null;
  phy_addr2: string | null;
  phy_city: string | null;
  phy_zipcd: string | null;
  sale_prc1: number | null;
  sale_yr1: number | null;
  sale_mo1: number | null;
  actual_year_built: number | null;
  living_area_sqft: number | null;
  multi_parcel_sale_1: string | null;
}

export interface ParcelReadDeps {
  /** Injectable candidate fetch — tests never touch Supabase. The client-side address-key
   *  equality and the two sale guards are applied in loadParcelFact, so a mock can hand back
   *  non-matching or guarded rows and prove the filter. */
  fetchCandidates?: (
    streetNumber: string,
    zip: string,
    county: "Lee" | "Collier",
  ) => Promise<ParcelCandidateRow[]>;
}

const PARCEL_FIELDS =
  "phy_addr1, phy_addr2, phy_city, phy_zipcd, sale_prc1, sale_yr1, sale_mo1, actual_year_built, living_area_sqft, multi_parcel_sale_1";

/** Leading digits of a street ("15756 Modena St" → "15756"), for the ilike prefilter. Empty
 *  when the street has no leading number (a rural/named-only address); the fetch still runs. */
function streetNumberOf(street: string): string {
  return street.match(/^\s*(\d+)/)?.[1] ?? "";
}

/** The default lake read: parcels in this ZIP whose site address starts with the same house
 *  number. `phy_zipcd` is stored as a clean 5-digit `character varying`, so `.eq` on a string
 *  ZIP is exact (verified 07/19 information_schema); the exact address-key equality is applied
 *  client-side in loadParcelFact — this only narrows by ZIP + house-number prefix. */
async function defaultFetchCandidates(
  streetNumber: string,
  zip: string,
  county: "Lee" | "Collier",
): Promise<ParcelCandidateRow[]> {
  const db = createServiceRoleClientUntyped();
  const table = county === "Lee" ? "lee_parcels" : "collier_parcels";
  const { data } = await db
    .schema("data_lake")
    .from(table)
    .select(PARCEL_FIELDS)
    .eq("phy_zipcd", zip)
    .ilike("phy_addr1", `${streetNumber} %`)
    .limit(50);
  return Array.isArray(data) ? (data as ParcelCandidateRow[]) : [];
}

/**
 * The owner's last recorded arm's-length purchase for the home at `street` in `zip`.
 * Empty-tolerant: any error, no candidates, no address-key match, or a guarded row → null.
 * The two sale guards (see file header) drop non-arm's-length / multi-parcel prices so the
 * anchor-gap check never anchors on a number that isn't the home's own market sale.
 */
export async function loadParcelFact(
  street: string,
  zip: string,
  county: "Lee" | "Collier",
  deps: ParcelReadDeps = {},
): Promise<ParcelFact | null> {
  const fetchCandidates = deps.fetchCandidates ?? defaultFetchCandidates;
  try {
    const rows = await fetchCandidates(streetNumberOf(street), zip, county);
    const target = addressKey(normalizeTypedUnits(street), zip);
    const match = (Array.isArray(rows) ? rows : []).find(
      (r) =>
        typeof r.phy_addr1 === "string" &&
        r.phy_addr1.length > 0 &&
        addressKey(normalizeTypedUnits(r.phy_addr1), zip) === target,
    );
    if (!match) return null;

    // Guard 1 — a multi-parcel sale price isn't the home's own (documented judgment value).
    if (match.multi_parcel_sale_1 != null && match.multi_parcel_sale_1 !== "N") return null;
    // Guard 2 — an FDOR placeholder price is not a market sale (documented judgment value).
    if (typeof match.sale_prc1 !== "number" || match.sale_prc1 < 1000) return null;
    // A real sale needs a real recorded year + month — drop the row rather than invent one.
    if (typeof match.sale_yr1 !== "number" || typeof match.sale_mo1 !== "number") return null;

    return {
      salePrice: match.sale_prc1,
      saleYear: match.sale_yr1,
      saleMonth: match.sale_mo1,
      yearBuilt: typeof match.actual_year_built === "number" ? match.actual_year_built : null,
      livingAreaSqft: typeof match.living_area_sqft === "number" ? match.living_area_sqft : null,
      county,
    };
  } catch {
    return null;
  }
}
