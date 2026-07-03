// lib/email/blocks/on-dark.ts — the dark-band text flip. PURE, render-time.
//
// Any dark section background — band-resolved by the author engine OR hand-set
// in the inspector — swaps a block's text to light ink, so dark-on-dark is
// unreachable by construction. Computed at render (never persisted): it can't
// drift when the user later edits sectionBg, and it covers every source of a
// dark surface. WCAG math reused from lib/charts/palette (ONE root).
import { contrastRatio, parseHex } from "@/lib/charts/palette";

export const ON_DARK_TITLE = "#ffffff";
export const ON_DARK_BODY = "rgba(255,255,255,0.85)";
export const ON_DARK_MUTED = "rgba(255,255,255,0.72)";

/** True when white text is the more legible ink on this background. Non-hex or
 *  absent input (rgba scrims, named colors) never flips — and never throws. */
export function isDarkBg(bg?: string): boolean {
  if (!bg || !parseHex(bg)) return false;
  return contrastRatio(ON_DARK_TITLE, bg) >= contrastRatio("#111827", bg);
}

/** Keep an accent that still pops on a dark band; fall to white when it can't
 *  (an accent-on-accent or navy-on-navy band). WCAG 3:1 = large-text floor. */
export function legibleAccent(accent: string, bg: string): string {
  if (!parseHex(accent) || !parseHex(bg)) return accent;
  return contrastRatio(accent, bg) >= 3 ? accent : ON_DARK_TITLE;
}
