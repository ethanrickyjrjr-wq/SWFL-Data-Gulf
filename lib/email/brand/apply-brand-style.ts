// lib/email/brand/apply-brand-style.ts
//
// The globalStyle half of applyBrand, extracted pure so it's testable without
// importing the client shell. applyBrand (components/email-lab/EmailLabShell.tsx,
// the ONE brand-fill root — the grid shell imports it) delegates here.

import type { EmailGlobalStyle, FontFamily } from "@/lib/email/doc/types";
import { BRAND_FONTS, isFontFamily } from "@/lib/brand/fonts";

// Fence 4 (docs/superpowers/specs/2026-07-08-email-grid-fence-system-design.md)
// — a serif display may never land on a serif body. Only two of the six
// families are serifs; every other combination is legal. Derived from
// BRAND_FONTS (not hand-duplicated) so a new serif family added there is
// automatically covered here.
const SERIF_FAMILIES = new Set<FontFamily>(["BOOK_SERIF", "PLAYFAIR_SERIF"]);
const ALL_FAMILIES = Object.keys(BRAND_FONTS) as FontFamily[];
const SANS_FAMILIES = ALL_FAMILIES.filter((f) => !SERIF_FAMILIES.has(f));

/** fontFamily (body) → the displayFontFamily values legal alongside it. */
export const BLESSED_PAIRINGS: Record<FontFamily, readonly FontFamily[]> = Object.fromEntries(
  ALL_FAMILIES.map((body) => [body, SERIF_FAMILIES.has(body) ? SANS_FAMILIES : ALL_FAMILIES]),
) as unknown as Record<FontFamily, readonly FontFamily[]>;

export function brandGlobalStyle(
  gs: EmailGlobalStyle,
  t: Record<string, string>,
): EmailGlobalStyle {
  const fontFamily = t.FONT_BODY && isFontFamily(t.FONT_BODY) ? t.FONT_BODY : gs.fontFamily;
  const requestedDisplay =
    t.FONT_DISPLAY && isFontFamily(t.FONT_DISPLAY) ? t.FONT_DISPLAY : undefined;
  const legalForBody = BLESSED_PAIRINGS[fontFamily];
  // Cascade: the newly requested display font, else the pre-existing one
  // (covers "only FONT_BODY changed"), else drop it — a body-font change can
  // make an untouched display font newly illegal (e.g. body flips to a serif
  // while the old serif display was never resubmitted); never let that stale
  // pair through just because it wasn't the field being changed this call.
  const displayFontFamily =
    requestedDisplay && legalForBody.includes(requestedDisplay)
      ? requestedDisplay
      : gs.displayFontFamily && legalForBody.includes(gs.displayFontFamily)
        ? gs.displayFontFamily
        : undefined;

  return {
    ...gs,
    primaryColor: t.PRIMARY || gs.primaryColor,
    accentColor: t.ACCENT || gs.accentColor,
    textColor: t.TEXT || gs.textColor,
    backdropColor: t.BACKDROP || gs.backdropColor,
    fontFamily,
    displayFontFamily,
    surfaceColor: t.SURFACE || gs.surfaceColor,
    surfaceDarkColor: t.SURFACE_DARK || gs.surfaceDarkColor,
  };
}
