// lib/charts/svg/line-band.ts
//
// LINE WITH CONFIDENCE BAND — the ONE renderer for an [INFERENCE] projection
// shape. A pure SVG builder: no React, no DOM, no I/O. Returns a self-contained,
// email-safe <svg> STRING (system fonts only, no <script>/<style>/<canvas>,
// ≤600px). The React frame wraps this string; the email PNG path rasterizes the
// SAME string. One function, two surfaces — never fork the chart.
//
// Idiom copied verbatim from lib/email/chart-image.ts trendChartSvg (W/H/pad,
// GRID/AXIS_TEXT colors, esc(), formatAxisTick for numbers, formatAxisDateLabel
// for dates). ADDS a shaded lo/hi confidence band (accent at 0.12 opacity) under
// the hero line — the visual home for a forecast's uncertainty.

import { formatAxisTick, type ValueFormat } from "@/lib/charts/format";
import { formatAxisDateLabel, formatDisplayDate } from "@/lib/format-date";

export interface LineBandPoint {
  /** "2026-03" (month) or "2026-03-15" (day) — formatted on render. */
  label: string;
  value: number;
  /** Lower confidence bound (band floor). Omit on observed (non-projected) points. */
  lo?: number;
  /** Upper confidence bound (band ceiling). Omit on observed points. */
  hi?: number;
}

export interface LineBandOpts {
  title: string;
  /** Brand accent hex — the hero line, end dot, and band fill. */
  accent: string;
  /** How y-ticks + the end label format. Default "usd". */
  valueFormat?: ValueFormat;
  /** Caption under the chart: "{source} · as of MM/DD/YYYY". */
  source?: string;
  asOf?: string;
  width?: number;
}

const GRID = "#EAECEF";
const AXIS_TEXT = "#6B7280";

/**
 * Email-safe line-with-confidence-band chart as a self-contained SVG string
 * (system fonts, explicit size) ready for resvg AND for the React frame. Draws
 * gridlines, unit-formatted y-ticks (one value root), four formatted x-labels
 * (one date root), an area under the line, a shaded lo/hi band over the points
 * that carry bounds, the hero line on top, and a direct end-of-line value label.
 */
export function lineBandSvg(points: LineBandPoint[], opts: LineBandOpts): string {
  const W = opts.width ?? 600;
  const H = 300;
  const padL = 64,
    padR = 72,
    padT = 48,
    padB = 56;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const fmt: ValueFormat = opts.valueFormat ?? "usd";
  const n = points.length;

  // y-domain spans the line AND every present band bound, so the band never clips.
  const allVals: number[] = [];
  for (const p of points) {
    allVals.push(p.value);
    if (typeof p.lo === "number") allVals.push(p.lo);
    if (typeof p.hi === "number") allVals.push(p.hi);
  }
  const minY = Math.min(...allVals);
  const maxY = Math.max(...allVals);
  const span = maxY - minY || 1;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + (1 - (v - minY) / span) * innerH;
  const yBase = padT + innerH;

  // gridlines + unit-formatted y ticks (5 levels through the ONE value root)
  const grid: string[] = [];
  for (let k = 0; k <= 4; k++) {
    const gy = padT + (k / 4) * innerH;
    const gv = maxY - (k / 4) * span;
    grid.push(
      `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`,
    );
    grid.push(
      `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" text-anchor="end" font-family="Arial" font-size="11" fill="${AXIS_TEXT}">${esc(formatAxisTick(fmt, gv))}</text>`,
    );
  }

  // shaded confidence band over the contiguous run of points carrying lo+hi.
  // Forward along hi, back along lo, close — accent at 0.12 opacity.
  const bandIdx = points
    .map((p, i) => (typeof p.lo === "number" && typeof p.hi === "number" ? i : -1))
    .filter((i) => i >= 0);
  let band = "";
  if (bandIdx.length >= 2) {
    const topD = bandIdx
      .map(
        (i, k) =>
          `${k === 0 ? "M" : "L"} ${x(i).toFixed(1)},${y(points[i].hi as number).toFixed(1)}`,
      )
      .join(" ");
    const botD = [...bandIdx]
      .reverse()
      .map((i) => `L ${x(i).toFixed(1)},${y(points[i].lo as number).toFixed(1)}`)
      .join(" ");
    band = `<path d="${topD} ${botD} Z" fill="${esc(opts.accent)}" fill-opacity="0.12" stroke="none"/>`;
  }

  // area fill under the hero line
  const areaD =
    `M ${x(0).toFixed(1)},${y(points[0].value).toFixed(1)} ` +
    points.map((p, i) => `L ${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ") +
    ` L ${x(n - 1).toFixed(1)},${yBase.toFixed(1)} L ${x(0).toFixed(1)},${yBase.toFixed(1)} Z`;

  // hero line on top
  const lineAll = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const hero = `<polyline points="${lineAll}" fill="none" stroke="${esc(opts.accent)}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;

  // four evenly-spaced, formatted x labels (one date root)
  const idxs = Array.from(
    new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1]),
  ).filter((i) => i >= 0 && i < n);
  const xLabels = idxs
    .map((i) => {
      const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      return `<text x="${x(i).toFixed(1)}" y="${(yBase + 20).toFixed(1)}" text-anchor="${anchor}" font-family="Arial" font-size="11" fill="${AXIS_TEXT}">${esc(formatAxisDateLabel(points[i].label))}</text>`;
    })
    .join("");

  // direct end-of-line label (the last value)
  const last = points[n - 1];
  const endLabel =
    `<circle cx="${x(n - 1).toFixed(1)}" cy="${y(last.value).toFixed(1)}" r="3.5" fill="${esc(opts.accent)}"/>` +
    `<text x="${(x(n - 1) + 6).toFixed(1)}" y="${(y(last.value) + 4).toFixed(1)}" font-family="Arial" font-size="12" font-weight="bold" fill="${esc(opts.accent)}">${esc(formatAxisTick(fmt, last.value))}</text>`;

  // source/as-of caption
  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  const caption = captionParts.length
    ? `<text x="${padL}" y="${(H - 12).toFixed(1)}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${padL}" y="28" font-family="Arial" font-size="15" font-weight="bold" fill="#1F2937">${esc(opts.title)}</text>`,
    ...grid,
    band,
    `<path d="${areaD}" fill="${esc(opts.accent)}" fill-opacity="0.10" stroke="none"/>`,
    hero,
    endLabel,
    xLabels,
    caption,
    `</svg>`,
  ].join("");
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
