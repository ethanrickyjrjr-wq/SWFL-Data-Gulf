// lib/charts/svg/storm-timeline.ts
//
// PURE SVG BUILDER — no React, no DOM, no I/O. Returns a self-contained,
// email-safe <svg> STRING (system fonts only, no <script>/<style>/<canvas>,
// ≤600px). The email PNG path (lib/email/spec-to-png.ts) rasterizes this string.
//
// SHAPE: a named-event VERTICAL COLUMN chart — the email-safe twin of the live
// web frame's recharts BarChart (components/charts/registry/frames/TimelineFrame.tsx).
// The live frame stays on real recharts (unchanged); this replicates its LOOK for
// email, because recharts can't render in a single-pass SSR (its sizing needs a
// useEffect that never fires) and email clients strip JS/SVG interactivity anyway.
//
// FIDELITY (matched to recharts v3.9.0 render of TimelineChartCore):
//   • light theme: white canvas, #e5eaf0 dashed horizontal gridlines (no vertical),
//     #4a5a6a axis text, #d1d8e0 x-axis line
//   • Y domain [0, maxVal * 1.15], USD-abbreviated ticks ($K/$M/$B)
//   • X labels "{event} {year}", angled -20°, anchored at each column's center
//   • columns: rounded top (r=3), maxBarSize 56; the MAX-value column gets the full
//     accent, every other column accent at 60% (accent + "99")
//   • optional dashed-blue (#60a5fa) baseline ReferenceLine with a right-side label
//
// Style copied from lib/charts/svg/dot-plot.ts: esc(), formatDisplayDate() caption.

import { formatDisplayDate } from "@/lib/format-date";

const GRID = "#e5eaf0";
const AXIS_TEXT = "#4a5a6a";
const AXIS_LINE = "#d1d8e0";
const Y_LABEL = "#8898aa";
const BASELINE = "#60a5fa";

export interface StormTimelineEvent {
  /** Human label — storm name, event name, etc. */
  label: string;
  /** ISO date string (YYYY-MM-DD). Used for ordering + the "{label} {year}" tick. */
  date: string;
  /** Numeric magnitude (USD for NFIP claims). */
  amount_usd: number;
}

export interface StormTimelineOpts {
  title: string;
  accent: string;
  /** Optional horizontal reference line (e.g. a multi-year baseline). */
  baseline?: number | null;
  /** Y-axis label. Default "Amount (USD)". */
  yLabel?: string;
  source?: string;
  asOf?: string;
  width?: number;
}

function isoToYear(iso: string): number {
  return parseInt(iso.slice(0, 4), 10);
}

/** USD abbreviation — copied verbatim from TimelineFrame.fmtUsd so both surfaces
 *  format identically. */
function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Email-safe named-event VERTICAL COLUMN chart as a self-contained SVG string,
 * visually matching the live recharts BarChart. Capped to 12 columns to keep the
 * email width sane.
 */
