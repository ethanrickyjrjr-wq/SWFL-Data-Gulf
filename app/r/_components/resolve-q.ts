// app/r/_components/resolve-q.ts — q → { zip, place } for the report-family routes.
// Extracted VERBATIM from app/r/back-on-market/page.tsx (copy #2: the Why Isn't It
// Selling route needs the identical resolution). Pure; the geocoder is injectable for
// tests. A bare 5-digit query is used as the ZIP directly (no geocode call).
import { geocodeAddress, type GeocodeFn } from "@/lib/geo/geocode-address";

export const BARE_ZIP = /^\d{5}$/;

/** q → { zip, place } or null. Pure; the geocoder is injectable for tests. */
export async function resolveQToZip(
  q: string,
  deps: { geocode?: GeocodeFn } = {},
): Promise<{ zip: string; place?: string } | null> {
  const s = (q ?? "").trim();
  if (!s) return null;
  if (BARE_ZIP.test(s)) return { zip: s, place: undefined };
  const geo = await geocodeAddress(s, deps.geocode ? { geocode: deps.geocode } : {});
  if (!geo?.zip) return null;
  return { zip: geo.zip, place: undefined };
}
