// lib/should-i-sell/load-parcel-soh.ts
//
// Address → FDOR parcel row for the SOH portability calculator. Single-row honesty:
// exactly one normalized-address match in the ZIP or nothing (a multi-unit ambiguity
// is a null, never a guess). County candidates come from the ZIP's crosswalk county
// list, tried in order (straddle ZIPs try both); only Lee/Collier are queryable.
// KNOWN-DEBT(data_lake): lee_parcels / collier_parcels live in the data_lake schema,
// outside the typed client — same untyped service-role read as zip-benchmark.ts.
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";

const PARCEL_TABLE = { Lee: "lee_parcels", Collier: "collier_parcels" } as const;
type CoreCounty = keyof typeof PARCEL_TABLE;

export interface RawParcelRow {
  phy_addr1: string | null;
  jv: number | string | null;
  jv_hmstd: number | string | null;
  av_hmstd: number | string | null;
  assessment_year: number | string | null;
}

export interface ParcelSohRow {
  address: string;
  jv: number;
  jvHmstd: number;
  avHmstd: number;
  homesteaded: boolean;
  assessmentYear: number | null;
  county: CoreCounty;
}

export interface ParcelSohDeps {
  fetchRows?: (county: CoreCounty, zip: string, normalizedAddr: string) => Promise<RawParcelRow[]>;
}

/** "123  Main St Unit 4B, Fort Myers, FL" → "123 MAIN ST" (street line, no unit). */
export function normalizeStreetAddress(input: string): string {
  const street = input.split(",")[0] ?? "";
  return street
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(#|APT|UNIT|STE|LOT)\s*\S*$/i, "");
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

async function defaultFetchRows(
  county: CoreCounty,
  zip: string,
  normalizedAddr: string,
): Promise<RawParcelRow[]> {
  const db = createServiceRoleClientUntyped();
  const { data } = await db
    .schema("data_lake")
    .from(PARCEL_TABLE[county])
    .select("phy_addr1,jv,jv_hmstd,av_hmstd,assessment_year")
    .eq("phy_zipcd", zip)
    .ilike("phy_addr1", normalizedAddr)
    .limit(2);
  return (data ?? []) as RawParcelRow[];
}

/** One parcel or nothing — never throws, never guesses. */
export async function loadParcelSoh(
  zip: string,
  address: string,
  countyNames: string[],
  deps: ParcelSohDeps = {},
): Promise<ParcelSohRow | null> {
  const fetchRows = deps.fetchRows ?? defaultFetchRows;
  const normalized = normalizeStreetAddress(address);
  if (!normalized) return null;
  const candidates = countyNames.filter((c): c is CoreCounty => c === "Lee" || c === "Collier");
  for (const county of candidates) {
    try {
      const rows = await fetchRows(county, zip, normalized);
      if (rows.length !== 1) continue; // 0 = no match; 2 = ambiguous multi-unit → nothing
      const r = rows[0];
      const jv = num(r.jv);
      const jvHmstd = num(r.jv_hmstd) ?? 0;
      const avHmstd = num(r.av_hmstd) ?? 0;
      if (jv == null) continue;
      return {
        address: r.phy_addr1 ?? normalized,
        jv,
        jvHmstd,
        avHmstd,
        homesteaded: jvHmstd > 0,
        assessmentYear: num(r.assessment_year),
        county,
      };
    } catch {
      // fall through to the next candidate; a fetch failure is a null, never a throw
    }
  }
  return null;
}
