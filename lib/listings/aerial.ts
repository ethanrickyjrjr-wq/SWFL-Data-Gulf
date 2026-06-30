// lib/listings/aerial.ts
//
// Pure Mapbox Static Images URL builder — the licensed-NOW property visual. A
// listing has no photo (RentCast returns none; no aggregator gives licensed photos),
// but it has lat/lon, so we render a pinned satellite aerial of the lot. This is an
// AERIAL, captioned as such by the caller — never implied to be a glamour photo.
//
// URL contract pinned against docs.mapbox.com/api/maps/static-images (RULE 0.4,
// 2026-06-30):
//   GET styles/v1/{user}/{style}/static/{overlay}/{lon},{lat},{zoom}/{w}x{h}@2x?access_token=
//   - lon FIRST, then lat. zoom 0-22, width/height 1-1280.
//   - satellite-streets-v12 = satellite imagery + street labels (a vector style → PNG).
//   - token needs the styles:tiles scope (the public pk. token has it).

const MAPBOX_STATIC = "https://api.mapbox.com/styles/v1/mapbox";
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Build a satellite aerial URL centered on a coordinate, with a pin marking the lot.
 * Returns `null` when there is no `MAPBOX_TOKEN` or the coordinates are out of the
 * Web-Mercator range — so a missing token degrades to "no photo", never a broken image.
 */
export function aerialUrl(opts: {
  lat: number;
  lon: number;
  zoom?: number;
  width?: number;
  height?: number;
  /** Render the pin marking the lot (default true). */
  marker?: boolean;
}): string | null {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const { lat, lon } = opts;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -85.0511 || lat > 85.0511 || lon < -180 || lon > 180) return null;

  const zoom = opts.zoom ?? 16;
  const width = opts.width ?? 600;
  const height = opts.height ?? 360;
  const lonR = round6(lon);
  const latR = round6(lat);
  const overlay = opts.marker === false ? "" : `/pin-l+e11d48(${lonR},${latR})`;
  return `${MAPBOX_STATIC}/satellite-streets-v12/static${overlay}/${lonR},${latR},${zoom}/${width}x${height}@2x?access_token=${token}`;
}
