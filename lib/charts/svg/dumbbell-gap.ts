// lib/charts/svg/dumbbell-gap.ts
//
// PURE SVG BUILDER — no React, no DOM, no I/O. Returns a self-contained,
// email-safe <svg> STRING (system fonts only, no <script>/<style>/<canvas>,
// ≤600px), same contract as dot-plot.ts. SKELETON: not yet registered in the
// spec-to-image frameId dispatch — wire a "dumbbell-gap" case there when a
// surface adopts it.
//
// SHAPE: dumbbell / range row. Each row holds TWO values of the same unit —
// an open "low" dot and a filled accent "high" dot joined by a track — with
// the multiple (high ÷ low) badged at the row end. Built for the pair-per-city
// read ("entry community vs top community, same yardstick") where the story IS
// the distance between the two dots.
//
// SCALE: linear by default; "log" positions dots on log10 so a 240x row and a
// 5x row stay readable on one shared axis. The ratio badge is computed here,
// in code — the narrator may only restate it (same rule as settledCount).

import { formatAxisTick, type ValueFormat } from "@/lib/charts/format";
import { formatDisplayDate } from "@/lib/format-date";

const GRID = "#EAECEF";
const AXIS_TEXT = "#6B7280";
const LOW_DOT = "#B6BDC6"; // open dot outline, matches dot-plot's reference grey

export interface DumbbellGapItem {
  label: string;
  /** The smaller value (entry tier). Must be > 0 when scale is "log". */
  low: number;
  /** The larger value (top tier). */
  high: number;
}

export interface DumbbellGapOpts {
  title: string;
  accent: string; // brand accent hex — the high dot + ratio badge
  /** How dot values format. Default "usd". */
  valueFormat?: ValueFormat;
  /** Legend name for the open low dot. Default "entry". */
  lowLabel?: string;
  /** Legend name for the accent high dot. Default "top". */
  highLabel?: string;
  /** "linear" (default) or "log" — log keeps a 240x row and a 5x row on one axis. */
  scale?: "linear" | "log";
  /** Caption under the chart: "{source} · as of MM/DD/YYYY". */
  source?: string;
  asOf?: string;
  width?: number;
}

/**
 * Email-safe DUMBBELL range chart as a self-contained SVG string ready for
 * resvg. One row per pair: open low dot ↔ filled high dot on a shared scale,
 * connected by an accent track, with the high÷low multiple badged at the row
 * end ("36.4x"). Capped to 8 rows to keep the email height sane.
 */
export function dumbbellGapSvg(items: DumbbellGapItem[], opts: DumbbellGapOpts): string {
  const W = opts.width ?? 600;
  const rows = items.slice(0, 8).filter((r) => Number.isFinite(r.low) && Number.isFinite(r.high));
  const n = rows.length;
  const fmt: ValueFormat = opts.valueFormat ?? "usd";
  const useLog = opts.scale === "log";

  const padL = 128,
    padR = 64,
    padT = 64,
    padB = 44;
  const rowH = 34;
  const H = padT + n * rowH + padB;
  const trackW = W - padL - padR;

  // Shared horizontal scale across every low + high. Log scale demands > 0.
  const pos = (v: number) => (useLog ? Math.log10(Math.max(v, 1)) : v);
  const allVals = rows.flatMap((r) => [pos(r.low), pos(r.high)]);
  const minV = allVals.length ? Math.min(...allVals) : 0;
  const maxV = allVals.length ? Math.max(...allVals) : 1;
  const span = maxV - minV || 1;
  const xPos = (v: number) => padL + ((pos(v) - minV) / span) * trackW;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${padL}" y="28" font-family="Arial" font-size="15" font-weight="bold" fill="#1F2937">${esc(opts.title)}</text>`,
  ];

  // Tiny top legend: ○ {lowLabel}  ● {highLabel} (offset scales with label length
  // so a long low label never collides with the high legend — dot-plot's fix).
  const legY = 46;
  const lowLabel = opts.lowLabel ?? "entry";
  const highLabel = opts.highLabel ?? "top";
  const highDotX = padL + 15 + Math.round(lowLabel.length * 6.2) + 16;
  parts.push(
    `<circle cx="${padL + 5}" cy="${legY - 4}" r="5" fill="#ffffff" stroke="${LOW_DOT}" stroke-width="2"/>`,
    `<text x="${padL + 15}" y="${legY}" font-family="Arial" font-size="11" fill="${AXIS_TEXT}">${esc(lowLabel)}</text>`,
    `<circle cx="${highDotX}" cy="${legY - 4}" r="5" fill="${esc(opts.accent)}"/>`,
    `<text x="${highDotX + 10}" y="${legY}" font-family="Arial" font-size="11" fill="${AXIS_TEXT}">${esc(highLabel)}</text>`,
  );

  rows.forEach((r, i) => {
    const cy = padT + i * rowH + rowH / 2;
    const label = r.label.length > 20 ? `${r.label.slice(0, 19)}…` : r.label;
    const xLow = xPos(r.low);
    const xHigh = xPos(r.high);
    // The multiple is computed HERE, in code; guard the degenerate low.
    const ratio = r.low > 0 ? r.high / r.low : null;
    const badge = ratio === null ? "—" : `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)}x`;
    parts.push(
      `<text x="${padL - 8}" y="${(cy + 4).toFixed(1)}" text-anchor="end" font-family="Arial" font-size="12" fill="#374151">${esc(label)}</text>`,
      `<line x1="${padL}" y1="${cy.toFixed(1)}" x2="${(padL + trackW).toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>`,
      // connecting track between the pair, then the two dots
      `<line x1="${xLow.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${xHigh.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${esc(opts.accent)}" stroke-width="3" stroke-linecap="round" opacity="0.35"/>`,
      `<circle cx="${xLow.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="#ffffff" stroke="${LOW_DOT}" stroke-width="2"/>`,
      `<circle cx="${xHigh.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="${esc(opts.accent)}"/>`,
      `<text x="${(padL + trackW + 10).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-family="Arial" font-size="12" font-weight="bold" fill="${esc(opts.accent)}">${esc(badge)}</text>`,
    );
  });

  // Dot value labels are intentionally omitted from rows (the ratio is the story);
  // the axis extremes still format through the one currency root for orientation.
  if (n > 0) {
    const lo = Math.min(...rows.map((r) => r.low));
    const hi = Math.max(...rows.map((r) => r.high));
    const axisY = padT + n * rowH + 14;
    parts.push(
      `<text x="${padL}" y="${axisY}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(formatAxisTick(fmt, lo))}</text>`,
      `<text x="${padL + trackW}" y="${axisY}" text-anchor="end" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(formatAxisTick(fmt, hi))}</text>`,
    );
  }

  // source · as-of caption
  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  if (captionParts.length)
    parts.push(
      `<text x="${padL}" y="${H - 12}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`,
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
