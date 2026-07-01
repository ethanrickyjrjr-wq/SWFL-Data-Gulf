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
