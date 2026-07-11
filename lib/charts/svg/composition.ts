// lib/charts/svg/composition.ts
//
// PURE SVG BUILDER — no React, no DOM, no I/O. Returns a self-contained,
// email-safe <svg> STRING (system fonts only, no <script>/<style>/<canvas>,
// ≤600px). CompositionFrame.tsx wraps this string for the web frame; the
// email PNG path (lib/email/spec-to-png.ts) rasterizes the SAME string. One
// builder, two surfaces — never fork the renderer.
//
// SHAPE: parts-of-a-whole — a segmented horizontal bar (each segment's width
// is its valuePct) plus a legend and an optional big magnitude callout
// (e.g. "357× AAL multiplier"). chartTypeFits gates this to additive (count)
// data only — the same test donut-share uses (lib/email/reshape-chart-type.ts).
//
// Style copied from dot-plot.ts: GRID/AXIS_TEXT palette, esc(), formatDisplayDate.

import { formatDisplayDate } from "@/lib/format-date";
import { extendPalette } from "@/lib/charts/palette";
import type { ChartTheme } from "@/components/charts/registry/chart-spec";

const AXIS_TEXT = "#9CA3AF";
const CALLOUT_BG = "#262626"; // neutral-800
const CANVAS_BG = "#171717"; // neutral-900 — matches CompositionFrame's dark canvas

export interface CompositionSegment {
  label: string;
  valuePct: number;
  color?: string;
}

export interface CompositionData {
  segments: CompositionSegment[];
  callout: string | undefined;
}

export interface CompositionOpts {
  title: string;
  callout?: string;
  source?: string;
  asOf?: string;
  width?: number;
}

/** Pure data-adapter — exported so tests can import it without a DOM. */
export function extractCompositionData(options: Record<string, unknown>): CompositionData {
  const rawSegments = options.segments;
  const callout = typeof options.callout === "string" ? options.callout : undefined;
  if (!Array.isArray(rawSegments)) return { segments: [], callout };

  const segments: CompositionSegment[] = rawSegments
    .filter(
      (s): s is Record<string, unknown> => s !== null && typeof s === "object" && !Array.isArray(s),
    )
    .map((s) => ({
      label: typeof s.label === "string" ? s.label : "",
      valuePct: typeof s.valuePct === "number" ? s.valuePct : 0,
      color: typeof s.color === "string" ? s.color : undefined,
    }));

  return { segments, callout };
}

/** Resolved fill per segment: explicit `color` wins, else on-brand distinct
 *  extras from `extendPalette` (grayscale-distinct, visible on the dark
 *  canvas). Pure + DOM-free so it's unit-testable without jsdom. */
export function resolveCompositionColors(
  segments: { color?: string }[],
  theme?: ChartTheme,
): string[] {
  const anchor = theme?.accent ?? theme?.primary ?? "#3dc9c0";
  const gen = extendPalette([anchor], segments.length, { background: CANVAS_BG });
  return segments.map((s, i) => s.color ?? gen[i] ?? anchor);
}

/**
 * Email-safe composition (segmented bar + legend) chart as a self-contained
 * SVG string. `colors[i]` must already be resolved (call
 * `resolveCompositionColors` first) — this function only draws.
 */
export function compositionSvg(
  segments: CompositionSegment[],
  colors: string[],
  opts: CompositionOpts,
): string {
  const W = opts.width ?? 600;
  const padX = 24;
  const titleY = 32;
  const calloutH = opts.callout ? 56 : 0;
  const calloutGap = opts.callout ? 16 : 0;
  const barY = titleY + 24 + calloutH + calloutGap;
  const barH = 32;
  const legendTop = barY + barH + 20;
  const legendRowH = 22;
  const legendH = segments.length * legendRowH;
  const padB = 34;
  const H = legendTop + legendH + padB;
  const barW = W - 2 * padX;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${CANVAS_BG}"/>`,
    `<text x="${padX}" y="${titleY}" font-family="Arial" font-size="16" font-weight="600" fill="#ffffff">${esc(opts.title)}</text>`,
  ];

  if (opts.callout) {
    const calloutY = titleY + 24;
    parts.push(
      `<rect x="${padX}" y="${calloutY}" width="${barW}" height="${calloutH}" rx="8" fill="${CALLOUT_BG}"/>`,
      `<text x="${W / 2}" y="${calloutY + calloutH / 2 + 8}" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold" fill="#fbbf24">${esc(opts.callout)}</text>`,
    );
  }

  // Segmented horizontal bar — each segment's width is its share of barW.
  let x = padX;
  segments.forEach((seg, i) => {
    const w = Math.max(0, (Math.max(seg.valuePct, 0) / 100) * barW);
    parts.push(
      `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${esc(colors[i] ?? "#3dc9c0")}"/>`,
    );
    x += w;
  });

  // Legend — swatch + label + pct, one row per segment.
  segments.forEach((seg, i) => {
    const ly = legendTop + i * legendRowH + 14;
    const label = seg.label.length > 40 ? `${seg.label.slice(0, 39)}…` : seg.label;
    parts.push(
      `<rect x="${padX}" y="${(ly - 10).toFixed(1)}" width="12" height="12" rx="2" fill="${esc(colors[i] ?? "#3dc9c0")}"/>`,
      `<text x="${padX + 20}" y="${ly.toFixed(1)}" font-family="Arial" font-size="13" fill="#e5e5e5">${esc(label)}</text>`,
      `<text x="${(W - padX).toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="end" font-family="Arial" font-size="13" font-weight="bold" fill="#ffffff">${seg.valuePct.toFixed(1)}%</text>`,
    );
  });

  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  if (captionParts.length)
    parts.push(
      `<text x="${padX}" y="${H - 12}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`,
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
