// lib/email/outreach/logo-raster.ts
//
// Brokerage logos often publish as SVG (e.g. BHHS's FL301_primary_cab.svg) but
// email clients strip inline SVG — a demo email needs a hosted PNG. Non-SVG URLs
// pass through untouched; SVG fetches rasterize via the chart pipeline's resvg
// (svgToPng) and host on the public email-media bucket (hostEmailMedia, idempotent
// by key). Throws on failure — enroll reports + skips the row (a broken logo would
// fail the pre-send logo gate anyway; fail fast where the operator can fix the CSV).

import { hostEmailMedia, svgToPng } from "@/lib/email/chart-image";

export interface RasterDeps {
  fetchImpl?: typeof fetch;
  raster?: typeof svgToPng;
  host?: typeof hostEmailMedia;
}

function looksSvg(url: string, contentType: string | null): boolean {
  return /\.svg(\?|#|$)/i.test(url) || (contentType ?? "").includes("image/svg");
}

const RASTER_EXT_RE = /\.(png|jpe?g|gif|webp)(\?|#|$)/i;

/**
 * Ensure `logoUrl` is an email-safe raster. Returns the original URL for raster
 * formats, or the hosted PNG URL for SVGs (`logos/<key>.png` on email-media).
 * A clearly-raster extension short-circuits without any network — the pre-send
 * logo gate (demo-gates) is the liveness check.
 */
export async function ensureRasterLogo(
  logoUrl: string,
  key: string,
  deps: RasterDeps = {},
): Promise<string> {
  if (RASTER_EXT_RE.test(logoUrl)) return logoUrl;

  const fetchImpl = deps.fetchImpl ?? fetch;
  // Extensionless URL — GET and sniff (covers extensionless SVG endpoints).
  const res = await fetchImpl(logoUrl);
  if (!res.ok) throw new Error(`logo fetch ${res.status}: ${logoUrl}`);
  const contentType = res.headers.get("content-type");
  if (!looksSvg(logoUrl, contentType)) return logoUrl;

  const svg = await res.text();
  const png = (deps.raster ?? svgToPng)(svg, { scale: 2, background: "#ffffff" });
  const safeKey = key.toLowerCase().replace(/[^a-z0-9.-]/g, "_");
  return (deps.host ?? hostEmailMedia)(`logos/${safeKey}.png`, png, "image/png");
}
