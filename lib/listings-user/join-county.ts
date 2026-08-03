// lib/listings-user/join-county.ts
// Import-time lake join, v1: ZIP from the listing's own site address text
// (ZIP gate G1 — site address only, never a mailing-address column), county
// via the fixtures/swfl-zip-county.json crosswalk. Free, deterministic, no
// vendor calls in the import loop (rule 11). parcel_id deliberately stays
// null at import — the heavyweight lake-first subject resolution
// (lib/listings/resolve-subject.ts) runs at BUILD time where it already
// exists.
//
// Fixture shape (verified 08/02/2026): { entries: [{ zip, counties: [FIPS],
// primary_county: FIPS, county_names: [name] }] } — name resolved via the
// primary county's index in `counties`.
import crosswalk from "@/fixtures/swfl-zip-county.json";
import type { UserListingRow } from "./parse-listings-csv";

interface CrosswalkEntry {
  zip: string;
  counties: string[];
  primary_county: string;
  county_names: string[];
}

const BY_ZIP: Map<string, string> = new Map(
  ((crosswalk as { entries: CrosswalkEntry[] }).entries ?? []).map((e) => {
    const idx = Math.max(e.counties.indexOf(e.primary_county), 0);
    return [e.zip, e.county_names[idx] ?? e.county_names[0] ?? ""];
  }),
);

const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/g;

export function joinCounty(row: UserListingRow): {
  zip_code: string | null;
  county: string | null;
} {
  const matches = [...row.address.matchAll(ZIP_RE)].map((m) => m[1]);
  const zip = matches.length > 0 ? matches[matches.length - 1] : null;
  if (!zip) return { zip_code: null, county: null };
  return { zip_code: zip, county: BY_ZIP.get(zip) || null };
}
