/** Pure ranking for the zip page news section. Order: point items in the
 * ~3mi primary band (trade-area basis: ingest/event-radius-config.yaml) or in
 * the ZIP itself → neighborhood items in the ZIP → city-wide items. Bigger
 * grains are labeled by the renderer, never hidden. Newest first within grain. */
export interface PulseGeoRow {
  fact: string;
  topic: string;
  city: string;
  location_anchor: string | null;
  source_url: string;
  source_title: string | null;
  cited_text: string | null;
  captured_at: string;
  zip_code: string | null;
  lat: number | null;
  lon: number | null;
  geo_grain: "point" | "neighborhood" | "city" | "county" | null;
}

export interface NearbyPulseItem extends PulseGeoRow {
  distance_mi: number | null;
}

export const PRIMARY_BAND_MI = 3;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dphi = toRad(lat2 - lat1);
  const dlam = toRad(lon2 - lon1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dlam / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const GRAIN_ORDER = { point: 0, neighborhood: 1, city: 2, county: 3 } as const;

export function rankNearby(
  rows: PulseGeoRow[],
  zip: string,
  center: { lat: number; lng: number } | null,
  limit: number,
): NearbyPulseItem[] {
  const kept: NearbyPulseItem[] = [];
  for (const r of rows) {
    const grain = r.geo_grain;
    if (grain === "point") {
      const distance_mi =
        center && r.lat != null && r.lon != null
          ? haversineMiles(center.lat, center.lng, r.lat, r.lon)
          : null;
      if (r.zip_code === zip || (distance_mi != null && distance_mi <= PRIMARY_BAND_MI)) {
        kept.push({ ...r, distance_mi });
      }
    } else if (grain === "neighborhood") {
      if (r.zip_code === zip) kept.push({ ...r, distance_mi: null });
    } else if (grain === "city" || grain === "county") {
      kept.push({ ...r, distance_mi: null }); // caller pre-filtered to this ZIP's city
    }
  }
  kept.sort((a, b) => {
    const g =
      GRAIN_ORDER[a.geo_grain as keyof typeof GRAIN_ORDER] -
      GRAIN_ORDER[b.geo_grain as keyof typeof GRAIN_ORDER];
    if (g !== 0) return g;
    return b.captured_at.localeCompare(a.captured_at);
  });
  return kept.slice(0, limit);
}
