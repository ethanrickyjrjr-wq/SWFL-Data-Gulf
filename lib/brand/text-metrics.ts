// lib/brand/text-metrics.ts
//
// THE ONE text-measurement root. Every server-rasterized surface that has to decide
// "does this string fit in this many pixels" asks here — never by counting characters.
//
// WHY THIS EXISTS (operator, 08/06/2026): *"IF FONT IS GOING TO BE AN ISSUE, WE NEED TO
// FUCKING DO SOMETHING ELSE. WHY THE FUCK ISN'T EVERYTHING CENTERED INTO GRID AND AUTO
// ADJUSTS."* He is right, and the diagnosis underneath it is that this was never a font
// problem. Every hand-rolled SVG chart builder fit its labels by CHARACTER COUNT
// (`label.length > 26 ? label.slice(0, 25) + "…"`). A character budget is blind on both
// axes at once:
//
//   ACROSS FACES  — the same 22-char string spans 1.14x from Jost to Montserrat.
//   WITHIN ONE FACE — 22 chars of "1" is 87.4px and 22 chars of "W" is 268.9px in
//                     Montserrat at 11px. 3.08x. No character budget can see that.
//
// Both measured 08/06/2026 off the bundled TTFs. The consequence was live BEFORE any
// brand font was wired: "Whiskey Creek 33919 — SOLD" is exactly 26 characters, passes
// barChartSvg's budget untouched, and paints 20.7px over the bars in Liberation Sans —
// the incumbent Arial-metric face. So the fix is not a different font. It is measuring.
//
// MECHANISM (RULE 0.9 — don't hand-roll plumbing): fontkit reads the real `hmtx` advance
// widths out of the TTFs we ALREADY bundle and trace for resvg (assets/fonts/*.ttf,
// next.config.ts outputFileTracingIncludes). No new asset, no new download — fontkit is
// already installed. A hand-rolled parser was written first and silently returned an
// identical width for every string because Inter's cmap is format 12, not format 4;
// that class of failure is exactly why we do not hand-roll binary parsers.
//
// FAIL-SAFE: if a face cannot be read (the documented serverless-bundle landmine), we
// fall back to a DELIBERATELY WIDE per-character estimate. Returning 0 would make
// everything "fit" and repaint the bars; returning NaN would emit NaN into an SVG
// attribute and blank the label. Over-estimating truncates early, which is ugly but
// legible — the only acceptable direction to be wrong in.

// ISOMORPHIC BY CONSTRUCTION — and that is not optional. `ranked-delta.ts` and
// `dot-plot.ts` are ONE builder powering TWO surfaces: the email PNG (node, resvg) and
// a React chart frame that is a CLIENT component. A top-level `import "fontkit"` /
// `import "node:path"` here puts a node-only binary parser in the browser bundle and
// FAILS THE BUILD — caught by `bunx next build` 08/06/2026, not by any test, because
// the 7,078 lib tests all run in node where both imports resolve fine.
//
// So the node-only pieces load LAZILY, behind a runtime check, through an indirect
// require the bundler cannot statically follow. In the browser we fall through to the
// conservative character estimate below, which over-measures and therefore truncates
// early — the safe direction. The email PNG, which is the surface that actually has a
// fixed gutter to overflow, always runs in node and always gets the real metrics.
import { BRAND_FONTS } from "./fonts";
import type { FontFamily } from "@/lib/email/doc/types";

const IS_NODE =
  typeof process !== "undefined" && !!process.versions?.node && typeof window === "undefined";

/** Indirect require, reached OFF `process` so no bundler can statically trace it into the
 *  client bundle. `eval("require")` was tried first and throws `require is not defined`
 *  under Bun's ESM loader — which is how the whole lib suite runs — so it silently
 *  degraded every measurement to the estimate while staying green. `getBuiltinModule` is
 *  present in both Node 22+ and Bun. Only ever called under IS_NODE; any failure
 *  degrades to the estimate. */
let cachedRequire: ((id: string) => unknown) | null | undefined;
function nodeRequire(id: string): unknown {
  if (cachedRequire === undefined) {
    try {
      const mod = (
        process as unknown as { getBuiltinModule?: (m: string) => unknown }
      ).getBuiltinModule?.("module") as
        { createRequire(p: string): (id: string) => unknown } | undefined;
      cachedRequire = mod ? mod.createRequire(process.cwd() + "/package.json") : null;
    } catch {
      cachedRequire = null;
    }
  }
  if (!cachedRequire) throw new Error("no require available");
  return cachedRequire(id);
}

export type FontWeight = "regular" | "bold";

export interface MeasureOpts {
  /** Brand face. Omitted or unknown → the product default, matching what resvg's
   *  `defaultFontFamily` actually renders for a brand-less build. */
  family?: FontFamily;
  /** Rendered size in px — the same number the SVG's `font-size` carries. */
  size: number;
  /** Chart titles and every value label in our builders are `font-weight:bold`, and
   *  bold advances are wider. Measuring Regular for a bold string under-measures. */
  weight?: FontWeight;
}

