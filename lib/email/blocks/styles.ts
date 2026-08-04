// lib/email/blocks/styles.ts
//
// Shared style atoms for the pure block components. No React — just constants +
// a font-family resolver, so blocks stay consistent across the canvas DOM view
// and the server render() export.

import { BRAND_FONTS } from "@/lib/brand/fonts";
import { CARD_PAD, pad } from "./scale";
import type { EmailGlobalStyle, FontFamily, PaddingSize } from "../doc/types";

// Stacks + webfont URLs live in lib/brand/fonts.ts (the one font root, wave 2) —
// this module keeps its export shape and derives from the registry.
export function fontStack(family: FontFamily): string {
  return BRAND_FONTS[family].stack;
}

/** Headline stack: displayFontFamily when set, else the body family. */
export function displayFontStack(gs: EmailGlobalStyle): string {
  return fontStack(gs.displayFontFamily ?? gs.fontFamily);
}

/**
 * *** FAMILY FOLLOWS THE TYPE ROLE. THE ROLE DECIDES, NEVER THE BLOCK. ***
 *
 * Operator, 08/04/2026, on the sent comps email: *"Why are all the fonts fucking different
 * and stupid just about everywhere???!!!!!!!!"*
 *
 * Measured on that build: FOUR font-family declarations, and the two that matter were
 * `'Playfair Display', Georgia, serif` and `'Lato', …, sans-serif`. (The other two carried
 * `!important` and are the Outlook `[if mso]` pin — correct, and invisible outside Outlook.)
 * Two families is the design, not the bug. The bug was WHICH BLOCK GOT WHICH: only
 * `HeaderBlock` and `HeroBlock` called `displayFontStack`, so a 44px serif price rendered
 * directly above a 28px SANS section heading — two display-scale moments in two different
 * typefaces, which reads as an accident rather than a system.
 *
 * The seven-role scale already says which type is display type. So the family is derived
 * from the role and no block gets a vote: display sizes (hero/h1/metric/h2) take the
 * display family, body/caption/mono take the body family. A doc that sets no separate
 * `displayFontFamily` collapses to one family everywhere, exactly as before.
 */
export function familyForRole(
  role: "hero" | "h1" | "metric" | "h2" | "body" | "caption" | "mono",
  gs: EmailGlobalStyle,
): string {
  const DISPLAY_ROLES = new Set(["hero", "h1", "metric", "h2"]);
  return DISPLAY_ROLES.has(role) ? displayFontStack(gs) : fontStack(gs.fontFamily);
}

/** Google Fonts CSS2 <link> URLs for web-font families — derived from the one font root. */
export const WEB_FONT_URLS: Partial<Record<FontFamily, string>> = Object.fromEntries(
  Object.entries(BRAND_FONTS).flatMap(([k, v]) => (v.webfontUrl ? [[k, v.webfontUrl]] : [])),
);

// THE GUTTER WAS OFF-GRID ON EVERY SECTION OF EVERY BLOCK. `28px` is not a spacing
// token (the grid is 4/8/12/16/24/32/48/64/96) and `36px` isn't either — they were
// hand-typed once and inherited by all 18 components. Now built from the scale:
// the horizontal gutter is the doc's card padding (24), and the vertical steps walk
// real tokens. See lib/email/blocks/scale.ts.
const PAD_Y: Record<PaddingSize, string> = {
  none: pad(0, CARD_PAD),
  sm: pad(12, CARD_PAD),
  md: pad(CARD_PAD, CARD_PAD), // the doc's "Card padding: 24"
  lg: pad(32, CARD_PAD), // was 36 — off-grid; 32 is the token above 24
};

export function sectionPad(paddingY?: PaddingSize): string {
  return PAD_Y[paddingY ?? "md"];
}

export const SECTION_PAD = pad(CARD_PAD, CARD_PAD);
export const MUTED = "#6B7280";
export const BORDER = "#E5E7EB";
export const CARD_BG = "#ffffff";
