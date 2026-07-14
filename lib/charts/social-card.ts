// lib/charts/social-card.ts
//
// The saved-chart SOCIAL CARD: a persisted ChartBlock → a branded 1200×630
// SVG/PNG for og:image unfurls, downloads, and native social posts. Reuses the
// email chart builders (barChartSvg / trendChartSvg — read-only imports; that
// area is claimed by another session today) inside a card frame: teal top bar,
// text wordmark, title, chart body, provenance footer. blockToSpec is
// deliberately NOT used here — it throws on every frame but bar-table
// (lib/deliverable/bind-frame.ts) — rows map straight onto the builders.
//
// Numbers render VERBATIM from the block (formatAxisTick for display only);
// this module never computes a figure. Shape gaps fall back (bar → trend →
// big-stat → title-only) — a saved block always gets a card, never a refusal.

import { barChartSvg, trendChartSvg, svgToPng, type TrendPoint } from "@/lib/email/chart-image";
import { formatAxisTick, type ValueFormat } from "@/lib/charts/format";
import { formatDisplayDate } from "@/lib/format-date";
import { BRAND } from "@/lib/brand/tokens";
import type { ChartBlock } from "@/refinery/validate/chart-block-lint.mts";

const W = 1200;
const H = 630;
const M = 56; // outer margin
const TEAL = BRAND.teal;
const NAVY = BRAND.midnight;
// No brand grey ramp exists yet (check `brand_has_no_grey_scale`) — stays a private
// hex until one lands; adding one here would be a fourth invented grey, not a fix.
const GREY = "#6B7280";

// Mirror of the (unexported) ChartValueFormat→ValueFormat map in
// lib/email/spec-to-png.ts — duplicated, not imported: that file is claimed by
// a parallel session and this 8-line switch is cheaper than a cross-lane edit.
function toValueFormat(vf?: string): ValueFormat {
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
    case "number":
      return "number";
    default:
      return "index";
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** First numeric column index across rows, or null when nothing is numeric. */
function numericColumn(rows: ChartBlock["rows"]): number | null {
  for (const row of rows) {
    for (let j = 0; j < row.length; j++) {
      if (typeof row[j] === "number" && Number.isFinite(row[j])) return j;
    }
  }
  return null;
}

/** Rows → (label, value) points: label = first string cell, value = the numeric column. */
function rowPoints(rows: ChartBlock["rows"], col: number): TrendPoint[] {
  const pts: TrendPoint[] = [];
  for (const row of rows) {
    const v = row[col];
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const label = row.find((c): c is string => typeof c === "string") ?? "";
    pts.push({ label, value: v });
  }
  return pts;
}

/** Word-wrap the title to ≤2 lines of ~42 chars; ellipsize overflow. */
function wrapTitle(title: string): string[] {
  const budget = 42;
  if (title.length <= budget) return [title];
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > budget) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === 2) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (lines.length < 2 && cur) lines.push(cur.trim());
  if (lines.length === 2 && cur && lines[1] !== cur) lines[1] = lines[1] + "…";
  return lines.slice(0, 2);
}

/** The card frame: teal bar, wordmark, title, footer. `body` slots between. */
function frame(title: string, footerLeft: string, body: string): string {
  const lines = wrapTitle(title);
  const titleSvg = lines
    .map(
      (ln, i) =>
        `<text x="${M}" y="${128 + i * 52}" font-family="Arial" font-size="44" font-weight="bold" fill="${NAVY}">${esc(ln)}</text>`,
    )
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="#ffffff"/>` +
    `<rect width="${W}" height="8" fill="${TEAL}"/>` +
    `<rect x="${M}" y="42" width="14" height="14" rx="3" fill="${TEAL}"/>` +
    `<text x="${M + 22}" y="55" font-family="Arial" font-size="20" font-weight="bold" fill="${NAVY}">SWFL Data Gulf</text>` +
    titleSvg +
    body +
    (footerLeft
      ? `<text x="${M}" y="${H - 30}" font-family="Arial" font-size="18" fill="${GREY}">${esc(footerLeft)}</text>`
      : "") +
    `<text x="${W - M}" y="${H - 30}" text-anchor="end" font-family="Arial" font-size="18" fill="${TEAL}">swfldatagulf.com</text>` +
    `</svg>`
  );
}

/** Scale + center an inner chart SVG (known `width="N" height="N"` root) into the body region. */
function placeInner(inner: string): string {
  const m = /width="(\d+)" height="(\d+)"/.exec(inner);
  const iw = m ? Number(m[1]) : 600;
  const ih = m ? Number(m[2]) : 300;
  const regionTop = 210;
  const regionH = 350;
  const regionW = W - 2 * M;
  const s = Math.min(regionW / iw, regionH / ih);
  const tx = (W - iw * s) / 2;
  const ty = regionTop + (regionH - ih * s) / 2;
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(4)})">${inner}</g>`;
}

/** Big-stat fallback body: up to 3 verbatim figures with their labels. */
function bigStats(points: TrendPoint[], fmt: ValueFormat): string {
  const shown = points.slice(0, 3);
  if (shown.length === 0) return "";
  const slotW = (W - 2 * M) / shown.length;
  return shown
    .map((p, i) => {
      const cx = M + i * slotW + slotW / 2;
      const label = p.label.length > 22 ? `${p.label.slice(0, 21)}…` : p.label;
      return (
        `<text x="${cx.toFixed(1)}" y="390" text-anchor="middle" font-family="Arial" font-size="64" font-weight="bold" fill="${NAVY}">${esc(formatAxisTick(fmt, p.value))}</text>` +
        `<text x="${cx.toFixed(1)}" y="432" text-anchor="middle" font-family="Arial" font-size="20" fill="${GREY}">${esc(label)}</text>`
      );
    })
    .join("");
}

export function chartBlockToCardSvg(block: ChartBlock): string {
  if (
    !block ||
    typeof block !== "object" ||
    typeof block.title !== "string" ||
    !Array.isArray(block.rows)
  ) {
    throw new Error("social-card: malformed chart block");
  }

  const fmt = toValueFormat(block.value_format);
  const footerParts: string[] = [];
  if (block.source?.citation) footerParts.push(block.source.citation);
  if (block.asOf) footerParts.push(`as of ${formatDisplayDate(block.asOf)}`);
  const footer = footerParts.join(" · ");

  const col = numericColumn(block.rows);
  const points = col == null ? [] : rowPoints(block.rows, col);
  const shape = block.chart_type ?? "bar";

  let body = "";
  if (shape === "bar" && points.length >= 1) {
    body = placeInner(
      barChartSvg(points, { title: "", accent: TEAL, valueFormat: fmt, width: 600 }),
    );
  } else if (shape === "area" && points.length >= 2) {
    body = placeInner(trendChartSvg(points, { title: "", accent: TEAL, valueFormat: fmt }));
  } else {
    body = bigStats(points, fmt); // table / scatter / thin data → verbatim figures
  }

  return frame(block.title, footer, body);
}

/** 1200×630 PNG at intrinsic size (scale 1 — the og:image meta declares these
 *  exact dimensions, so the file must match them). */
export function chartBlockToCardPng(block: ChartBlock): Buffer {
  return svgToPng(chartBlockToCardSvg(block), { scale: 1 });
}
