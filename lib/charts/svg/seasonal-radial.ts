// lib/charts/svg/seasonal-radial.ts
//
// PURE SVG BUILDER — no React, no DOM, no I/O. Returns a self-contained,
// email-safe <svg> STRING (system fonts only, no <script>/<style>/<canvas>,
// ≤600px). The email PNG path (lib/email/spec-to-png.ts) rasterizes this string.
//
// SHAPE: a CONCENTRIC-RING radial bar chart — the email-safe twin of the live
// web frame's recharts RadialBarChart (components/charts/SeasonalRadialChart.tsx).
// The live frame stays on real recharts (unchanged); this replicates its LOOK for
// email, because recharts can't render in single-pass SSR and email has no hover.
//
// FIDELITY (matched to recharts v3.9.0 RadialBarChart render):
//   • dark theme: slate-900 (#0f172a) canvas, amber (#d4b370) tracked title
//   • rings are a radius-axis BAND scale over [innerRadius 10%, outerRadius 92%]
//     of maxRadius = min(plotW, plotH)/2; each ring's drawn thickness = barSize 11,
//     centered in its band
//   • data sorted ASC by seasonal_index → highest = OUTERMOST ring (matches the
//     live component's own sort comment)
//   • full-sweep track behind each ring in #1e293b (RadialBar `background`)
//   • value → arc angle on a [0, dataMax] domain, swept CLOCKWISE from startAngle
//     180° to endAngle -180° (so the max-value ring closes the full circle)
//   • teal (#14b8a6) / sky (#38bdf8) / amber (#d4b370) fill by index band
//
// EMAIL ADAPTATION (honest, does NOT change the live chart): the live web chart
// shows corridor NAMES only on hover (tooltip). Email has no hover, so unlabeled
// rings would be useless — a compact right-side legend (swatch + corridor + value)
// is added for the static medium. Every plotted number is REAL (RULE 1); the
// legend only re-states values already on the rings.
//
// Style copied from lib/charts/svg/dot-plot.ts: esc(), formatDisplayDate() caption.

import { formatDisplayDate } from "@/lib/format-date";

const CANVAS = "#0f172a"; // slate-900 — matches SeasonalRadialChart's card
const TRACK = "#1e293b"; // RadialBar background track
const AMBER = "#d4b370";
const LEGEND_TEXT = "#cbd5e1";
const AXIS_TEXT = "#64748b";
const RADIAN = Math.PI / 180;

export interface SeasonalRadialDatum {
  corridor: string;
  seasonal_index: number;
}

export interface SeasonalRadialOpts {
  title?: string;
  source?: string;
  asOf?: string;
  width?: number;
}

/** Teal → sky → amber by seasonal index (0→1) — verbatim from SeasonalRadialChart. */
function fillFor(idx: number): string {
  if (idx < 0.35) return "#14b8a6";
  if (idx < 0.65) return "#38bdf8";
  return "#d4b370";
}

/** Trim a corridor name to ≤ 24 chars, dropping a leading "US 41 - " style prefix —
 *  verbatim from SeasonalRadialChart.shortName. */
function shortName(name: string): string {
  const trimmed = name.replace(/^[^-]+-\s*/, "");
  return trimmed.length > 24 ? trimmed.slice(0, 22) + "…" : trimmed;
}

/** recharts polarToCartesian: x = cx + r·cos(-angle), y = cy + r·sin(-angle). */
function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(-angle * RADIAN), cy + r * Math.sin(-angle * RADIAN)];
}

/**
 * SVG path for an annular sector (ring segment) from `startAngle` to `endAngle`
 * (degrees, swept clockwise since start > end), between radii rInner..rOuter.
 * A full-circle sweep is drawn as two arcs so it never degenerates to a point.
 */
function annularSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = startAngle - endAngle; // degrees, positive (clockwise on screen)
  if (sweep <= 0) return "";
  if (sweep >= 359.999) {
    // Full ring — split into two halves to avoid a degenerate single 360° arc.
    const mid = startAngle - sweep / 2;
    return (
      annularSector(cx, cy, rInner, rOuter, startAngle, mid) +
      annularSector(cx, cy, rInner, rOuter, mid, endAngle)
    );
  }
  const large = sweep > 180 ? 1 : 0;
  const [ox1, oy1] = polar(cx, cy, rOuter, startAngle);
  const [ox2, oy2] = polar(cx, cy, rOuter, endAngle);
  const [ix2, iy2] = polar(cx, cy, rInner, endAngle);
  const [ix1, iy1] = polar(cx, cy, rInner, startAngle);
  return (
    `M ${ox1.toFixed(2)} ${oy1.toFixed(2)} ` +
    `A ${rOuter.toFixed(2)} ${rOuter.toFixed(2)} 0 ${large} 1 ${ox2.toFixed(2)} ${oy2.toFixed(2)} ` +
    `L ${ix2.toFixed(2)} ${iy2.toFixed(2)} ` +
    `A ${rInner.toFixed(2)} ${rInner.toFixed(2)} 0 ${large} 0 ${ix1.toFixed(2)} ${iy1.toFixed(2)} Z`
  );
}

/**
 * Email-safe concentric-ring seasonality chart as a self-contained SVG string,
 * visually matching the live recharts RadialBarChart. Capped to 10 corridors so
 * the rings stay legible.
 */
