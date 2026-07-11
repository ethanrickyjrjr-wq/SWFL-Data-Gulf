// lib/charts/svg/z-gauge.ts
//
// PURE SVG BUILDER — no React, no DOM, no I/O. Mirrors dot-plot.ts /
// composition.ts: a self-contained email-safe <svg> string, wrapped by
// ZGaugeFrame.tsx for the web frame and rasterized directly by
// lib/email/spec-to-png.ts for the email PNG. One builder, two surfaces.
//
// SHAPE: a single value against a segmented min..max scale with a baseline
// marker (e.g. a market-heat index vs its historical baseline). Gate: this
// frame's picker option is PASSTHROUGH-ONLY (lib/email/reshape-chart-type.ts)
// — a single-value-vs-bound shape cannot be honestly fabricated from a flat
// multi-point bar-table; reshaping a multi-point series into a gauge would
// pick an arbitrary needle. This builder renders correctly whenever a
// producer emits genuine gauge-shaped options.

import { formatDisplayDate } from "@/lib/format-date";

const AXIS_TEXT = "#6B7280";

export interface GaugeData {
  value: number;
  baseline: number;
  min: number;
  max: number;
  unit: string;
  segments: number;
  valueSegmentIndex: number;
  baselineSegmentIndex: number;
  valueFraction: number;
}

export interface ZGaugeOpts {
  title: string;
  source?: string;
  asOf?: string;
  width?: number;
}

/** Extract + validate gauge parameters from `spec.options`. Returns `null`
 *  when `value` is absent — the caller renders a graceful fallback instead
 *  of crashing (moved verbatim from ZGaugeFrame.tsx). */
export function extractGaugeData(options: Record<string, unknown> | undefined): GaugeData | null {
  if (!options) return null;
  const value = typeof options.value === "number" ? options.value : null;
  if (value === null) return null;

  const baseline = typeof options.baseline === "number" ? options.baseline : 0;
  const min = typeof options.min === "number" ? options.min : 0;
  const max = typeof options.max === "number" ? options.max : 100;
  const unit = typeof options.unit === "string" ? options.unit : "";
  const segments =
    typeof options.segments === "number" && options.segments > 0 ? Math.round(options.segments) : 9;

  const range = max - min || 1;
  const valueFraction = Math.min(1, Math.max(0, (value - min) / range));
  const baselineFraction = Math.min(1, Math.max(0, (baseline - min) / range));
  const valueSegmentIndex = Math.min(segments - 1, Math.floor(valueFraction * segments));
  const baselineSegmentIndex = Math.min(segments - 1, Math.floor(baselineFraction * segments));

  return {
    value,
    baseline,
    min,
    max,
    unit,
    segments,
    valueSegmentIndex,
    baselineSegmentIndex,
    valueFraction,
  };
}

/** Below baseline = orange spectrum, above = emerald spectrum, at baseline =
 *  neutral slate. Moved verbatim from ZGaugeFrame.tsx. */
function segmentColor(segIndex: number, baselineSegmentIndex: number, segments: number): string {
  const distFromBaseline = segIndex - baselineSegmentIndex;
  if (distFromBaseline < 0) {
    const intensity = Math.abs(distFromBaseline) / Math.max(1, baselineSegmentIndex);
    return `rgba(234, 88, 12, ${(0.35 + intensity * 0.65).toFixed(2)})`;
  }
  if (distFromBaseline === 0) return "rgba(100, 116, 139, 0.70)";
  const maxAbove = segments - 1 - baselineSegmentIndex;
  const intensity = distFromBaseline / Math.max(1, maxAbove);
  return `rgba(5, 150, 105, ${(0.35 + intensity * 0.65).toFixed(2)})`;
}

export function zGaugeSvg(gauge: GaugeData, opts: ZGaugeOpts): string {
  const W = opts.width ?? 600;
  const { value, baseline, min, max, unit, segments, valueSegmentIndex, baselineSegmentIndex } =
    gauge;
  const padX = 24;
  const titleY = 28;
  const valueY = 72;
  const barY = 92;
  const barH = 24;
  const scaleY = barY + barH + 20;
  const deltaY = scaleY + 26;
  const padB = 34;
  const H = deltaY + padB;
  const barW = W - 2 * padX;
  const segW = barW / segments;

  const displayValue = value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  const displayBaseline = baseline % 1 === 0 ? baseline.toFixed(0) : baseline.toFixed(1);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#1e293b"/>`,
    `<text x="${padX}" y="${titleY}" font-family="Arial" font-size="15" font-weight="bold" fill="#e2e8f0">${esc(opts.title)}</text>`,
    `<text x="${padX}" y="${valueY}" font-family="Arial" font-size="32" font-weight="bold" fill="#ffffff">${displayValue}${unit ? ` <tspan font-size="12" fill="#94a3b8">${esc(unit)}</tspan>` : ""}</text>`,
  ];

  for (let i = 0; i < segments; i++) {
    const sx = padX + i * segW;
    const isActive = i === valueSegmentIndex;
    parts.push(
      `<rect x="${sx.toFixed(1)}" y="${barY}" width="${(segW - 2).toFixed(1)}" height="${barH}" fill="${segmentColor(i, baselineSegmentIndex, segments)}" ${isActive ? 'stroke="#ffffff" stroke-width="2"' : ""}/>`,
    );
  }

  const baselineX = padX + (baselineSegmentIndex + 0.5) * segW;
  parts.push(
    `<line x1="${baselineX.toFixed(1)}" y1="${barY + barH}" x2="${baselineX.toFixed(1)}" y2="${barY + barH + 8}" stroke="#94a3b8" stroke-width="1"/>`,
    `<text x="${baselineX.toFixed(1)}" y="${scaleY}" text-anchor="middle" font-family="Arial" font-size="9" fill="${AXIS_TEXT}">base ${displayBaseline}</text>`,
    `<text x="${padX}" y="${scaleY}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${min}</text>`,
    `<text x="${(W - padX).toFixed(1)}" y="${scaleY}" text-anchor="end" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${max}</text>`,
  );

  const delta = value - baseline;
  const sign = delta >= 0 ? "+" : "";
  const deltaColor = delta > 0 ? "#34d399" : delta < 0 ? "#fb923c" : "#94a3b8";
  parts.push(
    `<text x="${W / 2}" y="${deltaY}" text-anchor="middle" font-family="Arial" font-size="11" fill="${deltaColor}">${sign}${delta.toFixed(1)} vs baseline ${displayBaseline}</text>`,
  );

  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  if (captionParts.length)
    parts.push(
      `<text x="${padX}" y="${H - 10}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`,
    );

  parts.push(`</svg>`);
  return parts.join("");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
