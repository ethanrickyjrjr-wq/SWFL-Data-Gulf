// lib/charts/hurricane-series.ts
//
// SWFL hurricane damage by named storm — real FEMA NFIP claims data, live lake
// query (not a brain read: brains/hurricane-tracks-fl.md is stale, pre-dates
// the 07/07/2026 county-scope correction, and never published a per-named-storm
// breakdown anyway). Query run 07/08/2026 via mcp__lake__query_lake:
//
//   SELECT year_of_loss,
//          SUM(COALESCE(amount_paid_on_building_claim,0)
//            + COALESCE(amount_paid_on_contents_claim,0)
//            + COALESCE(amount_paid_on_ico_claim,0)) AS nfip_paid_usd,
//          COUNT(*) AS claim_count
//   FROM pg.data_lake.fema_nfip_claims
//   WHERE state = 'FL'
//     AND county_code IN ('12071','12021','12051','12015','12115')  -- Lee, Collier,
//                                                                     -- Hendry, Charlotte, Sarasota
//     AND year_of_loss IN (2004, 2017, 2022, 2024)
//   GROUP BY 1 ORDER BY 1
//
// Two honesty caveats baked into the labels/footnote below (not hidden):
//   1. NFIP claims are dated by calendar year, not by individual storm. 2024
//      carries BOTH Helene and Milton — there is no way to split that total
//      between the two storms from this source, so it's labeled as both.
//   2. Charlotte + Sarasota are NOT part of SWFL Data Gulf's core coverage
//      (Lee + Collier, Hendry as a minor add — CLAUDE.md SCOPE, locked
//      07/07/2026). They're included here at the operator's explicit request
//      because these 4 storms hit them hard too and the honest total needs
//      them — flagged with an asterisk, not folded in silently as "coverage."

export interface HurricaneStormDamage {
  name: string;
  year: number;
  /** Total FEMA NFIP claims paid (building + contents + ICO), nominal USD, across all 5 counties. */
  nfipPaidUsd: number;
  claimCount: number;
  color: string;
  /** True when the year's total can't be cleanly attributed to this storm alone. */
  sharedYear?: boolean;
}

export const HURRICANE_STORM_DAMAGE: HurricaneStormDamage[] = [
  { name: "Charley", year: 2004, nfipPaidUsd: 50_506_322, claimCount: 5362, color: "#3DC9C0" },
  { name: "Irma", year: 2017, nfipPaidUsd: 134_455_888, claimCount: 5818, color: "#5bc97a" },
  { name: "Ian", year: 2022, nfipPaidUsd: 4_425_085_393, claimCount: 40259, color: "#d4b370" },
  {
    name: "Helene + Milton",
    year: 2024,
    nfipPaidUsd: 1_689_127_017,
    claimCount: 23262,
    color: "#e08158",
    sharedYear: true,
  },
];

export const HURRICANE_TOTAL_NFIP_PAID_USD = HURRICANE_STORM_DAMAGE.reduce(
  (sum, s) => sum + s.nfipPaidUsd,
  0,
);

export const HURRICANE_SERIES_SOURCE = {
  citation:
    "FEMA NFIP claims paid (building + contents + ICO) via data_lake.fema_nfip_claims — Lee, Collier, Hendry, Charlotte*, Sarasota* counties, by storm year.",
  footnote:
    "*Charlotte (Port Charlotte) and Sarasota are shown for storm-impact context, not SWFL Data Gulf core coverage (Lee + Collier + Hendry). 2024 combines Helene and Milton — NFIP claims are dated by calendar year, not by individual storm, so the two can't be split from this source.",
  homepage: "https://www.fema.gov/openfema-data-page/fima-nfip-redacted-claims-v2",
  asOf: "07/08/2026",
};
