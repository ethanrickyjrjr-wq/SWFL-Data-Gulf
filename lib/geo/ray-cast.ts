// lib/geo/ray-cast.ts — THE ONE point-in-polygon authority.
//
// Extracted 08/04/2026 from point-in-zip.ts, which held the only TS ray-cast while
// ingest/pipelines/neighborhood_amenities/distill.py held a second one in Python.
// A third copy was about to be written for vendor neighborhood boundaries; this file
// exists so it wasn't. Geometry is geometry — the ZIP fixture and a vendor GeoJSON
// polygon are the same problem.
//
// Both readers pass GeoJSON coordinate order: [lon, lat]. Getting that backwards
// compiles fine and silently matches nothing, so the argument order is (lon, lat)
// everywhere in this file, never (lat, lon).

export type Ring = [number, number][];

/** Standard ray-casting against ONE ring. `ring` is GeoJSON order: [lon, lat]. */
export function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    const straddles = yi > lat !== yj > lat;
    if (straddles && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A polygon is [outerRing, ...holes] — inside the outer ring and in no hole. */
export function inPolygon(lon: number, lat: number, poly: Ring[]): boolean {
  const outer = poly[0];
  if (!outer || !inRing(lon, lat, outer)) return false;
  for (let h = 1; h < poly.length; h++) {
    const hole = poly[h];
    if (hole && inRing(lon, lat, hole)) return false;
  }
  return true;
}

/** Loose GeoJSON geometry — what a jsonb column hands back, shape unvalidated. */
export interface GeoJsonGeometry {
  type?: string;
  coordinates?: unknown;
}

/**
 * True when (lon, lat) falls inside a GeoJSON Polygon or MultiPolygon.
 *
 * MultiPolygon-aware: a Polygon-only reader silently drops every multipart shape
 * (the ZIP fixture declares two, 33956 and 34102). Unknown/absent geometry is
 * false, never a throw — a malformed boundary must cost a miss, not a crash.
 *
 * NOTE: unlike distill.py's `property_in_boundary`, holes ARE honored here (via
 * inPolygon). The Python side ignores them deliberately, because there a hole miss
 * costs one redundant vendor call; here it would cost a WRONG community on a
 * listing, which ships as a stated fact.
 */
export function pointInGeometry(lon: number, lat: number, geometry: unknown): boolean {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  const g = geometry as GeoJsonGeometry | null | undefined;
  if (!g || !g.coordinates) return false;
  if (g.type === "Polygon") return inPolygon(lon, lat, g.coordinates as Ring[]);
  if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates as Ring[][]) {
      if (poly && inPolygon(lon, lat, poly)) return true;
    }
  }
  return false;
}
