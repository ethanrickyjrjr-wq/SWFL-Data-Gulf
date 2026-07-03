import type { Metadata } from "next";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

const VALID_ZIP = /^\d{5}$/;
const FALLBACK: Metadata = { title: "ZIP Report — SWFL Data Gulf" };

/**
 * Pure metadata builder for /r/zip-report/[zip] — separated from the page so
 * bun:test can cover it directly (page.tsx imports CSS, which bun can't load).
 * Place + county come from resolveZip, the same 6-county authority the page
 * body uses; out-of-scope or malformed ZIPs get the bare fallback title, never
 * a fabricated place name. Canonical is relative — layout.tsx sets metadataBase.
 */
export function zipReportMetadata(zip: string): Metadata {
  if (!VALID_ZIP.test(zip)) return FALLBACK;
  const res = resolveZip(zip);
  if (!res.in_scope) return FALLBACK;

  const place = (res.places.find((p) => p.match === "primary") ?? res.places[0])?.place ?? null;
  const county = res.county_names[0] ?? null;

  const title = place
    ? `${place} ${zip} Market Report — SWFL Data Gulf`
    : `ZIP ${zip} Market Report — SWFL Data Gulf`;
  const where = place ? `${place}, ${zip}` : `ZIP ${zip}`;
  const description = `Home values, flood risk, and building permits for ${where}${
    county ? ` in ${county} County, FL` : ""
  } — cited to the source.`;

  return {
    title,
    description,
    alternates: { canonical: `/r/zip-report/${zip}` },
  };
}
