// lib/charts/svg/backlit.ts
//
// THE BACKLIT BAR TREATMENT — ONE styling authority for every SVG bar the email
// pipeline rasterizes (operator, 08/09/2026: "can we not get some complementary
// backlit graphs/charts into the emails"). Flat single-hex rectangles read as a
// spreadsheet export; these read as lit: a soft accent glow BEHIND each bar
// (the "backlight"), a subtle luminance gradient along the bar itself, and a
// track tinted from the same accent instead of a foreign grey.
//
// Render-safe BY CONSTRUCTION: every email chart is rasterized to PNG through
// resvg (lib/email/chart-image.ts svgToPng) before any client sees it, and resvg
// supports <linearGradient> and <feGaussianBlur> — so no Outlook/Gmail CSS
// constraint applies. The web RankedDeltaFrame inlines the same string into the
// DOM; def ids are derived from the accent hex so two charts sharing an accent
// collide only on IDENTICAL defs (harmless), never on different ones.
//
// Pure: no React, no DOM, no I/O. Color math via the OKLab roots in palette.ts —
// perceptual tints, not naive RGB scaling.

import { srgbToOklab, oklabToHex, type Oklab } from "@/lib/charts/palette";

/** Perceptual lighten/darken: move OKLab L toward white (+) or black (−). */
function shiftL(hex: string, dL: number): string {
  const lab = srgbToOklab(hex);
  if (!lab) return hex;
  const out: Oklab = { L: Math.min(1, Math.max(0, lab.L + dL)), a: lab.a, b: lab.b };
  return oklabToHex(out);
}

/** Stable def-id fragment for an accent — same accent ⇒ same defs, so inlining
 *  several same-accent charts into one page duplicates ids harmlessly. */
function uid(accent: string): string {
  return accent.replace(/[^0-9a-zA-Z]/g, "").toLowerCase();
}

/** The <defs> block a backlit chart needs, keyed to ONE accent: the bar's
 *  luminance gradient and the gaussian glow filter. Emit once per accent. */
export function backlitDefs(accent: string): string {
  const id = uid(accent);
  const dark = shiftL(accent, -0.06);
  const light = shiftL(accent, 0.14);
  return (
    `<defs>` +
    `<linearGradient id="bkbar-${id}" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${dark}"/>` +
    `<stop offset="1" stop-color="${light}"/>` +
    `</linearGradient>` +
    // The backlight. stdDeviation 3 at a 16px bar height reads as a halo, not a smear.
    `<filter id="bkglow-${id}" x="-40%" y="-120%" width="180%" height="340%">` +
    `<feGaussianBlur stdDeviation="3"/>` +
    `</filter>` +
    `</defs>`
  );
}

/** Vertical fade for a trend chart's area fill (accent → transparent). */
export function backlitAreaDefs(accent: string): string {
  const id = uid(accent);
  return (
    `<defs>` +
    `<linearGradient id="bkarea-${id}" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${accent}" stop-opacity="0.26"/>` +
    `<stop offset="1" stop-color="${accent}" stop-opacity="0.02"/>` +
    `</linearGradient>` +
    `<filter id="bkline-${id}" x="-10%" y="-60%" width="120%" height="220%">` +
    `<feGaussianBlur stdDeviation="2.4"/>` +
    `</filter>` +
    `</defs>`
  );
}

export function areaFillRef(accent: string): string {
  return `url(#bkarea-${uid(accent)})`;
}
export function lineGlowRef(accent: string): string {
  return `url(#bkline-${uid(accent)})`;
}

/** One horizontal backlit bar: the blurred accent halo behind, then the
 *  gradient pill on top. `h` is the bar height; radius is a full pill. */
export function backlitBar(x: number, y: number, w: number, h: number, accent: string): string {
  const id = uid(accent);
  const r = Math.min(h / 2, 8);
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${accent}" opacity="0.55" filter="url(#bkglow-${id})"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#bkbar-${id})"/>`
  );
}

/** The track a backlit bar runs on — the same accent at whisper opacity, so the
 *  empty remainder of the row stays in the bar's own family instead of a
 *  foreign grey. */
export function backlitTrack(x: number, y: number, w: number, h: number, accent: string): string {
  const r = Math.min(h / 2, 8);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${accent}" fill-opacity="0.10"/>`;
}
