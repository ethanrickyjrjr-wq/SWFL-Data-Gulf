// lib/charts/svg/slope-pair.ts
//
// PURE SVG BUILDER — no React, no DOM, no I/O. Returns a self-contained,
// email-safe <svg> STRING (system fonts only, no <script>/<style>/<canvas>,
// ≤600px), same contract as dot-plot.ts. SKELETON: not yet registered in the
// spec-to-image frameId dispatch — wire a "slope-pair" case there when a
// surface adopts it.
//
// SHAPE: slopegraph. Two vertical columns — "then" on the left, "now" on the
// right — with one straight line per series connecting its two values. The
// slope IS the read: which lines fall, which hold, and whether the falling
// ones fall together. Rising lines take the accent; falling lines take the
// muted ink, so a bifurcating set reads at a glance without a legend table.

import { formatAxisTick, type ValueFormat, TABULAR } from "@/lib/charts/format";
import { formatDisplayDate } from "@/lib/format-date";

const AXIS_TEXT = "#6B7280";
const FALL_INK = "#94A3B8"; // muted slate for falling/flat lines
const LABEL_INK = "#374151";

export interface SlopePairItem {
  label: string;
  then: number;
  now: number;
}

export interface SlopePairOpts {
  title: string;
  accent: string; // brand accent hex — rising lines
  /** Column headers. Defaults: "then" / "now". */
  thenLabel?: string;
  nowLabel?: string;
  /** How endpoint values format. Default "usd". */
  valueFormat?: ValueFormat;
  /** Caption under the chart: "{source} · as of MM/DD/YYYY". */
  source?: string;
  asOf?: string;
  width?: number;
}

/**
 * Email-safe SLOPEGRAPH as a self-contained SVG string ready for resvg. One
 * line per series between a "then" column and a "now" column; rising series
 * take the accent, falling series the muted ink; each endpoint carries its
 * formatted value and the right side carries the series label. Capped to 8
 * series to keep label space honest.
 */
export function slopePairSvg(items: SlopePairItem[], opts: SlopePairOpts): string {
  const W = opts.width ?? 600;
  const rows = items.slice(0, 8).filter((r) => Number.isFinite(r.then) && Number.isFinite(r.now));
  const n = rows.length;
  const fmt: ValueFormat = opts.valueFormat ?? "usd";

  const padL = 96,
    padR = 168,
    padT = 76,
    padB = 44;
  const plotH = Math.max(150, n * 34);
  const H = padT + plotH + padB;
  const xThen = padL;
  const xNow = W - padR;

  // Shared vertical scale across both columns.
  const allVals = rows.flatMap((r) => [r.then, r.now]);
  const minV = allVals.length ? Math.min(...allVals) : 0;
  const maxV = allVals.length ? Math.max(...allVals) : 1;
  const span = maxV - minV || 1;
  const yPos = (v: number) => padT + (1 - (v - minV) / span) * plotH;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${padL}" y="28" font-family="Arial" font-size="15" font-weight="bold" fill="#1F2937">${esc(opts.title)}</text>`,
    // column headers + faint column rules
    `<text x="${xThen}" y="${padT - 14}" text-anchor="middle" font-family="Arial" font-size="11" fill="${AXIS_TEXT}">${esc(opts.thenLabel ?? "then")}</text>`,
    `<text x="${xNow}" y="${padT - 14}" text-anchor="middle" font-family="Arial" font-size="11" fill="${AXIS_TEXT}">${esc(opts.nowLabel ?? "now")}</text>`,
    `<line x1="${xThen}" y1="${padT - 6}" x2="${xThen}" y2="${padT + plotH + 6}" stroke="#EAECEF" stroke-width="1"/>`,
    `<line x1="${xNow}" y1="${padT - 6}" x2="${xNow}" y2="${padT + plotH + 6}" stroke="#EAECEF" stroke-width="1"/>`,
  ];

  rows.forEach((r) => {
    const y1 = yPos(r.then);
    const y2 = yPos(r.now);
    const rising = r.now > r.then;
    const ink = rising ? opts.accent : FALL_INK;
    const label = r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label;
    parts.push(
      `<line x1="${xThen}" y1="${y1.toFixed(1)}" x2="${xNow}" y2="${y2.toFixed(1)}" stroke="${esc(ink)}" stroke-width="2.5" stroke-linecap="round"/>`,
      `<circle cx="${xThen}" cy="${y1.toFixed(1)}" r="4.5" fill="${esc(ink)}"/>`,
      `<circle cx="${xNow}" cy="${y2.toFixed(1)}" r="4.5" fill="${esc(ink)}"/>`,
      `<text x="${xThen - 10}" y="${(y1 + 4).toFixed(1)}" text-anchor="end" font-family="Arial" ${TABULAR} font-size="11" fill="${LABEL_INK}">${esc(formatAxisTick(fmt, r.then))}</text>`,
      `<text x="${xNow + 10}" y="${(y2 + 4).toFixed(1)}" font-family="Arial" ${TABULAR} font-size="11" font-weight="bold" fill="${esc(ink)}">${esc(formatAxisTick(fmt, r.now))} ${esc(label)}</text>`,
    );
  });

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
