// KNOWN-DEBT(data_lake: city_pulse_corridors lives in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { rankCorridorPulse, type CorridorPulseRow, type NearbyPulseItem } from "./nearby-rank";

/**
 * "What's happening along {corridor}" loader — Phase E reuse of the Phase C
 * geo columns on data_lake.city_pulse_corridors (TTL'd, supersession-filtered,
 * same hygiene as the zip loader). Empty-tolerant by contract: no lake creds,
 * no rows, or any query error → [] and the page section renders nothing.
 */

const LIMIT = 10;

export async function loadPulseNearbyCorridor(
  slug: string,
  displayName: string,
): Promise<NearbyPulseItem[]> {
  let supabase: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    supabase = createServiceRoleClientUntyped();
  } catch {
    return []; // no lake creds in this env — degrade, never throw
  }
  try {
    const { data, error } = await supabase
      .schema("data_lake")
      .from("city_pulse_corridors")
      .select(
        "fact, topic, corridor, location_anchor, source_url, source_title, cited_text, captured_at, zip_code, lat, lon, geo_grain",
      )
      .is("superseded_by", null)
      .gt("expires_at", new Date().toISOString())
      .order("captured_at", { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return rankCorridorPulse(data as CorridorPulseRow[], slug, displayName, LIMIT);
  } catch {
    return [];
  }
}
