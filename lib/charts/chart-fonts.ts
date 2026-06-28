// lib/charts/chart-fonts.ts
//
// THE ONE bundled font for server-side chart rasterization (resvg). Vercel's Linux
// runtime has NO "Arial"; resvg's loadSystemFonts:true then renders chart labels as
// NOTHING — silently, no error (a blank-text PNG). The fix is to ship a real TTF and
// hand resvg its path. We vendor Liberation Sans (SIL OFL, see assets/fonts/LICENSE-
// Liberation.txt) because it is METRIC-COMPATIBLE with Arial — the hand-rolled SVG
// builders pad/anchor assuming Arial glyph widths, so the layout stays pixel-identical.
//
// The files live in the repo (assets/fonts/), NOT node_modules — a deduped/pruned
// node_modules path would resolve locally but vanish in the serverless bundle. Any
// route that calls svgToPng MUST trace these via next.config.ts outputFileTracingIncludes
// (today: /api/email-lab/ai). process.cwd() is the project root both locally and on Vercel.

import path from "node:path";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

/** Absolute paths resvg loads via `font.fontFiles`. Regular + Bold so `font-weight:bold`
 *  in the SVG resolves to the real bold face (not a synthesized smear). */
export const CHART_FONT_FILES: string[] = [
  path.join(FONT_DIR, "LiberationSans-Regular.ttf"),
  path.join(FONT_DIR, "LiberationSans-Bold.ttf"),
];

/** The family name resvg falls back to for an unknown `font-family` (our SVGs say
 *  "Arial", which isn't loaded) — set to the bundled family so that fallback lands on
 *  Liberation rather than nothing. */
export const CHART_FONT_FAMILY = "Liberation Sans";
