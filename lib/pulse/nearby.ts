import centroids from "@/fixtures/swfl-zip-centroids.json";
import crosswalk from "@/fixtures/swfl-place-zip-crosswalk.json";
// KNOWN-DEBT(data_lake: city_pulse lives in the data_lake schema (typed public only))
import { createServiceRoleClientUntyped } from "@/utils/supabase/service-role";
import { rankNearby, type NearbyPulseItem, type PulseGeoRow } from "./nearby-rank";

/**
 * "What's happening near {ZIP}" loader (Phase C, zip-page-destination spec).
 *
 * Reads live `data_lake.city_pulse` rows (TTL'd, supersession-filtered — same
 * hygiene as the brain source) and ranks them for one ZIP: point items in the
 * ~3mi primary band or in the ZIP → neighborhood items in the ZIP → city-wide
 * items for this ZIP's city (reverse place→ZIP crosswalk; a city spans many
 * ZIPs, so city items carry no zip_code of their own — G1).
 *
 * Empty-tolerant by contract: no lake creds, no rows, or any query error →
 * [] and the page section renders nothing (page identical to today).
 */

const LIMIT = 10;

interface CentroidEntry {
  zip: string;
  lat: number;
  lng: number;
}

interface CrosswalkEntry {
  place: string;
  zip: string;
  alt_zips: string[];
  usps_preferred_city: string;
}

function zipCentroid(zip: string): { lat: number; lng: number } | null {
  const hit = (centroids as { entries: CentroidEntry[] }).entries.find((e) => e.zip === zip);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

/** Reverse crosswalk: which pulse-covered city names claim this ZIP. Both the
 * place label and the USPS preferred city are candidates — the pulse pipeline
 * keys rows on colloquial city names (e.g. "Estero", "Fort Myers"). */
function citiesForZip(zip: string): string[] {
  const names = new Set<string>();
  for (const e of (crosswalk as { entries: CrosswalkEntry[] }).entries) {
    if (e.zip === zip || (e.alt_zips ?? []).includes(zip)) {
      names.add(e.place);
      if (e.usps_preferred_city) names.add(e.usps_preferred_city);
    }
  }
  return [...names];
}

export async function loadPulseNearby(zip: string): Promise<NearbyPulseItem[]> {
  let supabase: ReturnType<typeof createServiceRoleClientUntyped>;
  try {
    supabase = createServiceRoleClientUntyped();
  } catch {
    return []; // no lake creds in this env — degrade, never throw
  }
  const cities = citiesForZip(zip);
  try {
    const sel =
      "fact, topic, city, location_anchor, source_url, source_title, cited_text, captured_at, zip_code, lat, lon, geo_grain";
    const nowIso = new Date().toISOString();
    const geocodedQuery = supabase
      .schema("data_lake")
      .from("city_pulse")
      .select(sel)
      .in("geo_grain", ["point", "neighborhood"])
      .is("superseded_by", null)
      .gt("expires_at", nowIso)
      .order("captured_at", { ascending: false })
      .limit(200);
    const cityWideQuery = supabase
      .schema("data_lake")
      .from("city_pulse")
      .select(sel)
      .in("city", cities.length ? cities : ["__none__"])
      .or("geo_grain.eq.city,geo_grain.is.null")
      .is("superseded_by", null)
      .gt("expires_at", nowIso)
      .order("captured_at", { ascending: false })
      .limit(25);
    const [geocoded, cityWide] = await Promise.all([geocodedQuery, cityWideQuery]);
    if (geocoded.error || cityWide.error) return [];
    const rows: PulseGeoRow[] = [
      ...((geocoded.data ?? []) as PulseGeoRow[]),
      ...((cityWide.data ?? []) as PulseGeoRow[]).map((r) => ({
        ...r,
        // legacy rows pre-date the geo columns; their native grain is city
        geo_grain: "city" as const,
      })),
    ];
    return rankNearby(rows, zip, zipCentroid(zip), LIMIT);
  } catch {
    return [];
  }
}
