import type { Metadata } from "next";
import { resolveZip } from "@/refinery/lib/zip-resolver.mts";

const VALID_ZIP = /^\d{5}$/;
// Bare page title — root layout.tsx's title.template ("%s — SWFL Data Gulf")
// appends the site suffix at render time. Do NOT append it here too: a title
// string returned from generateMetadata is fed through that template, so a
// suffix baked in here would double up ("... — SWFL Data Gulf — SWFL Data
// Gulf", caught live on /r/zip-report/33904 09/02/2026).
const FALLBACK: Metadata = { title: "ZIP Report" };

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

  // No "— SWFL Data Gulf" here — layout.tsx's title.template adds it once.
  const title = place ? `${place} ${zip} Market Report` : `ZIP ${zip} Market Report`;
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
