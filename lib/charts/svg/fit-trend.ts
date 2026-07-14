// lib/charts/svg/fit-trend.ts
//
// THE BACKLIT FIT — the fitted trend, drawn as light BEHIND the data.
//
// A pure SVG builder: no React, no DOM, no I/O. Returns a self-contained, email-safe
// <svg> STRING (system fonts, no <script>/<style>/<canvas>, ≤600px). The React frame
// wraps this string; the email PNG path rasterizes the SAME string. One function, two
// surfaces — never fork the chart. Idiom (W/H/pad, GRID/AXIS_TEXT, esc, formatAxisTick,
// formatAxisDateLabel) is line-band.ts's, verbatim, so it sits in a deliverable next to
// every other chart we make without announcing itself as a different species.
//
// ── WHY "BACKLIT", AND WHY IT IS NOT A SECOND LINE ──────────────────────────
//
// The observed series is the fact. The fit is an [INFERENCE] about it. Draw the fit as
// a second crisp line and you have put a claim and a fact on the same visual footing,
// competing for the same eye — and the sharper of the two wins, which on a straight
// line is always the claim. So the fit goes UNDERNEATH, wider and softer: the data
// stays the hero and the trend reads as the light it is standing in front of.
//
// The glow is A STACK OF STROKES ON ONE PATH — the same path drawn three times, wide
// and faint, then mid, then thin and bright — NOT an SVG <filter> blur. That is a
// deliberate choice, not a fallback. A filter is one attribute away from a rasterizer
// quietly dropping it, and the failure mode is silent: the trend just stops glowing in
// email and nobody sees the bug because nobody diffs a PNG. The stroke stack is plain
// geometry. It cannot be unsupported. It renders identically in a browser, in resvg,
// and in whatever we rasterize with in two years.
//
// ── AND WHY THE FAN HAS NO LINE IN IT ───────────────────────────────────────
//
// When a window's interval straddles flat, its slope's SIGN MAY NOT BE READ — so there
// is no line to draw, and this file draws none. What it draws instead is the fan of
// paces that window still supports: light spreading both ways with nothing crisp in the
// middle. That absence is the finding. A reader looking at it can see, without being
// told, why we refuse to call a direction — and the fan's two edges are the very paces
// the falsifier names in words underneath it.
//
// This file NEVER decides which of those it is drawing. lib/charts/fit-overlay.ts does,
// once, for every surface. This file paints what it is handed.

import { formatAxisTick, type ValueFormat } from "@/lib/charts/format";
import type { FitCurve, FitLayer, FitOverlay } from "@/lib/charts/fit-overlay";
import type { FitPoint } from "@/lib/charts/fit-line";
import { formatAxisDateLabel, formatDisplayDate } from "@/lib/format-date";

export interface FitTrendOpts {
  title: string;
  /** How y-ticks and the end label format. Default "usd". */
  valueFormat?: ValueFormat;
  /** Caption under the chart: "{source} · as of MM/DD/YYYY". */
  source?: string;
  asOf?: string;
  width?: number;
}

const GRID = "#EAECEF";
const AXIS_TEXT = "#6B7280";
const INK = "#1F2937";

/**
 * The direction palette, and it is the product's, not this file's — mangrove reads as
 * a climb and sunset-coral as a slide everywhere else in the app (app/_design, DeskHero,
 * TierProjectionChart), so a chart that invented its own would be teaching a reader a
 * second colour language for the same fact.
 *
 * The unreadable case is NEUTRAL GOLD, and it is deliberately NOT GREY. Grey is what we
 * use for missing data, and "no direction established" is not missing data — it is a
 * finding, arrived at from a full series we actually fitted. Greying it out would file
 * our own answer under "we don't know" when the truth is "we looked, and it genuinely
 * does not separate from flat."
 */
const HUE = {
  up: "#5BC97A", // mangrove
  down: "#E08158", // sunset-coral
  none: "#D4B370", // neutral-gold — a finding, not an absence
} as const;

const OBSERVED = "#3DC9C0"; // gulf-teal — the data, always the hero, always the same colour

function hueFor(direction: "up" | "down" | null): string {
  return direction ? HUE[direction] : HUE.none;
}

type Px = { x: number; y: number };

