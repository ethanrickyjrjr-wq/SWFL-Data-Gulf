// lib/email/blocks/on-dark.ts — the dark-band text flip. PURE, render-time.
//
// Any dark section background — band-resolved by the author engine OR hand-set
// in the inspector — swaps a block's text to light ink, so dark-on-dark is
// unreachable by construction. Computed at render (never persisted): it can't
// drift when the user later edits sectionBg, and it covers every source of a
// dark surface. WCAG math reused from lib/charts/palette (ONE root).
import { contrastRatio, parseHex, readableLabel } from "@/lib/charts/palette";

export const ON_DARK_TITLE = "#ffffff";
export const ON_DARK_BODY = "rgba(255,255,255,0.85)";
export const ON_DARK_MUTED = "rgba(255,255,255,0.72)";

/** True when white text is the more legible ink on this background. Non-hex or
 *  absent input (rgba scrims, named colors) never flips — and never throws. */
export function isDarkBg(bg?: string): boolean {
  if (!bg || !parseHex(bg)) return false;
  return contrastRatio(ON_DARK_TITLE, bg) >= contrastRatio("#111827", bg);
}

/** Keep `preferred` ink when it clears `floor` on `bg`; else fall to the readable
 *  NEUTRAL FOR THAT BG — white on dark, #111827 on light (readableLabel, ONE root).
 *  Floors per WCAG AA (spec 2026-07-09-email-accent-ink-palette-gate-design.md §2):
 *  4.5 functional text · 3 large text + non-text. Non-hex input passes through. */
export function legibleInk(preferred: string, bg: string, floor = 3): string {
  if (!parseHex(preferred) || !parseHex(bg)) return preferred;
  if (contrastRatio(preferred, bg) >= floor) return preferred;
  return readableLabel(bg, { dark: "#111827", light: "#ffffff" });
}

/** Keep an accent that still pops on a dark band; fall to the readable neutral
 *  when it can't (an accent-on-accent or navy-on-navy band). 3:1 = WCAG
 *  large-text/non-text floor. */
export function legibleAccent(accent: string, bg: string): string {
  return legibleInk(accent, bg, 3);
}
