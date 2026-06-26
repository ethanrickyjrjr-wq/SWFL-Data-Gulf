// lib/email/spec-to-png.ts
//
// THE BRIDGE: a ChartSpec (the ONE chart contract that powers chat + /p decks via
// buildChartForQuestion / composeChartFromRequest / computeMetricChart) → a hosted
// PNG for email. The registry's React FrameRenderer can't run in email (clients
// strip JS/SVG), so email shares the SELECTION + DATA (the spec) and only the final
// RENDER branches here: spec → static SVG → resvg PNG → hosted email-media URL.
//
// Supported frames: bar-table (the generic any-brain bar, the dominant output) and
// time-series (zhvi-area). Anything else returns null → the build proceeds with no
// chart (best-effort, never blocks — RULE 0.7).

import type { ChartSpec } from "@/components/charts/registry/chart-spec";
import type { ValueFormat } from "@/lib/charts/format";
import {
  trendChartSvg,
  barChartSvg,
  svgToPng,
  hostEmailPng,
  type TrendPoint,
} from "@/lib/email/chart-image";

/** Map a ChartBlock value_format to the chart-image value root's ValueFormat. */
function mapValueFormat(vf?: string): ValueFormat {
  switch (vf) {
    case "usd":
    case "aal":
      return "usd";
    case "currency":
      return "rent";
    case "percent":
      return "pct";
    case "count":
      return "count";
    default:
      return "index"; // "number" / unset / unknown → unitless
  }
}

/** A zhvi-area (or any options.data) spec → trend points (first numeric series). */
function specToTrendPoints(spec: ChartSpec): TrendPoint[] | null {
  const data = (spec.options?.data as Record<string, unknown>[] | undefined) ?? undefined;
  if (!Array.isArray(data) || data.length < 2) return null;
  const sample = data[0];
  const labelKey = "month" in sample ? "month" : Object.keys(sample)[0];
  const valKey = Object.keys(sample).find((k) => k !== labelKey && typeof sample[k] === "number");
  if (!valKey) return null;
  const points = data
    .map((r) => ({ label: String(r[labelKey]), value: Number(r[valKey]) }))
    .filter((p) => Number.isFinite(p.value));
  return points.length >= 2 ? points : null;
}

/** A bar-table ChartBlock (columns + rows) → {label, value} bars. */
function specToBars(spec: ChartSpec): { label: string; value: number }[] | null {
  const rows = spec.rows as (string | number | null)[][] | undefined;
  if (!Array.isArray(rows) || !rows.length) return null;
  const valIdx = Array.isArray(spec.columns) && spec.columns.length > 1 ? 1 : rows[0].length - 1;
  const bars = rows
    .map((r) => ({ label: String(r[0] ?? ""), value: Number(r[valIdx]) }))
    .filter((b) => Number.isFinite(b.value));
  return bars.length ? bars : null;
}

export interface EmailChartImage {
  url: string;
  alt: string;
  caption: string;
}

/** ChartSpec → hosted PNG image spec for an EmailDoc image block. Returns null for
 *  unsupported frames or on any error — never throws (the build is never blocked). */
export async function chartSpecToEmailImage(
  spec: ChartSpec,
  accent: string,
  key: string,
): Promise<EmailChartImage | null> {
  try {
    const title = spec.title || "Market data";
    const vf = mapValueFormat(spec.value_format);
    let svg: string | null = null;

    const timeSeries = spec.frameId === "zhvi-area" || spec.chart_type === "area";
    if (timeSeries) {
      const pts = specToTrendPoints(spec);
      if (pts)
        svg = trendChartSvg(pts.slice(-18), {
          title,
          accent,
          valueFormat: vf,
          source: spec.source?.citation ?? undefined,
          asOf: spec.asOf ?? undefined,
        });
    }
    if (!svg) {
      const bars = specToBars(spec);
      if (bars)
        svg = barChartSvg(bars, {
          title,
          accent,
          valueFormat: vf,
          source: spec.source?.citation ?? undefined,
          asOf: spec.asOf ?? undefined,
        });
    }
    if (!svg) return null;

    const png = svgToPng(svg);
    const url = await hostEmailPng(key, png);
    const asOfPart = spec.asOf ? ` · as of ${spec.asOf}` : "";
    const srcName = spec.source?.citation ?? "";
    const srcPart = srcName ? ` — ${srcName}` : "";
    return { url, alt: title, caption: `${title}${srcPart}${asOfPart}` };
  } catch {
    return null;
  }
}