export function seasonalRadialSvg(data: SeasonalRadialDatum[], opts: SeasonalRadialOpts): string {
  const W = opts.width ?? 600;
  const title = opts.title ?? "Corridor Seasonality Index";

  // Sort ASC so the highest-seasonality corridor is the OUTERMOST ring.
  const rows = data
    .slice()
    .sort((a, b) => a.seasonal_index - b.seasonal_index)
    .slice(0, 10)
    .map((d) => ({
      full: d.corridor,
      name: shortName(d.corridor),
      value: Math.round(d.seasonal_index * 100),
      fill: fillFor(d.seasonal_index),
    }));
  const n = rows.length;

  const titleY = 26;
  const contentTop = 44;
  const legendRowH = 22;
  const legendH = n * legendRowH;

  // The ring square sits on the LEFT; the legend column on the RIGHT.
  const squareSize = 264;
  const H = Math.max(contentTop + squareSize, contentTop + legendH) + 30;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="${CANVAS}"/>`,
    `<text x="24" y="${titleY}" font-family="Arial" font-size="13" font-weight="bold" fill="${AMBER}" letter-spacing="1.5">${esc(title.toUpperCase())}</text>`,
  ];
  if (opts.asOf) {
    parts.push(
      `<text x="${W - 24}" y="${titleY}" text-anchor="end" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">as of ${esc(formatDisplayDate(opts.asOf))}</text>`,
    );
  }

  if (n === 0) {
    parts.push(
      `<text x="24" y="${contentTop + 40}" font-family="Arial" font-size="12" fill="${AXIS_TEXT}">No seasonality data available.</text>`,
      `</svg>`,
    );
    return parts.join("");
  }

  // Ring geometry — recharts: maxRadius = min(w,h)/2, innerRadius 10%, outerRadius 92%.
  const cx = 24 + squareSize / 2;
  const cy = contentTop + squareSize / 2;
  const maxRadius = squareSize / 2;
  const innerR = 0.1 * maxRadius;
  const outerR = 0.92 * maxRadius;
  const bandW = (outerR - innerR) / n;
  const barSize = Math.min(11, bandW * 0.85); // recharts barSize 11, clamped if crowded
  const startAngle = 180;
  const fullSweep = 360; // 180° → -180°

  // Angle-axis value domain = [0, dataMax] — VERIFIED against recharts v3.9.0 source
  // (state/selectors/axisSelectors.js: combineAxisDomainWithNiceTicks explicitly
  // SKIPS the angleAxis — its own comment: "Angle axis ... doesn't use nice ticks
  // for extending domain like all the other axes do"). So the domain is NOT
  // nice-widened: the MAX-value ring sweeps the full 360° and closes; every other
  // ring is proportional to that max (not to a fixed 100).
  const domainMax = Math.max(...rows.map((r) => r.value)) || 1;

  rows.forEach((r, i) => {
    // Band index i (0 = innermost) → ring center radius, drawn thickness barSize.
    const centerR = innerR + (i + 0.5) * bandW;
    const rIn = centerR - barSize / 2;
    const rOut = centerR + barSize / 2;
    // Background full-sweep track.
    parts.push(
      `<path d="${annularSector(cx, cy, rIn, rOut, startAngle, startAngle - fullSweep)}" fill="${TRACK}"/>`,
    );
    // Value arc — clockwise from 180° proportional to value/domainMax.
    const sweep = (r.value / domainMax) * fullSweep;
    if (sweep > 0.5) {
      parts.push(
        `<path d="${annularSector(cx, cy, rIn, rOut, startAngle, startAngle - sweep)}" fill="${r.fill}"/>`,
      );
    }
    // Value label at the ring start (left side, insideStart) — like the live chart.
    const [lx, ly] = polar(cx, cy, centerR, startAngle);
    parts.push(
      `<text x="${(lx + 6).toFixed(1)}" y="${(ly + 3).toFixed(1)}" font-family="Arial" font-size="9" fill="#94a3b8">${r.value}</text>`,
    );
  });

  // Right-side legend (email adaptation for the no-hover medium). Outermost ring
  // (highest value) listed first — reverse of the inner-to-outer draw order.
  const legX = 24 + squareSize + 20;
  const legValX = W - 24;
  [...rows].reverse().forEach((r, i) => {
    const ly = contentTop + 14 + i * legendRowH;
    const name = r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name;
    parts.push(
      `<rect x="${legX}" y="${(ly - 9).toFixed(1)}" width="11" height="11" rx="2" fill="${r.fill}"/>`,
      `<text x="${legX + 18}" y="${ly.toFixed(1)}" font-family="Arial" font-size="11" fill="${LEGEND_TEXT}">${esc(name)}</text>`,
      `<text x="${legValX}" y="${ly.toFixed(1)}" text-anchor="end" font-family="Arial" font-size="11" font-weight="bold" fill="#ffffff">${r.value}%</text>`,
    );
  });

  // Scale + source caption (mirrors the live component's footer note).
  const captionParts: string[] = ["Scale 0% (none) → 100% (extreme)"];
  if (opts.source) captionParts.push(opts.source);
  parts.push(
    `<text x="24" y="${H - 12}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`,
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
