// lib/email/spec-to-png.ts
//
// EMAIL hosting wrapper over the shared chart bridge. The SVG dispatch lives in
// lib/charts/spec-to-image.ts (shared with social); this file adds the email-media
// PNG hosting + the caption. Re-exported here so every existing email import keeps
// working unchanged.
import { createHash } from "node:crypto";
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import { chartSpecToEmailSvg } from "@/lib/charts/spec-to-image";
import { svgToPng, hostEmailPng } from "@/lib/email/chart-image";
import { formatDisplayDate } from "@/lib/format-date";
import type { FontFamily } from "@/lib/email/doc/types";

export { chartSpecToEmailSvg };

export interface EmailChartImage {
  url: string;
  alt: string;
  caption: string;
}

/** The email image-block caption (the line shown UNDER the chart). Pure + exported so
 *  the Rule-2 date format is unit-tested without Supabase. Mirrors the SVG's own
 *  caption: "{title} — {source} · as of MM/DD/YYYY" — never the raw ISO/SWFL token. */
export function chartImageCaption(spec: {
  title?: string;
  source?: { citation?: string } | null;
  asOf?: string | null;
}): string {
  const title = spec.title || "Market data";
  const srcName = spec.source?.citation ?? "";
  const srcPart = srcName ? ` — ${srcName}` : "";
  const asOfPart = spec.asOf ? ` · as of ${formatDisplayDate(spec.asOf)}` : "";
  return `${title}${srcPart}${asOfPart}`;
}

/** ChartSpec → hosted PNG image spec for an EmailDoc image block. Returns null for
 *  unsupported frames or on any error — never throws (the build is never blocked). */
export async function chartSpecToEmailImage(
  spec: ChartSpec,
  accent: string,
  key: string,
  /** The doc's brand font. Charts rasterize in the BRAND's face so the image matches the
   *  email wrapped around it (operator, 08/06/2026 — a chart title in an Arial clone
   *  inside a Montserrat email is what "the font looks fucking different" was). Read it
   *  off `doc.globalStyle.fontFamily`; omitted → the product default face, never blank. */
  fontFamily?: FontFamily,
): Promise<EmailChartImage | null> {
  // The face goes into the SVG BUILD, not just the raster. Handing it only to svgToPng
  // rasterized the right typeface into a layout fitted for a different one — which is how
  // a 26-char label that "passed" its budget still painted over the bars. Both halves.
  const svg = await chartSpecToEmailSvg(spec, accent, fontFamily);
  if (!svg) return null;
  try {
    const title = spec.title || "Market data";
    const png = svgToPng(svg, { fontFamily });
    // `{hash}` in the key → the sha1 of the RENDERED BYTES. email-media is cached
    // immutable, so the key must move whenever the pixels move. A spec-JSON hash
    // (the first fix, 08/09/2026) missed the third stale-cache vector the same
    // night: a RENDERER change (line style, type scale) redraws the same spec —
    // same spec hash, same key, and every edge that ever cached it keeps the old
    // drawing forever. Hashing the PNG covers spec, builder, and rasterizer at
    // once, and it's computed here because only this function ever holds the
    // bytes before hosting. Keys without the token behave exactly as before.
    const hostKey = key.includes("{hash}")
      ? key.replace("{hash}", createHash("sha1").update(png).digest("hex").slice(0, 8))
      : key;
    const url = await hostEmailPng(hostKey, png);
    return { url, alt: title, caption: chartImageCaption(spec) };
  } catch {
    return null;
  }
}
