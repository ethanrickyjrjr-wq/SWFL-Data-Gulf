// lib/charts/svg/ranked-delta.ts
//
// RANKED-WITH-DELTA — the scorecard workhorse, as a PURE email-safe SVG string.
// Horizontal ranked bars; each row carries a period-over-period delta chip
// (▲ up / ▼ down / → flat). ONE builder powers both surfaces: the React
// RankedDeltaFrame wraps this string, and the email PNG path rasterizes the
// SAME string through resvg — no fork.
//
// Pure: no React, no DOM, no I/O. System fonts only (Arial), no <script>/<style>/
// <canvas>, ≤600px wide. Numbers go through the one value root (formatAxisTick),
// dates through formatDisplayDate, every data label through esc() — matching the
// chart-image.ts idiom exactly.

import { formatAxisTick, type ValueFormat, TABULAR } from "@/lib/charts/format";
import { formatDisplayDate } from "@/lib/format-date";
import { fitText, labelGutterFor } from "@/lib/brand/text-metrics";
import type { FontFamily } from "@/lib/email/doc/types";

const GRID = "#EAECEF";
const AXIS_TEXT = "#6B7280";
const LABEL_TEXT = "#374151";
const VALUE_TEXT = "#1F2937";

// Delta chip palette — green up / red down / grey flat (token colors from spec).
const UP_TEXT = "#15803D";
const UP_BG = "#DCFCE7";
const DOWN_TEXT = "#DC2626";
const DOWN_BG = "#FEE2E2";
const FLAT_TEXT = "#6B7280";
const FLAT_BG = "#F3F4F6";

export interface RankedDeltaItem {
  label: string;
  value: number;
  /** Period-over-period change in the same unit as `value`. Omitted ⇒ no chip. */
  delta?: number;
}

export interface RankedDeltaOpts {
  title: string;
  accent: string; // brand accent hex — the ranked bar fill
  valueFormat?: ValueFormat;
  /** Format for the delta chip — defaults to `valueFormat`. A YoY % change on a USD
   *  bar passes "pct" so the SOURCE's published rate renders verbatim ("▼ 9.6%"),
   *  never a back-solved dollar amount that exists in no source. */
  deltaFormat?: ValueFormat;
  source?: string;
  asOf?: string;
  width?: number;
  /** The brand face this chart will RASTERIZE in. Labels are fitted against THIS face's
   *  real advance widths, and the label gutter sizes itself to them. Omitted → the
   *  product default, which is what resvg falls back to for a brand-less build. */
  fontFamily?: FontFamily;
}

/** Label type size — one place, so the measurement and the rendered `font-size` can
 *  never drift apart (measuring 12 and painting 13 silently overflows again). */
const LABEL_SIZE = 12;
/** Gap between the right edge of the label and the start of the track. */
const LABEL_PAD = 8;
/** Gutter floor/ceiling. The floor keeps the title's left edge from crowding the canvas
 *  when every label is a bare ZIP; the ceiling stops one pathological label from eating
 *  the plot area (fitText trims it to the ceiling instead). */
const GUTTER_MIN = 84;
const GUTTER_MAX = 210;

/**
 * Email-safe RANKED-WITH-DELTA chart as a self-contained SVG string (system
 * fonts, explicit size) ready for resvg or direct inline render. Each row:
 * right-aligned (clipped) label, a track + accent bar (width ∝ value/max), the
 * formatted value, and a signed delta chip (▲/▼/→). Capped to 8 rows.
 */
export function rankedDeltaSvg(items: RankedDeltaItem[], opts: RankedDeltaOpts): string {
  const W = opts.width ?? 600;
  const rows = items.slice(0, 8);
  const n = rows.length;
  // THE GUTTER IS MEASURED, NOT PINNED (operator 08/06/2026: "why the fuck isn't
  // everything centered into grid and auto adjusts"). It was a hardcoded 150px with a
  // 22-CHARACTER truncation. A character budget is blind on two axes at once: the same
  // 22 chars span 1.14x ACROSS our six faces, and 3.08x WITHIN Montserrat alone (87.4px
  // of "1" vs 268.9px of "W" at 11px, measured off the bundled TTFs 08/06/2026). So the
  // budget was never right for any face, and could not be. Measured: the gutter fits
  // these labels in this face, and short labels hand their unused width back to the bars.
  const labelMetrics = { family: opts.fontFamily, size: LABEL_SIZE } as const;
  const padL = labelGutterFor(
    rows.map((r) => r.label),
    { ...labelMetrics, padding: LABEL_PAD, min: GUTTER_MIN, max: GUTTER_MAX },
  );
  const padR = 132,
    padT = 46,
    padB = 44;
  const rowH = 30;
  const H = padT + n * rowH + padB;
  const fmt: ValueFormat = opts.valueFormat ?? "usd";
  const trackW = W - padL - padR;
  const maxV = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  // Right-side columns: value sits just past the track; the delta chip is
  // pinned to the right edge so chips align in a column.
  const valueX = padL + trackW + 8;
  const chipW = 60;
  const chipX = W - chipW - 8;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${padL}" y="28" font-family="Arial" font-size="15" font-weight="bold" fill="${VALUE_TEXT}">${esc(opts.title)}</text>`,
  ];

  rows.forEach((r, i) => {
    const cy = padT + i * rowH;
    const w = Math.max(2, Math.round((Math.abs(r.value) / maxV) * trackW));
    // Fitted to the pixels actually available, in the face this will rasterize in —
    // never to a character count. `padL - LABEL_PAD` is the label's own right edge.
    const label = fitText(r.label, padL - LABEL_PAD, labelMetrics);

    parts.push(
      // right-aligned label (clipped)
      `<text x="${padL - 8}" y="${cy + 16}" text-anchor="end" font-family="Arial" font-size="12" fill="${LABEL_TEXT}">${esc(label)}</text>`,
      // track + accent ranked bar
      `<rect x="${padL}" y="${cy + 5}" width="${trackW}" height="16" rx="3" fill="${GRID}"/>`,
      `<rect x="${padL}" y="${cy + 5}" width="${w}" height="16" rx="3" fill="${esc(opts.accent)}"/>`,
      // formatted value
      `<text x="${valueX}" y="${cy + 17}" font-family="Arial" ${TABULAR} font-size="12" font-weight="bold" fill="${VALUE_TEXT}">${esc(formatAxisTick(fmt, r.value))}</text>`,
    );

    // signed delta chip — ▲ green / ▼ red / → grey
    if (typeof r.delta === "number") {
      const d = r.delta;
      const arrow = d > 0 ? "▲" : d < 0 ? "▼" : "→";
      const txt = d > 0 ? UP_TEXT : d < 0 ? DOWN_TEXT : FLAT_TEXT;
      const bg = d > 0 ? UP_BG : d < 0 ? DOWN_BG : FLAT_BG;
      // The arrow carries the sign, so strip the formatter's leading "+" (pct).
      const dfmt = opts.deltaFormat ?? fmt;
      const chipLabel = `${arrow} ${formatAxisTick(dfmt, Math.abs(d)).replace(/^\+/, "")}`;
      parts.push(
        `<rect x="${chipX}" y="${cy + 4}" width="${chipW}" height="18" rx="9" fill="${bg}"/>`,
        `<text x="${chipX + chipW / 2}" y="${cy + 17}" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="${txt}">${esc(chipLabel)}</text>`,
      );
    }
  });

  // source / as-of caption (one date root, one citation root)
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
