// lib/email/spec-to-png.ts
//
// EMAIL hosting wrapper over the shared chart bridge. The SVG dispatch lives in
// lib/charts/spec-to-image.ts (shared with social); this file adds the email-media
// PNG hosting + the caption. Re-exported here so every existing email import keeps
// working unchanged.
import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import { chartSpecToEmailSvg } from "@/lib/charts/spec-to-image";
import { svgToPng, hostEmailPng } from "@/lib/email/chart-image";
import { formatDisplayDate } from "@/lib/format-date";

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
): Promise<EmailChartImage | null> {
  const svg = await chartSpecToEmailSvg(spec, accent);
  if (!svg) return null;
  try {
    const title = spec.title || "Market data";
    const png = svgToPng(svg);
    const url = await hostEmailPng(key, png);
    return { url, alt: title, caption: chartImageCaption(spec) };
  } catch {
    return null;
  }
}
