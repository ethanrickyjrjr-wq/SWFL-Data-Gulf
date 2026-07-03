import { SWFL_ZIP_CENTROIDS } from "./zip-centroid";
import { haversineMi, resolveZip } from "@/refinery/lib/zip-resolver.mts";

/**
 * Nearest in-scope ZIPs to a given SWFL ZIP, by centroid distance (Census
 * TIGER 2020 ZCTA5 centroids, ±1–3 mi). Cross-county on purpose — "nearby"
 * for a buyer ignores county lines, and Glades/Hendry have too few ZIPs to
 * fill a same-county list. Ties break by ZIP ascending so the result is
 * deterministic. `place` comes from resolveZip (the 6-county authority);
 * an unresolvable place is null, never invented.
 */
export interface NearbyZip {
  zip: string;
  place: string | null;
  distanceMi: number;
}

export function nearestZips(zip: string, count = 5): NearbyZip[] {
  const self = zip.trim();
  const origin = SWFL_ZIP_CENTROIDS[self];
  if (!origin) return [];
  const [lat, lng] = origin;

  return Object.entries(SWFL_ZIP_CENTROIDS)
    .filter(([z]) => z !== self)
    .map(([z, [clat, clng]]) => ({ zip: z, distanceMi: haversineMi(lat, lng, clat, clng) }))
    .sort((a, b) => a.distanceMi - b.distanceMi || a.zip.localeCompare(b.zip))
    .slice(0, count)
    .map((c) => {
      const res = resolveZip(c.zip);
      const place = res.in_scope
        ? ((res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null)
        : null;
      return { zip: c.zip, place, distanceMi: Math.round(c.distanceMi * 10) / 10 };
    });
}
