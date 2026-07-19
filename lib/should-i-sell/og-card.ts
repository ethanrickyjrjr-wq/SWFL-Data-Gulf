// lib/should-i-sell/og-card.ts
//
// Share-card model for the Should I Sell read — the OG image every posted
// /r/should-i-sell/<zip> link unfurls into on X/Facebook/Nextdoor/iMessage.
//
// PURE mapping over the ONE per-ZIP stress authority (lib/back-on-market/load-zip.ts,
// the same read the page renders) into the social engine's `SocialModel`
// (lib/social/render-social-image.ts) — no second renderer, no second type scale,
// no second color system (lib/social/CLAUDE.md: extract on copy #2).
//
// No-invention moat is inherited: a suppressed or absent read produces a card with
// NO stat block (the renderer omits it entirely) — never a placeholder number.
import type { BackOnMarketZip } from "../back-on-market/load-zip";
import type { SocialModel } from "../social/render-social-image";

/** Generic branded card — out-of-scope ZIP, absent read, or a loader error. */
const FALLBACK_HEADLINE = "Should I sell in Southwest Florida?";

export function buildShouldISellOgModel(read: BackOnMarketZip | null): SocialModel {
  if (!read) return { headline: FALLBACK_HEADLINE };

  // Loader fallback place is the ZIP itself — don't render "33904 33904".
  const placeIsZip = read.place === read.zip;
  const where = placeIsZip ? `ZIP ${read.zip}` : `${read.place} ${read.zip}`;
  const model: SocialModel = {
    headline: `Should I sell in ${placeIsZip ? `ZIP ${read.zip}` : read.place}?`,
    as_of: read.asOf,
    // Watermark is PUBLIC: the stored citation label carries internal column
    // names after the em-dash ("Redfin Data Center — price_drops, …") — show
    // only the named-source part, never the jargon tail.
    source: read.source.label.split(" — ")[0].trim(),
  };

  // The score the propensity-to-list industry shows everyone except the seller.
  // Verbatim from the brain read; suppressed ZIPs carry null and get NO stat.
  if (read.stressScore != null) {
    const rank = read.area?.rank;
    // ≤48 chars — the renderer clips stat labels there (clip(label, 48)).
    model.stat = {
      label: "Seller stress — the score sellers never see",
      value: `${read.stressScore} / 100`,
      caption: rank ? `#${rank.position} of ${rank.total} SWFL areas · ${where}` : where,
    };
  }

  return model;
}
