// lib/social/safe-zones.ts
//
// Social safe zones — keep KEY ELEMENTS (headline, stat, logo, CTA, watermark)
// clear of each platform's UI-chrome bands. The BACKGROUND artwork is NEVER
// constrained (full-bleed edge-to-edge); only text/logo/CTA are laid out inside
// the band. This is a soft layout aid, never a hard block — a build is never
// refused because of a safe zone (RULE 0.7).
//
// Client-safe: pure math, no @resvg import — so both the server rasterizer
// (render-social-image.ts) and the client composer overlay (KonvaStage.tsx)
// import from ONE source of truth.
//
// ── Evidence (fetched live via crawl4ai 2026-07-01, RULE 0.4) ────────────────
// Full note: _ASSISTANT/research/2026-07-01-social-safezone-meta-firstparty-verification.md
//
//  • BOTTOM 35% of a 9:16 story — META FIRST-PARTY, verbatim
//    (developers.facebook.com/docs/marketing-api/creative/reels-ads/):
//    "Keep the bottom 35% of your 9:16 creative free of text, logos, and other
//     key elements." Bottom is placement-dependent (20% plain Story, 35% Reel);
//    we default to the conservative 35% since a Story asset may be cross-posted
//    as a Reel.
//  • TOP 14% (250px) — TWO independent sources (Sprout Social + billo.app):
//    "Leave 14% (250 pixels) at the top ... free of text and logos."
//  • SIDES 6% — billo.app only (weakest evidence); small + tunable.
//  • FEED formats (square/portrait/landscape) have NO full-screen UI chrome, so
//    their safe inset stays the historical 7% margin — this keeps their rendered
//    output byte-identical (zero blast radius on existing feed cards).
//
// The numbers live HERE and only here, so they are trivially tunable if the
// platform chrome shifts (exactly the drift RULE 0.4 exists to catch).

import type { SocialFormat } from "@/lib/social/formats";

/** Safe-zone insets in pixels, measured inward from each edge of the canvas. */
export interface SocialSafeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Fractional insets per format (fraction of height for top/bottom, width for left/right). */
export interface SafeZoneFraction {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The historical uniform margin for feed formats — matches the old `width * 0.07` pad. */
const FEED = { top: 0.07, bottom: 0.07, left: 0.07, right: 0.07 } as const;

/**
 * Fraction tables. Feed formats == the prior 7% behavior (unchanged output).
 * `story` reserves the UI-chrome bands. Tunable — see evidence tiers above.
 */
export const SAFE_ZONE_FRACTIONS: Record<SocialFormat, SafeZoneFraction> = {
  square: { ...FEED },
  portrait: { ...FEED },
  landscape: { ...FEED },
  story: { top: 0.14, bottom: 0.35, left: 0.06, right: 0.06 },
};

/**
 * Resolve a format's safe insets to pixels for a given canvas size. Top/bottom
 * scale with height, left/right with width — matching how the platform UI chrome
 * actually sits on the canvas. Rounded to whole pixels.
 */
export function safeInsets(format: SocialFormat, width: number, height: number): SocialSafeInsets {
  const f = SAFE_ZONE_FRACTIONS[format];
  // Feed formats historically used a UNIFORM width-based margin on ALL edges;
  // preserve that exactly so their rendered output stays byte-identical. Chrome
  // formats (story) measure top/bottom against HEIGHT — matching how the platform
  // UI bands are actually specified (e.g. "bottom 35% of the 9:16 creative").
  const vertBasis = hasChromeSafeZone(format) ? height : width;
  return {
    top: Math.round(vertBasis * f.top),
    bottom: Math.round(vertBasis * f.bottom),
    left: Math.round(width * f.left),
    right: Math.round(width * f.right),
  };
}

/**
 * The safe fractions as CSS percentage strings, for a DOM guide overlay. Percentages
 * map directly onto the fractions with no scale math (the overlay div matches the
 * scaled stage box). Returned as strings ready for inline style.
 */
export function safeInsetPercents(format: SocialFormat): {
  top: string;
  bottom: string;
  left: string;
  right: string;
} {
  const f = SAFE_ZONE_FRACTIONS[format];
  return {
    top: `${(f.top * 100).toFixed(2)}%`,
    bottom: `${(f.bottom * 100).toFixed(2)}%`,
    left: `${(f.left * 100).toFixed(2)}%`,
    right: `${(f.right * 100).toFixed(2)}%`,
  };
}

/**
 * True when a format has a MEANINGFUL safe band worth drawing a guide for (i.e.
 * more than the uniform feed margin). Only `story` today. Lets the composer show
 * the full danger-band guide for story and a plain frame for feed.
 */
export function hasChromeSafeZone(format: SocialFormat): boolean {
  const f = SAFE_ZONE_FRACTIONS[format];
  return f.top !== FEED.top || f.bottom !== FEED.bottom;
}