export function stormTimelineSvg(events: StormTimelineEvent[], opts: StormTimelineOpts): string {
  const W = opts.width ?? 600;
  const yLabel = opts.yLabel ?? "Amount (USD)";
  const rows = events
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12)
    .map((e) => ({ name: `${e.label} ${isoToYear(e.date)}`, value: e.amount_usd }));
  const n = rows.length;

  const maxVal = n ? Math.max(...rows.map((r) => r.value)) : 1;
  const domainMax = maxVal * 1.15 || 1;

  // Geometry — a light plot area with room for a rotated Y-label + USD ticks on
  // the left and the angled x-labels below.
  const padL = 64; // y-label + tick labels
  const padR = 20;
  const padT = 46; // title + gap
  const plotH = 190;
  const padB = 84; // angled x-labels + caption
  const H = padT + plotH + padB;
  const plotW = W - padL - padR;
  const plotBottom = padT + plotH;

  const yPos = (v: number) => plotBottom - (v / domainMax) * plotH;

  const band = plotW / Math.max(1, n);
  const barW = Math.min(56, band * 0.68);

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${padL}" y="28" font-family="Arial" font-size="15" font-weight="bold" fill="#1a2636">${esc(opts.title)}</text>`,
  ];

  // Horizontal dashed gridlines + USD Y-ticks (0 → domainMax in 4 steps = 5 ticks).
  const TICKS = 4;
  for (let i = 0; i <= TICKS; i++) {
    const v = (domainMax / TICKS) * i;
    const gy = yPos(v);
    parts.push(
      `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${(padL + plotW).toFixed(1)}" y2="${gy.toFixed(1)}" stroke="${GRID}" stroke-width="1" stroke-dasharray="3 3"/>`,
      `<text x="${padL - 6}" y="${(gy + 3).toFixed(1)}" text-anchor="end" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(fmtUsd(v))}</text>`,
    );
  }

  // Rotated Y-axis label.
  const ylx = 14;
  const yly = padT + plotH / 2;
  parts.push(
    `<text x="${ylx}" y="${yly.toFixed(1)}" font-family="Arial" font-size="10" fill="${Y_LABEL}" text-anchor="middle" transform="rotate(-90 ${ylx} ${yly.toFixed(1)})">${esc(yLabel)}</text>`,
  );

  // X-axis line.
  parts.push(
    `<line x1="${padL}" y1="${plotBottom}" x2="${(padL + plotW).toFixed(1)}" y2="${plotBottom}" stroke="${AXIS_LINE}" stroke-width="1"/>`,
  );

  // Columns — max-value column full accent, others accent @ 60% (accent+"99").
  rows.forEach((r, i) => {
    const cx = padL + band * (i + 0.5);
    const x = cx - barW / 2;
    const top = yPos(r.value);
    const h = plotBottom - top;
    const fill = r.value === maxVal ? opts.accent : `${opts.accent}99`;
    parts.push(roundedTopRect(x, top, barW, h, 3, fill));

    // Angled -20° x-label anchored at the column center, just below the axis.
    const lx = cx;
    const ly = plotBottom + 14;
    const label = r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name;
    parts.push(
      `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-family="Arial" font-size="11" fill="${AXIS_TEXT}" text-anchor="end" transform="rotate(-20 ${lx.toFixed(1)} ${ly.toFixed(1)})">${esc(label)}</text>`,
    );
  });

  // Optional dashed baseline ReferenceLine + right-side label.
  if (typeof opts.baseline === "number" && opts.baseline > 0) {
    const by = yPos(opts.baseline);
    if (by >= padT && by <= plotBottom) {
      parts.push(
        `<line x1="${padL}" y1="${by.toFixed(1)}" x2="${(padL + plotW).toFixed(1)}" y2="${by.toFixed(1)}" stroke="${BASELINE}" stroke-width="1" stroke-dasharray="6 3"/>`,
        `<text x="${(padL + plotW).toFixed(1)}" y="${(by - 4).toFixed(1)}" text-anchor="end" font-family="Arial" font-size="10" fill="${BASELINE}">Baseline ${esc(fmtUsd(opts.baseline))}</text>`,
      );
    }
  }

  // source · as-of caption.
  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  if (captionParts.length)
    parts.push(
      `<text x="${padL}" y="${H - 10}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`,
    );

  parts.push(`</svg>`);
  return parts.join("");
}

/** Rectangle with only the TOP two corners rounded (radius r), matching recharts
 *  `radius={[3,3,0,0]}`. Degrades to a plain rect when the bar is shorter than r. */
function roundedTopRect(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): string {
  const rr = Math.min(r, w / 2, h);
  if (h <= rr)
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" fill="${esc(fill)}"/>`;
  const x2 = x + w;
  const y2 = y + h;
  const d = [
    `M ${x.toFixed(1)} ${y2.toFixed(1)}`,
    `L ${x.toFixed(1)} ${(y + rr).toFixed(1)}`,
    `Q ${x.toFixed(1)} ${y.toFixed(1)} ${(x + rr).toFixed(1)} ${y.toFixed(1)}`,
    `L ${(x2 - rr).toFixed(1)} ${y.toFixed(1)}`,
    `Q ${x2.toFixed(1)} ${y.toFixed(1)} ${x2.toFixed(1)} ${(y + rr).toFixed(1)}`,
    `L ${x2.toFixed(1)} ${y2.toFixed(1)}`,
    `Z`,
  ].join(" ");
  return `<path d="${d}" fill="${esc(fill)}"/>`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
