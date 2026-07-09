// lib/brand/palette-contrast.ts — Fence 6 Tier B: pure scheme-contrast evaluator.
//
// Evaluates ONLY the ink-on-surface pairs the email renderer actually creates
// (spec docs/superpowers/specs/2026-07-09-email-accent-ink-palette-gate-design.md §3).
// Pure + side-effect free: the BrandingBlock strip renders the result; nothing
// blocks a save, nothing rewrites a color — the render-time legibleInk guards
// (lib/email/blocks/on-dark.ts) are the enforcement layer, this is the feedback
// layer. Empty/non-hex slots skip their pairs (a gap is never a refusal).
// Floors: WCAG AA — 4.5 functional text, 3 large text (verified via WebAIM
// https://webaim.org, 07/09/2026). WCAG math from lib/charts/palette (ONE root).
import { contrastRatio, parseHex } from "@/lib/charts/palette";

export interface SchemeWarning {
  /** Plain-language place the pair shows up (no hex jargon). */
  surface: string;
  /** WCAG contrast ratio, raw (the UI rounds for display). */
  ratio: number;
  /** The floor this pair missed. */
  floor: number;
  /** What the render guards will do about it — warn copy, not a threat. */
  consequence: string;
}

// The fixed light surfaces brand ink lands on (lib/email/blocks/styles.ts CARD_BG
// and FooterBlock's section fill).
const CARD = "#ffffff";
const FOOTER = "#F9FAFB";

/** scheme = [primary, accent, text, background] — lib/brand/palette.ts slot order. */
export function evaluateSchemeContrast(scheme: [string, string, string, string]): SchemeWarning[] {
  const [primary, accent, text, backdrop] = scheme;
  const out: SchemeWarning[] = [];
  const check = (ink: string, bg: string, floor: number, surface: string, consequence: string) => {
    if (!parseHex(ink) || !parseHex(bg)) return; // empty/non-hex slot → skip, never block
    const ratio = contrastRatio(ink, bg);
    if (ratio < floor) out.push({ surface, ratio, floor, consequence });
  };

  check(
    accent,
    primary,
    4.5,
    "accent text on your primary color",
    "taglines on headers will use white or dark ink instead of your accent",
  );
  check(
    accent,
    CARD,
    4.5,
    "accent links on white cards",
    "links will use a darker ink so they stay readable",
  );
  check(
    accent,
    FOOTER,
    4.5,
    "accent links in the footer",
    "footer links will use a darker ink so they stay readable",
  );
  check(
    "#ffffff",
    primary,
    4.5,
    "white text on your primary color",
    "headers and buttons will use dark ink instead of white",
  );
  check(
    "#ffffff",
    accent,
    4.5,
    "text on your accent color",
    "badges will pick a readable ink automatically",
  );
  check(
    text,
    backdrop,
    4.5,
    "your text color on your background",
    "body copy may be hard to read - consider a darker text color",
  );
  check(
    primary,
    CARD,
    3,
    "price and headline text in your primary color",
    "large numbers will use a darker ink when needed",
  );
  return out;
}
