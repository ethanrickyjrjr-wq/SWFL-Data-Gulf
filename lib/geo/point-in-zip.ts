// lib/geo/point-in-zip.ts — ZIP resolution for a coordinate, and the SOURCED
// ZIP -> city lane.
//
// WHY: scopeCity() (lib/listings/select.ts) does NOT resolve a ZIP to its city —
// it maps ZIP -> county -> the county's ANCHOR city, so 33919 (Fort Myers)
// resolves to "Cape Coral" (open check zip_scope_resolves_to_county_anchor_city).
// Anything needing the REAL city for a ZIP uses cityForZipSourced here.
//
// Geometry is the tracked 2020 TIGERweb ZCTA fixture — no network, no vendor call.
//
// FIXTURE SHAPE, read before coding (it is NOT a GeoJSON FeatureCollection):
//   { zip_count: 58, multipolygon_zips: ["33956","34102"],
//     entries: [ { zip: "33901", geometry: { type, coordinates } }, ... ] }
// An implementation reading `.features` / `.properties.zip` compiles fine and
// silently resolves NOTHING — it would just always return null.
import zipPolygons from "@/fixtures/swfl-zip-polygons.json";
import placeCrosswalk from "@/fixtures/swfl-place-zip-crosswalk.json";
import { cityForZip } from "@/lib/swfl-zip-city";
// The ray-cast moved to lib/geo/ray-cast.ts 08/04/2026 — it was private here while a
// second copy lived in Python and a third was about to be written for vendor
// neighborhood boundaries. Same functions, same behavior; this file just stopped
// owning geometry it wasn't the only user of.
import { inPolygon, type Ring } from "@/lib/geo/ray-cast";

interface ZipEntry {
  zip?: string;
  geometry?: { type?: string; coordinates?: unknown };
}

const ENTRIES: ZipEntry[] = (zipPolygons as { entries?: ZipEntry[] }).entries ?? [];

/** The ZIP whose ZCTA boundary contains this point, or null. Never guesses.
 *  MultiPolygon-aware — the fixture declares two (33956, 34102), and a
 *  Polygon-only reader silently drops both. */
export function zipForPoint(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const e of ENTRIES) {
    const zip = e.zip;
    const g = e.geometry;
    if (!zip || !g?.coordinates) continue;
    if (g.type === "Polygon") {
      if (inPolygon(lon, lat, g.coordinates as Ring[])) return zip;
    } else if (g.type === "MultiPolygon") {
      for (const poly of g.coordinates as Ring[][]) {
        if (inPolygon(lon, lat, poly)) return zip;
      }
    }
  }
  return null;
}

interface CrosswalkEntry {
  zip?: string;
  alt_zips?: string[];
  usps_preferred_city?: string;
}

const CITY_BY_ZIP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  const entries: CrosswalkEntry[] =
    (placeCrosswalk as { entries?: CrosswalkEntry[] }).entries ?? [];
  // Primaries first, so a primary always wins over another place's alt.
  for (const e of entries) if (e.zip && e.usps_preferred_city) m.set(e.zip, e.usps_preferred_city);
  for (const e of entries) {
    if (!e.usps_preferred_city) continue;
    for (const alt of e.alt_zips ?? []) if (!m.has(alt)) m.set(alt, e.usps_preferred_city);
  }
  return m;
})();

/** The real USPS-preferred city for a ZIP — the SOURCED lane (the crosswalk carries
 *  its own `source` + `verified_date` per entry), falling back to the unsourced
 *  lib/swfl-zip-city map so the caller stays total. NEVER the county anchor. */
export function cityForZipSourced(zip: string): string | null {
  const z = zip.trim();
  if (!z) return null;
  return CITY_BY_ZIP.get(z) ?? cityForZip(z) ?? null;
}
