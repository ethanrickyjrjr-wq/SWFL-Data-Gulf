// lib/charts/hurricane-series.ts
//
// SWFL hurricane damage by named storm — real FEMA NFIP claims data, live lake
// query (not a brain read: brains/hurricane-tracks-fl.md is stale, pre-dates
// the 07/07/2026 county-scope correction, and never published a per-named-storm
// breakdown anyway).
//
// Charley/Irma/Ian queried 07/08/2026 via mcp__lake__query_lake, one row per
// storm year:
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
//     AND year_of_loss IN (2004, 2017, 2022)
//   GROUP BY 1 ORDER BY 1
//
// Helene/Milton re-queried 07/09/2026 — the 07/08 cut lumped them into one
// "Helene + Milton" bar because it only grouped by year_of_loss. The table
// actually carries `date_of_loss` (a real DATE, not just a year), and the
// per-day totals for 2024 show two unmistakable, isolated spikes 13 days
// apart with near-zero claims between and around them — a landfall signature,
// not calendar-year noise:
//   2024-09-26  9,385 claims  $927.4M   (Helene landfall, Big Bend FL,
//                                        per NHC/Wikipedia, verified via crawl4ai)
//   2024-10-09  8,588 claims  $451.5M   (Milton landfall, Siesta Key FL,
//                                        per NHC/Wikipedia, verified via crawl4ai)
// Split by date_of_loss window (each storm's active/immediate-aftermath
// dates, per NHC formed/dissipated dates):
//
//   SELECT CASE
//     WHEN date_of_loss BETWEEN DATE '2024-09-24' AND DATE '2024-10-01' THEN 'Helene'
//     WHEN date_of_loss BETWEEN DATE '2024-10-05' AND DATE '2024-10-12' THEN 'Milton'
//     ELSE 'Other 2024 (non-Helene/Milton)'
//   END AS storm, COUNT(*), SUM(claims...)
//   FROM pg.data_lake.fema_nfip_claims
//   WHERE state='FL' AND county_code IN (...) AND year_of_loss = 2024
//   GROUP BY 1
//
// Result: Helene $1,043,121,758 (10,786 claims) · Milton $585,633,782
// (11,324 claims) · Other 2024 $60,371,477 (1,152 claims — mostly Aug 2024
// Hurricane Debby + a June 2024 South Florida flood event, neither Helene
// nor Milton). The three sum exactly to the original combined 2024 total
// ($1,689,127,017), so this is a real re-attribution of the same claims by
// their actual loss date, not a new or invented number. "Other 2024" is
// excluded from the chart — it isn't Helene or Milton.
//
// Two honesty caveats baked into the labels/footnote below (not hidden):
//   1. `date_of_loss` isn't storm-tagged by FEMA — the windows above are this
//      chart's own boundary choice, backed by the verified landfall dates and
//      the sharp before/after gap in daily claim volume. A claim within a
//      window is attributed to that storm; it's an inference from timing, not
//      an official per-storm FEMA figure.
//   2. Charlotte + Sarasota are NOT part of SWFL Data Gulf's core coverage
//      (Lee + Collier, Hendry as a minor add — CLAUDE.md SCOPE, locked
//      07/07/2026). They're included here at the operator's explicit request
//      because these 5 storms hit them hard too and the honest total needs
//      them — flagged with an asterisk, not folded in silently as "coverage."

export interface HurricaneStormDamage {
  name: string;
  year: number;
  /** Total FEMA NFIP claims paid (building + contents + ICO), nominal USD, across all 5 counties. */
  nfipPaidUsd: number;
  claimCount: number;
  color: string;
  /** True when the figure is this chart's date-window attribution, not an official FEMA per-storm total. */
  dateWindowInferred?: boolean;
}

export const HURRICANE_STORM_DAMAGE: HurricaneStormDamage[] = [
  { name: "Charley", year: 2004, nfipPaidUsd: 50_506_322, claimCount: 5362, color: "#3DC9C0" },
  { name: "Irma", year: 2017, nfipPaidUsd: 134_455_888, claimCount: 5818, color: "#5bc97a" },
  { name: "Ian", year: 2022, nfipPaidUsd: 4_425_085_393, claimCount: 40259, color: "#d4b370" },
  {
    name: "Helene",
    year: 2024,
    nfipPaidUsd: 1_043_121_758,
    claimCount: 10786,
    color: "#e08158",
    dateWindowInferred: true,
  },
  {
    name: "Milton",
    year: 2024,
    nfipPaidUsd: 585_633_782,
    claimCount: 11324,
    color: "#a45a3d",
    dateWindowInferred: true,
  },
];

export const HURRICANE_TOTAL_NFIP_PAID_USD = HURRICANE_STORM_DAMAGE.reduce(
  (sum, s) => sum + s.nfipPaidUsd,
  0,
);

export const HURRICANE_SERIES_SOURCE = {
  citation:
    "FEMA NFIP claims paid (building + contents + ICO) via data_lake.fema_nfip_claims — Lee, Collier, Hendry, Charlotte*, Sarasota* counties, by storm.",
  footnote:
    "*Charlotte (Port Charlotte) and Sarasota are shown for storm-impact context, not SWFL Data Gulf core coverage (Lee + Collier + Hendry). Helene and Milton are split from FEMA's 2024 total by each claim's date_of_loss falling in that storm's landfall window (NHC-verified dates) — an inference from timing, not an official FEMA per-storm figure. A small remainder of 2024 claims ($60.4M, mostly Hurricane Debby + a June 2024 flood event) falls outside both windows and is excluded here.",
  homepage: "https://www.fema.gov/openfema-data-page/fima-nfip-redacted-claims-v2",
  asOf: "07/09/2026",
};
