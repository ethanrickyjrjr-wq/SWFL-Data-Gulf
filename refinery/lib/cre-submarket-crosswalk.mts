/**
 * CRE submarket crosswalk — every firm's free-text `submarket` → the canonical
 * SWFL submarket(s) it represents, so cross-source corroboration compares
 * like-for-like. ONE authority for the CRE-figures scope + vocabulary.
 *
 * Source-aware, built from the LIVE `data_lake.marketbeat_swfl` vocabulary
 * (probed 2026-07-18): four firms, four different submarket dialects —
 *   - colliers_industrial: 6 broad regions ("Bonita/Estero", "Cape Coral/N. Fort Myers", …)
 *   - cw_marketbeat:       18 fine submarkets (splits Fort Myers → City/South; "Lehigh Acres")
 *   - mhs_databook:        17 fine submarkets (raw slug "sfm-san-carlos"; "Lehigh")
 *   - lee_associates:      1 ("Fort Myers")
 *
 * Rules (operator-steered 07/18):
 *   - Composites FAN OUT to their constituents (Bonita/Estero → Bonita Springs + Estero);
 *     Bonita and Estero are NOT the same place, so they stay distinct canonicals.
 *   - An in-core (Lee/Collier) submarket with no explicit mapping is KEPT as itself,
 *     single-source — real professional data is never dropped for lack of a crosswalk row.
 *   - OUT-OF-CORE places (Charlotte County, Punta Gorda) resolve to [] and never enter.
 *
 * Scope authority = `places-swfl.mts` (`.county`) + `core-scope.mts` (`isCoreCounty`),
 * the same {Lee 12071, Collier 12021} root every other scoped surface uses.
 */
import { isCoreCounty } from "./core-scope.mts";
import { SUBMARKET_METADATA } from "./marketbeat-submarket-aliases.mts";
import { resolvePlace } from "./places-swfl.mts";

export type CanonicalSubmarket = string;

/**
 * County NAME for a submarket, for the core-scope gate. County-grain entries carry
 * their FIPS/type in SUBMARKET_METADATA and pass their own name through (so
 * "Charlotte County" reaches isCoreCounty and is rejected). City/area entries resolve
 * their county via places-swfl `.county` ("Lee" | "Collier" | "Charlotte"). Returns ""
 * if unresolved → treated as non-core.
 */
export function countyForSubmarket(submarket: string): string {
  const meta = SUBMARKET_METADATA[submarket];
  if (meta?.geographic_type === "county") return submarket; // "Charlotte County" | "Lee County" | "Collier County"
  return resolvePlace(submarket)?.county ?? "";
}

/**
 * The closed canonical fine-grain submarket set, Lee + Collier ONLY. Enumerated from
 * the live marketbeat_swfl vocabulary (post composite fan-out + variant normalization,
 * out-of-core dropped). Guard test: every entry resolves to Lee/Collier.
 */
export const CANONICAL_SUBMARKETS: readonly CanonicalSubmarket[] = [
  // ── Lee ──
  "Fort Myers",
  "City of Fort Myers",
  "South Fort Myers",
  "North Fort Myers",
  "Cape Coral",
  "Bonita Springs",
  "Estero",
  "Lehigh Acres",
  "San Carlos Park",
  "The Islands",
  // ── Collier ──
  "Naples",
  "East Naples",
  "North Naples",
  "Golden Gate",
  "Lely",
  "Marco Island",
  "Outlying Collier County",
];
const CANONICAL_SET = new Set<string>(CANONICAL_SUBMARKETS);

/** Broad firm submarkets that cover more than one canonical submarket → fan out. */
const COMPOSITE_FANOUT: Record<string, CanonicalSubmarket[]> = {
  "Bonita/Estero": ["Bonita Springs", "Estero"],
  "Cape Coral/N. Fort Myers": ["Cape Coral", "North Fort Myers"],
};

/** Per-firm name variants that mean the same canonical submarket. */
const NAME_NORMALIZE: Record<string, CanonicalSubmarket> = {
  Lehigh: "Lehigh Acres", // colliers/mhs; C&W medical also uses "Lehigh" (industrial says "Lehigh Acres")
  "sfm-san-carlos": "San Carlos Park", // raw MHS slug
};

/**
 * A firm's `submarket` → the canonical SWFL submarket(s) it maps onto.
 * - composite → its constituents (fan-out)
 * - known fine name (after variant-normalization) → itself
 * - in-core but unmapped → itself, single-source (never force-fit, never dropped)
 * - out-of-core / non-SWFL → [] (dropped at the boundary)
 * `firm` is accepted for future firm-specific disambiguation; today the submarket
 * strings are unambiguous across firms.
 */
export function canonicalSubmarkets(_firm: string, submarket: string): CanonicalSubmarket[] {
  const fan = COMPOSITE_FANOUT[submarket];
  if (fan) return fan.filter((s) => CANONICAL_SET.has(s));
  const name = NAME_NORMALIZE[submarket] ?? submarket;
  if (CANONICAL_SET.has(name)) return [name];
  // in-core but unmapped → keep single-source; out-of-core → drop.
  return isCoreCounty(countyForSubmarket(name)) ? [name] : [];
}
