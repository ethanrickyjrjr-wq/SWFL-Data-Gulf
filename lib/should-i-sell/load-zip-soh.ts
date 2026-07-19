// lib/should-i-sell/load-zip-soh.ts
//
// The always-on ZIP line for the SOH section — read off ALREADY-PUBLISHED brain
// output (no ingest, no metered calls), the same seam as load-market-snapshot.
// County candidates from the crosswalk list first, then the other core county:
// the per-ZIP parcel tables place straddle ZIPs by their own primary-county rule,
// so a ZIP can live in the "other" county's table. Nullable end-to-end.
import { loadParsedBrain } from "../fetch-brain";
import type { ParsedBrain } from "../../refinery/render/speaker.mts";
import { asOfMdy } from "./load-market-snapshot";

const COUNTY_BRAIN = {
  Lee: { slug: "properties-lee-value", tableId: "lee_parcels_by_zip" },
  Collier: { slug: "properties-collier-value", tableId: "collier_parcels_by_zip" },
} as const;
type CoreCounty = keyof typeof COUNTY_BRAIN;

export interface ZipSohLine {
  sohGapMedianPct: number;
  homesteadedCount: number | null;
  medianJv: number | null;
  county: CoreCounty;
  source: { label: string; url: string; asOf: string };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function loadZipSoh(
  zip: string,
  countyNames: string[],
  deps: { loadBrain?: (slug: string) => Promise<ParsedBrain | null> } = {},
): Promise<ZipSohLine | null> {
  const loadBrain = deps.loadBrain ?? loadParsedBrain;
  const named = countyNames.filter((c): c is CoreCounty => c === "Lee" || c === "Collier");
  const candidates = [...named, ...(["Lee", "Collier"] as const).filter((c) => !named.includes(c))];
  for (const county of candidates) {
    try {
      const brain = await loadBrain(COUNTY_BRAIN[county].slug);
      const table = brain?.output?.detail_tables?.find(
        (t) => t.id === COUNTY_BRAIN[county].tableId,
      );
      const row = table?.rows.find((r) => r.key === zip);
      const pct = num(row?.cells["soh_gap_median_pct"]);
      if (row == null || pct == null) continue;
      return {
        sohGapMedianPct: pct,
        homesteadedCount: num(row.cells["homesteaded_count"]),
        medianJv: num(row.cells["median_jv"]),
        county,
        source: {
          label: `FDOR Statewide Cadastral — ${county} County tax roll`,
          url: "https://floridarevenue.com/dataPortal",
          asOf: asOfMdy(table?.source?.fetched_at),
        },
      };
    } catch {
      // next candidate — a load failure is a missing line, never a throw
    }
  }
  return null;
}
