// lib/should-i-sell/condo-share.ts
//
// The per-ZIP condo share — the concrete number under the always-shown SB 4-D / condo
// caveat on the Should I Sell read. It answers "does this caveat even apply to me?" with
// a real figure instead of a generic "in condo-heavy ZIPs" hedge.
//
// SOURCE, not invention: a derived aggregate of the county assessment rolls we already
// hold (Lee LeePA use_code 04 + Collier FDOR dor_uc 004), precomputed into
// fixtures/condo-share-by-zip.json. A slow-changing structural stat (annual roll), so it
// is a committed lookup, NOT a live 500k-row scan on every page load. Empty-tolerant: a
// ZIP outside the Lee/Collier parcel footprint returns null and the line simply omits —
// never a fabricated share.
import condoData from "@/fixtures/condo-share-by-zip.json";

export interface CondoShare {
  /** Share of the area's parcels that are condominiums, 0–100 (one decimal). */
  pct: number;
  /** Condo parcel count / total — provenance, so the share is auditable. */
  condoParcels: number;
  totalParcels: number;
  /** User-facing citation — our platform, per the citation rule. */
  source: { label: string; url: string };
  /** The roll's as-of, MM/DD/YYYY. */
  asOf: string;
}

interface ZipEntry {
  pct: number;
  condos: number;
  total: number;
}

const ZIPS = condoData.zips as Record<string, ZipEntry>;
const META = condoData._meta as {
  source: { label: string; url: string };
  as_of: string;
};

/** The condo share for a ZIP, or null when we hold no parcel roll for it (out of the
 *  Lee/Collier footprint). Never invents — a miss omits the line. */
export function condoShareForZip(zip: string | null | undefined): CondoShare | null {
  const key = (zip ?? "").trim();
  const entry = ZIPS[key];
  if (!entry || entry.total <= 0) return null;
  return {
    pct: entry.pct,
    condoParcels: entry.condos,
    totalParcels: entry.total,
    source: META.source,
    asOf: META.as_of,
  };
}

/** The one honest sentence rendered under the caveat. Kept here (not in the component) so
 *  the wording has a single root. States the real share and what it means; no smoothing,
 *  no magnitude-adaptive spin — the number speaks. */
export function condoShareSentence(share: CondoShare, place: string): string {
  return `About ${share.pct}% of homes in ${place} are condominiums — the segment where SB 4-D reserve-study assessments land, and it is not separated out of the score above.`;
}
