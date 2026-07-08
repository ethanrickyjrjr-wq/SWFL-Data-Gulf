// lib/listings/listings-map.ts
//
// Pure Mapbox Static Images URL builder for a comps map — subject + comp pins on a
// street map, auto-fit to all pins. Sibling to lib/listings/aerial.ts (single-pin
// satellite); same verified URL contract, extended to multiple markers + `auto`.
//
// URL contract pinned against docs.mapbox.com/api/maps/static-images (RULE 0.4,
// 2026-07-08 — verified in-session):
//   GET styles/v1/mapbox/streets-v12/static/{overlay}/auto/{w}x{h}@2x?access_token=
//   - overlay: one or more COMMA-separated features. Marker = {name}-{label}+{color}
//     ({lon},{lat}); name = pin-s | pin-l; lon FIRST; label optional (pin-s+000(…));
//     "star" is a valid Maki label for pin-l.
//   - `auto` replaces the {lon},{lat},{zoom} position segment and fits the viewport
//     to every overlay (default padding ≤12px/side; no manual center/zoom).
//   - width/height 1-1280; @2x retina.

const MAPBOX_STATIC = "https://api.mapbox.com/styles/v1/mapbox";
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

const SUBJECT_COLOR = "e11d48"; // rose — the subject
const COMP_COLOR = "0ea5e9"; // sky — a comp

export interface MapPin {
  lat: number;
  lon: number;
  role: "subject" | "comp";
}

function valid(p: MapPin): boolean {
  return (
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    p.lat >= -85.0511 &&
    p.lat <= 85.0511 &&
    p.lon >= -180 &&
    p.lon <= 180
  );
}

export function listingsMapUrl(
  pins: MapPin[],
  opts: { width?: number; height?: number } = {},
): string | null {
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return null;
  const good = (pins ?? []).filter(valid);
  if (good.length === 0) return null;

  const width = opts.width ?? 600;
  const height = opts.height ?? 360;
  // Subject as a larger labeled star pin; comps as small dots. Subject first so it
  // rests beneath the comps only where they overlap (Z-order = list order).
  const ordered = [...good].sort(
    (a, b) => (a.role === "subject" ? -1 : 0) - (b.role === "subject" ? -1 : 0),
  );
  const markers = ordered
    .map((p) => {
      const lon = round6(p.lon);
      const lat = round6(p.lat);
      return p.role === "subject"
        ? `pin-l-star+${SUBJECT_COLOR}(${lon},${lat})`
        : `pin-s+${COMP_COLOR}(${lon},${lat})`;
    })
    .join(",");

  return `${MAPBOX_STATIC}/streets-v12/static/${markers}/auto/${width}x${height}@2x?access_token=${token}`;
}
