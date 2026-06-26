// lib/charts/svg/spark-grid.ts
//
// SPARK-GRID — a row of small KPI cards, each a big formatted value + a tiny
// sparkline trend. ONE pure SVG builder, two surfaces: the React frame
// (SparkGridFrame) wraps this string, and the email PNG path
// (lib/email/spec-to-png.ts → resvg) rasterizes the SAME string. No fork.
//
// Pure: no React, no DOM, no I/O. Returns a self-contained, email-safe <svg>
// string — system fonts only (Arial), no <script>/<style>/<canvas>, sized in px
// and capped to ≤600px wide. Mirrors the chart-image.ts idiom: W/pad layout,
// GRID/AXIS_TEXT colors, the esc() helper, formatAxisTick(fmt,v) for numbers,
// formatDisplayDate(s) for the as-of caption.

import { formatAxisTick, type ValueFormat } from "@/lib/charts/format";
import { formatDisplayDate } from "@/lib/format-date";

const GRID = "#EAECEF";
const AXIS_TEXT = "#6B7280";
const CARD_BG = "#FAFBFC";
const TITLE_FILL = "#1F2937";
const VALUE_FILL = "#1F2937";

export interface SparkCard {
  /** Small grey label above the value (e.g. "Median price"). */
  label: string;
  /** The headline number, formatted via this card's valueFormat. */
  value: number;
  /** The mini trend behind the value — one point per period. */
  series: number[];
  /** How `value` formats. Default "count". */
  valueFormat?: ValueFormat;
}

export interface SparkGridOpts {
  title: string;
  /** Brand accent hex — the sparkline stroke + end dot. */
  accent: string;
  /** Caption under the grid: "{source} · as of MM/DD/YYYY". */
  source?: string;
  asOf?: string;
  width?: number;
}

/**
 * Email-safe sparkline-grid as a self-contained SVG string (resvg-rasterizable,
 * system fonts, explicit px size). Lays 2–4 KPI cards across the width (capped at
 * 4); each card draws a small grey label, a big bold formatted value (one value
 * root via formatAxisTick), and a tiny sparkline polyline of its series with an
 * accent end dot. Title on top, optional source/as-of caption at the bottom.
 */
export function sparkGridSvg(cards: SparkCard[], opts: SparkGridOpts): string {
  const W = opts.width ?? 600;
  const cardList = cards.slice(0, 4);
  const n = Math.max(1, cardList.length);

  const padX = 16; // outer left/right margin
  const titleY = 28; // baseline of the title text
  const gridTop = 48; // top of the card row
  const gutter = 12; // gap between cards
  const cardH = 104;
  const padB = 34; // room for the caption under the cards

  const H = gridTop + cardH + padB;
  const cardW = (W - 2 * padX - (n - 1) * gutter) / n;

  // Per-card geometry within its box.
  const labelDY = 22; // label baseline from card top
  const valueDY = 52; // value baseline from card top
  const sparkTop = 62; // sparkline band top from card top
  const sparkH = 30; // sparkline band height
  const sparkPadX = 12; // inset of the polyline inside the card

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${padX}" y="${titleY}" font-family="Arial" font-size="15" font-weight="bold" fill="${TITLE_FILL}">${esc(opts.title)}</text>`,
  ];

  cardList.forEach((card, i) => {
    const cx = padX + i * (cardW + gutter);
    const fmt: ValueFormat = card.valueFormat ?? "count";

    // Card background + hairline border (the KPI-card look).
    parts.push(
      `<rect x="${cx.toFixed(1)}" y="${gridTop}" width="${cardW.toFixed(1)}" height="${cardH}" rx="6" fill="${CARD_BG}" stroke="${GRID}" stroke-width="1"/>`,
    );

    // Label (grey) + big bold value (one value root).
    const label = card.label.length > 22 ? `${card.label.slice(0, 21)}…` : card.label;
    parts.push(
      `<text x="${(cx + 12).toFixed(1)}" y="${gridTop + labelDY}" font-family="Arial" font-size="11" fill="${AXIS_TEXT}">${esc(label)}</text>`,
      `<text x="${(cx + 12).toFixed(1)}" y="${gridTop + valueDY}" font-family="Arial" font-size="22" font-weight="bold" fill="${VALUE_FILL}">${esc(formatAxisTick(fmt, card.value))}</text>`,
    );

    // Sparkline — normalized polyline of the series with an accent end dot.
    const s = card.series.filter((v) => Number.isFinite(v));
    if (s.length >= 2) {
      const innerX0 = cx + sparkPadX;
      const innerX1 = cx + cardW - sparkPadX;
      const innerW = Math.max(1, innerX1 - innerX0);
      const yTop = gridTop + sparkTop;
      const yBot = yTop + sparkH;
      const minV = Math.min(...s);
      const maxV = Math.max(...s);
      const span = maxV - minV || 1;
      const px = (k: number) => innerX0 + (k / (s.length - 1)) * innerW;
      const py = (v: number) => yBot - ((v - minV) / span) * sparkH;
      const pts = s.map((v, k) => `${px(k).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
      const lastX = px(s.length - 1);
      const lastY = py(s[s.length - 1]);
      parts.push(
        `<polyline points="${pts}" fill="none" stroke="${esc(opts.accent)}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
        `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.8" fill="${esc(opts.accent)}"/>`,
      );
    }
  });

  // Source / as-of caption (one date root via formatDisplayDate).
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
