// lib/charts/load-metro-trend.ts
//
// Load the 3-metro (Cape Coral · Fort Myers · Naples) monthly trend from a data_lake
// pivoted view, shaped for MetroAreaChart. Mirrors app/charts/page.tsx loadMetros, but
// GUARDS service-role construction so a caller WITHOUT lake creds (e.g. the zip report
// rendered in an env without SUPABASE_SERVICE_KEY) degrades to an empty chart rather
// than throwing — the report page must never regress to a 500 just for adding a chart.

// KNOWN-DEBT(data_lake: metro-trend view lives in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { mapPivotedCityRows } from "@/lib/charts/pivoted-series";
import type { ChartRow, PivotedCityMonth } from "@/types/viz";

export interface MetroTrendPanel {
  data: ChartRow[];
  asOf?: string;
  error: string | null;
}

/** view: "zhvi_pivoted" (home values) | "zori_pivoted" (rents). */
export async function loadMetroTrend(view = "zhvi_pivoted"): Promise<MetroTrendPanel> {
  let supabase: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    supabase = createServiceRoleClientUntyped();
  } catch (err) {
    // No lake creds in this env — degrade to empty, never throw.
    return { data: [], error: err instanceof Error ? err.message : String(err) };
  }
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from(view)
      .select("month, cape_coral, fort_myers, naples")
      .order("month", { ascending: true });
    if (error) return { data: [], error: error.message };
    const mapped = mapPivotedCityRows(data as PivotedCityMonth[] | null);
    const rows: ChartRow[] = mapped.entries.map((e) => ({
      month: e.month,
      cape_coral: e.cape_coral,
      fort_myers: e.fort_myers,
      naples: e.naples,
    }));
    return { data: rows, asOf: mapped.asOf, error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : String(err) };
  }
}
