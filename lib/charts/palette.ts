// lib/charts/palette.ts
// On-brand chart palette extension + legible label picking. Pure, zero-dep.
//
// Brand/chosen colors are ALWAYS applied as-is; this module only generates the
// EXTRA fills a chart needs beyond the brand, keeping them on-brand, distinct,
// visible, and legibly labeled. Never blocks a send, never recolors a brand,
// never inspects images.
//
// Sourced constants (verbatim, first-party, fetched live via crawl4ai 2026-07-01):
//   - WCAG 2.2 relative luminance + contrast ratio: W3C TR/WCAG22 Appendix A.
//   - OKLab forward/inverse matrices: Björn Ottosson (2021-01-25 revision).
// Provenance + evidence tiers: _ASSISTANT/research/2026-07-01-taskB-wcag-contrast-verification.md

// ─── (1) hex parse + sRGB linearize ────────────────────────────────────────

/** Parse #rgb / #rrggbb → [r,g,b] 0-255, or null for non-hex input (never throws). */
export function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** sRGB 8-bit channel → linear-light. WCAG: c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4. */
function channelToLinear(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function srgbToLinear(hex: string): [number, number, number] | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return [channelToLinear(rgb[0]), channelToLinear(rgb[1]), channelToLinear(rgb[2])];
}

// ─── (2) WCAG relative luminance + contrast ratio ──────────────────────────

/** WCAG relative luminance: L = 0.2126R + 0.7152G + 0.0722B (linear channels). */
export function relativeLuminance(hex: string): number {
  const lin = srgbToLinear(hex);
  if (!lin) return 0;
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** WCAG contrast ratio (L1+0.05)/(L2+0.05), L1=lighter. Range 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const L1 = Math.max(la, lb);
  const L2 = Math.min(la, lb);
  return (L1 + 0.05) / (L2 + 0.05);
}

// ─── (3) OKLab / OKLCH conversion + perceptual distance ────────────────────
// Verbatim Ottosson linear-sRGB↔OKLab matrices (2021-01-25 revision).

export interface Oklab {
  L: number;
  a: number;
  b: number;
}
export interface Oklch {
  L: number;
  C: number;
  h: number;
} // h in degrees 0..360

export function srgbToOklab(hex: string): Oklab | null {
  const lin = srgbToLinear(hex);
  if (!lin) return null;
  const [r, g, b] = lin;
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l),
    m_ = Math.cbrt(m),
    s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

/** Linear-light channel → sRGB 8-bit. Inverse of channelToLinear; threshold 0.0031308 = 0.04045/12.92. */
function linearToChannel(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

export function oklabToHex(lab: Oklab): string {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_,
    m = m_ * m_ * m_,
    s = s_ * s_ * s_;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const hx = (n: number) => linearToChannel(n).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

export function oklabToOklch(lab: Oklab): Oklch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  let h = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: lab.L, C, h };
}

export function oklchToOklab(lch: Oklch): Oklab {
  const rad = (lch.h * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(rad), b: lch.C * Math.sin(rad) };
}

export function oklabDistance(a: Oklab, b: Oklab): number {
  const dL = a.L - b.L,
    da = a.a - b.a,
    db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}