/**
 * The backlit fitted trend as a self-contained SVG string, ready for resvg AND for the
 * React frame. Draws gridlines, unit-formatted y-ticks, formatted x-labels, the glow
 * stack under any established fit, the fan under any unestablished one, and the observed
 * series on top of all of it.
 *
 * `overlay` is the ONLY authority on what may be drawn — see lib/charts/fit-overlay.ts.
 * Returns "" when there is nothing honest to draw.
 */
export function fitTrendSvg(
  observed: readonly FitPoint[],
  overlay: FitOverlay,
  opts: FitTrendOpts,
): string {
  if (observed.length < 2) return "";

  const W = opts.width ?? 600;
  const H = 300;
  const padL = 64,
    padR = 72,
    // Deeper than line-band.ts's 48: the title sits at y=20 and the window legend needs
    // its own two rows beneath it. At 48 the legend printed straight THROUGH the title —
    // "full history, excluding the 2021–2022 run-up" overlaid on "Cape Coral — median sale
    // price", both legible enough to read and impossible to read at once. Found by
    // rasterizing the real chart and LOOKING at it; every assertion was green.
    padT = 72,
    padB = 56;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const fmt: ValueFormat = opts.valueFormat ?? "usd";

  const pts = [...observed].sort((a, b) => a.when.getTime() - b.when.getTime());

  // A TIME SCALE, NOT AN INDEX SCALE. The fit's endpoints are DATES, and its whole
  // meaning is a rate per month. Spacing the x-axis by array position would stretch a
  // gap in the series to look like a month and print a straight line as a kink.
  const t0 = pts[0].when.getTime();
  const t1 = pts[pts.length - 1].when.getTime();
  const tSpan = t1 - t0 || 1;
  const x = (when: Date) => padL + ((when.getTime() - t0) / tSpan) * innerW;

  // The y-domain must hold every drawn thing — observed AND every fit/fan endpoint —
  // or the trend clips at the frame edge and a reader reads the crop as the data.
  const drawn: FitLayer[] = [overlay.long, overlay.current].filter((l): l is FitLayer => !!l);
  const vals: number[] = pts.map((p) => p.y);
  for (const layer of drawn) {
    for (const c of [layer.line, layer.fan?.hi, layer.fan?.lo]) {
      if (c) vals.push(c.from.y, c.to.y);
    }
  }
  const minY = Math.min(...vals);
  const maxY = Math.max(...vals);
  const span = maxY - minY || 1;
  const y = (v: number) => padT + (1 - (v - minY) / span) * innerH;
  const yBase = padT + innerH;

  const px = (c: FitCurve): [Px, Px] => [
    { x: x(c.from.when), y: y(c.from.y) },
    { x: x(c.to.when), y: y(c.to.y) },
  ];
  const seg = (a: Px, b: Px) =>
    `M ${a.x.toFixed(1)},${a.y.toFixed(1)} L ${b.x.toFixed(1)},${b.y.toFixed(1)}`;

  // gridlines + unit-formatted y ticks (through the ONE value root)
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

  /**
   * THE GLOW — one path, three strokes, wide-and-faint to thin-and-bright. Painted in
   * this order so the widest sits furthest back. No <filter>: see the header.
   */
  const glow = (c: FitCurve, hue: string): string => {
    const [a, b] = px(c);
    const d = seg(a, b);
    return (
      `<path d="${d}" fill="none" stroke="${esc(hue)}" stroke-width="12" stroke-opacity="0.14" stroke-linecap="round"/>` +
      `<path d="${d}" fill="none" stroke="${esc(hue)}" stroke-width="6" stroke-opacity="0.26" stroke-linecap="round"/>` +
      `<path d="${d}" fill="none" stroke="${esc(hue)}" stroke-width="2" stroke-opacity="0.85" stroke-linecap="round"/>`
    );
  };

  /**
   * THE FAN — a filled quad between the two paces the window still supports, and NO
   * STROKE ON ITS EDGES. An edge drawn as a line is a line, and a reader will follow it
   * as one; the whole point of this shape is that there is no line to follow. It pinches
   * at the fit's centroid and opens toward both ends, which is exactly true: the pace is
   * what is uncertain, so the further from the middle you look, the less it pins down.
   */
  const fan = (hi: FitCurve, lo: FitCurve, hue: string): string => {
    const [h0, h1] = px(hi);
    const [l0, l1] = px(lo);
    const d =
      `M ${h0.x.toFixed(1)},${h0.y.toFixed(1)} L ${h1.x.toFixed(1)},${h1.y.toFixed(1)} ` +
      `L ${l1.x.toFixed(1)},${l1.y.toFixed(1)} L ${l0.x.toFixed(1)},${l0.y.toFixed(1)} Z`;
    return `<path d="${d}" fill="${esc(hue)}" fill-opacity="0.16" stroke="none"/>`;
  };

  const paint = (layer: FitLayer): string => {
    const hue = hueFor(layer.direction);
    if (layer.line) return glow(layer.line, hue);
    if (layer.fan) return fan(layer.fan.hi, layer.fan.lo, hue);
    return "";
  };

  // The long window first, the recent one over it — the recent read is the contested
  // part of the sentence, so it sits nearer the reader. Both still sit UNDER the data.
  const backlight = drawn.map(paint).join("");

  // The observed series — drawn LAST, so it is in front of every fit layer. It is the
  // fact; the light behind it is the claim. That z-order IS the argument.
  const line = pts.map((p) => `${x(p.when).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ");
  const areaD =
    `M ${x(pts[0].when).toFixed(1)},${yBase.toFixed(1)} ` +
    pts.map((p) => `L ${x(p.when).toFixed(1)},${y(p.y).toFixed(1)}`).join(" ") +
    ` L ${x(pts[pts.length - 1].when).toFixed(1)},${yBase.toFixed(1)} Z`;
  const hero =
    `<path d="${areaD}" fill="${OBSERVED}" fill-opacity="0.08" stroke="none"/>` +
    `<polyline points="${line}" fill="none" stroke="${OBSERVED}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

  // four evenly-spaced, formatted x labels (one date root)
  const n = pts.length;
  const idxs = [...new Set([0, Math.round((n - 1) / 3), Math.round((2 * (n - 1)) / 3), n - 1])];
  const xLabels = idxs
    .map((i) => {
      const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
      const iso = pts[i].when.toISOString().slice(0, 10);
      return `<text x="${x(pts[i].when).toFixed(1)}" y="${(yBase + 20).toFixed(1)}" text-anchor="${anchor}" font-family="Arial" font-size="11" fill="${AXIS_TEXT}">${esc(formatAxisDateLabel(iso))}</text>`;
    })
    .join("");

  // The end-of-line value, labelled directly — the last OBSERVED point, never a fitted
  // one. A fitted value printed as a number reads as a reading we took.
  const last = pts[n - 1];
  const endLabel =
    `<circle cx="${x(last.when).toFixed(1)}" cy="${y(last.y).toFixed(1)}" r="3.5" fill="${OBSERVED}"/>` +
    `<text x="${(x(last.when) + 6).toFixed(1)}" y="${(y(last.y) + 4).toFixed(1)}" font-family="Arial" font-size="12" font-weight="bold" fill="${OBSERVED}">${esc(formatAxisTick(fmt, last.y))}</text>`;

  // THE WINDOW LABEL TRAVELS. `ex-boom`'s label discloses that we removed the 2021–22
  // run-up; a chart that drew that fit and dropped the label would be hiding the
  // exclusion behind a picture.
  const legend = drawn
    .map((layer, i) => {
      const hue = hueFor(layer.direction);
      const ly = 42 + i * 15; // under the title (y=20), above the plot (padT=72)
      return (
        `<rect x="${padL}" y="${(ly - 6).toFixed(1)}" width="18" height="3" rx="1.5" fill="${esc(hue)}" fill-opacity="${layer.line ? "0.85" : "0.35"}"/>` +
        `<text x="${padL + 24}" y="${ly.toFixed(1)}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(layer.line ? layer.label : `${layer.label} — no direction established`)}</text>`
      );
    })
    .join("");

  const captionParts: string[] = [];
  if (opts.source) captionParts.push(opts.source);
  if (opts.asOf) captionParts.push(`as of ${formatDisplayDate(opts.asOf)}`);
  const caption = captionParts.length
    ? `<text x="${padL}" y="${(H - 12).toFixed(1)}" font-family="Arial" font-size="10" fill="${AXIS_TEXT}">${esc(captionParts.join(" · "))}</text>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${padL}" y="20" font-family="Arial" font-size="15" font-weight="bold" fill="${INK}">${esc(opts.title)}</text>`,
    ...grid,
    legend,
    backlight,
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
