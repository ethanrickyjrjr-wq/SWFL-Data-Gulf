/**
 * parcel-zip-scope — the ONE primary-county gate for per-ZIP parcel rows.
 *
 * Three ZIPs straddle the Lee/Collier line (parcel counts live-verified 07/19/2026
 * against data_lake.lee_parcels / collier_parcels, agreeing with the
 * swfl-zip-county.json crosswalk in every case):
 *
 *   34110 — Lee 379    / Collier 16,174  → primary Collier
 *   34119 — Lee 234    / Collier 19,103  → primary Collier
 *   34134 — Lee 13,611 / Collier 1,859   → primary Lee (Bonita Springs)
 *
 * Both county parcel connectors (lee-parcels-source, collier-parcels-source) filter
 * their zip-summary rows through this predicate so a straddle ZIP appears in exactly
 * ONE county's detail table — otherwise the zip-report `assessed_value` / `soh_gap`
 * concepts would render two competing candidates for the same ZIP (the duplicate-key
 * defect class tracked for 33936 Lee/Hendry), and the minority-sliver county's median
 * (e.g. 34134's 1,859 Collier parcels vs 13,611 Lee) would misrepresent the ZIP.
 * County assignment comes from resolveZip's crosswalk — never re-derived here.
 */
import { resolveZip, type CountyFips } from "./zip-resolver.mts";

export const LEE_FIPS: CountyFips = "12071";
export const COLLIER_FIPS: CountyFips = "12021";

/** True when the ZIP is in the SWFL footprint AND its primary county is `county`. */
export function zipInPrimaryCounty(zip: string, county: CountyFips): boolean {
  const r = resolveZip(zip);
  return r.in_scope && r.primary_county === county;
}