/** Per-character width as a fraction of the em, used ONLY when a face cannot be read.
 *  Set ABOVE the real average advance of every face we ship (measured range 0.43–0.53em
 *  for mixed-case) so the fallback truncates early rather than overflowing. */
export const CHAR_ESTIMATE_FALLBACK_PX_PER_EM = 0.62;

type Face = { unitsPerEm: number; layout(t: string): { advanceWidth: number } };

const cache = new Map<string, Face | null>();

/** Opens a bundled face once and caches it — including the FAILURE, so a missing file
 *  costs one syscall per process rather than one per label. */
function faceFor(family: FontFamily | undefined, weight: FontWeight): Face | null {
  if (!IS_NODE) return null; // browser → conservative estimate, never a broken bundle
  const entry = (family && BRAND_FONTS[family]) || BRAND_FONTS.MODERN_SANS;
  const file = entry.canvasFiles[weight === "bold" ? 1 : 0];
  const key = file;
  if (cache.has(key)) return cache.get(key) ?? null;
  let face: Face | null = null;
  try {
    const nodePath = nodeRequire("node:path") as { join(...p: string[]): string };
    const { openSync } = nodeRequire("fontkit") as { openSync(p: string): unknown };
    face = openSync(nodePath.join(process.cwd(), "assets", "fonts", file)) as Face;
    // A face that parses but reports no em is unusable — treat it as a miss rather than
    // dividing by zero into Infinity.
    if (!face || !face.unitsPerEm) face = null;
  } catch {
    face = null;
  }
  cache.set(key, face);
  return face;
}

/** Rendered width of `text` in px, from the REAL advance widths of the bundled face.
 *  Never throws, never returns NaN. Empty string is 0. */
export function measureText(text: string, opts: MeasureOpts): number {
  if (!text) return 0;
  const size = Number.isFinite(opts.size) && opts.size > 0 ? opts.size : 0;
  if (!size) return 0;
  const face = faceFor(opts.family, opts.weight ?? "regular");
  if (!face) return estimate(text, size);
  try {
    const w = (face.layout(text).advanceWidth / face.unitsPerEm) * size;
    return Number.isFinite(w) && w >= 0 ? w : estimate(text, size);
  } catch {
    return estimate(text, size);
  }
}

/** The conservative no-face fallback. Counts code points, not UTF-16 units, so an
 *  emoji or an accented glyph is one character rather than two. */
function estimate(text: string, size: number): number {
  return [...text].length * CHAR_ESTIMATE_FALLBACK_PX_PER_EM * size;
}

/**
 * `text` if it fits `maxWidth`, otherwise the longest prefix that fits INCLUDING the
 * ellipsis. This is the replacement for every `s.length > N ? s.slice(0, N-1) + "…" : s`
 * in the SVG builders.
 *
 * Returns the input verbatim when it fits — no gratuitous ellipsis. Returns "" when not
 * even one glyph plus the ellipsis fits, because a bare "…" wider than its own box is
 * still an overflow.
 */
export function fitText(text: string, maxWidth: number, opts: MeasureOpts): string {
  if (!text) return "";
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) return "";
  if (measureText(text, opts) <= maxWidth) return text;

  const chars = [...text];
  const ell = "…";
  // Binary search the longest prefix whose width WITH the ellipsis still fits. Linear
  // would be fine at our label lengths; binary keeps it honest if a caption ever grows.
  let lo = 0;
  let hi = chars.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (measureText(chars.slice(0, mid).join("") + ell, opts) <= maxWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best === 0) return "";
  // Don't leave a dangling space before the ellipsis.
  return chars.slice(0, best).join("").trimEnd() + ell;
}

export interface GutterOpts extends MeasureOpts {
  /** Space between the longest label and whatever sits to its right. Matches the
   *  builders' existing `padL - 8` right-anchor offset. */
  padding?: number;
  /** Floor, so a chart of one-digit labels does not collapse its axis. */
  min?: number;
  /** Ceiling, so one pathological label cannot eat the plot area. */
  max?: number;
}

/**
 * THE "AUTO ADJUSTS" PIECE. The width a label gutter needs for THESE labels in THIS
 * face — measured, clamped, never hardcoded.
 *
 * The builders pin `padL = 150` / `156` regardless of content, which is wrong in both
 * directions at once: a chart of ZIP codes wastes a quarter of a 600px canvas, and a
 * chart of street addresses truncates against a gutter nobody measured. Sizing the
 * gutter to the real content is what gives the bars back their space.
 *
 * With no labels it returns the floor — not NaN, and not a collapsed axis.
 */
export function labelGutterFor(labels: readonly string[], opts: GutterOpts): number {
  const pad = opts.padding ?? 8;
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  const real = labels.filter((l) => typeof l === "string" && l.length > 0);
  if (real.length === 0) return min;
  const widest = Math.max(...real.map((l) => measureText(l, opts)));
  return Math.min(max, Math.max(min, Math.ceil(widest + pad)));
}
