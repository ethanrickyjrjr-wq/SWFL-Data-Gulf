// lib/social/design/system.ts
//
// THE SOCIAL DESIGN SYSTEM, AS CODE. The sibling of `lib/email/blocks/scale.ts`
// — same idea, same construction, DIFFERENT numbers, and it shares the one thing
// that must never fork: the palette (`lib/brand/tokens.ts`) and the WCAG math
// (`lib/charts/palette`). A social canvas is 1080px wide and viewed at arm's
// length in a feed; an email is ~600px wide and read. The px do not transfer.
// The SYSTEM does.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// Measured 07/14/2026, before it did:
//
//   • FIVE templates each invented their own type scale as magic multipliers of
//     `base`: 0.16 · 0.09 · 0.085 · 0.075 · 0.045 · 0.04 · 0.034 · 0.032 · 0.03 ·
//     0.028 · 0.1. FOUR of those (0.028–0.034) land within 30–37px of each other —
//     they are not steps in a ladder, they are noise.
//   • `render-social-image.ts` has a SECOND, unrelated scale (0.054 · 0.12 · 0.03 ·
//     0.024 · 0.022 · 0.018) — off a different base. Two type systems, one product.
//   • Every headline is `fontStyle: "bold"`. There is no weight ladder at all.
//   • The accent default was `#0ea5b7` — not our teal. See lib/brand/tokens.ts.
//
// ── THE min(W,H) BUG THIS FILE FIXES ─────────────────────────────────────────
//
// `templates.ts` sizes type off `base = Math.min(W, H)`, and its comment says why:
// "so a layout that fits the square also fits the short landscape strip (H=630)."
// That is a VERTICAL-OVERFLOW hack doing the job of a LEGIBILITY decision, and it
// silently costs the landscape format ~42% of its type size — because landscape
// (1200x630) is the only format where height < width. Square/portrait/story all
// have min(W,H) = 1080; landscape has 630.
//
//   a `0.028` label →  30px on square … but 18px on landscape.
//
// Every one of these surfaces displays an image FIT TO WIDTH. Height never touches
// how big the text looks. On-screen size = fontSize x (displayWidth / canvasWidth),
// so to hold apparent size constant, type must track WIDTH. It does now.
//
// Landscape's real constraint — 630px of height — is solved where it belongs: the
// bounds test fails a stack that does not fit, and the template drops a role or
// shortens its copy. It is NOT solved by shrinking type below the legibility floor,
// which is what min(W,H) was quietly doing.
//
// ── THE TWO RULES THAT KILL THE BUG CLASS BY CONSTRUCTION ────────────────────
//
// 1. `type(role, format)` returns fontSize AND lineHeight AND fontWeight TOGETHER.
//    A size cannot be chosen without its leading. (This is, independently, the
//    W3C Design Tokens composite `typography` token — tr.designtokens.org/format.)
//
// 2. `ink(role, theme, on)` returns a fill that is CONTRAST-CHECKED FOR THAT ROLE.
//    A small role carries a 4.5:1 floor, a big role carries 3:1, and `legibleInk`
//    (lib/email/blocks/on-dark.ts — ONE root, already correct) demotes anything
//    that misses. A template CANNOT ask for an unreadable color, so the light
//    theme needs no per-field ternary: the math resolves it.
//
//    That second rule is why `#2a8c85` on sand — which the Round-2 spec called the
//    "tested default" — is legal as a metric number (3.46:1 clears the 3:1 large
//    floor) and ILLEGAL as a label (3.46 < 4.5). One number, two verdicts, decided
//    by role. Nobody has to remember that; the table does.
import { BRAND } from "@/lib/brand/tokens";
import { legibleInk } from "@/lib/email/blocks/on-dark";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/social/formats";

// ─────────────────────────────────────────────────────────────────────────────
// THEME
// ─────────────────────────────────────────────────────────────────────────────

export type SocialTheme = "dark" | "light";

/** The four surfaces/fills a theme resolves. Every value is a BRAND token — this
 *  object holds no hex of its own, so a theme cannot invent a color.
 *
 *  Note what is NOT here: a separate "accent" per theme. The accent is ONE token
 *  (BRAND.teal) and `ink()` dims it when the surface demands — see `accentFor`. */
export interface ThemeSurfaces {
  /** The canvas background. */
  canvas: string;
  /** A card/panel sitting on the canvas. */
  panel: string;
  /** The accent as a FILL (a CTA button, a rule, a chart stroke). Never dimmed:
   *  a teal fill with `onAccent` ink reads 9.15:1 on either canvas. */
  accentFill: string;
  /** The ink that sits on `accentFill`. */
  onAccent: string;
}

export const THEMES: Record<SocialTheme, ThemeSurfaces> = {
  dark: {
    canvas: BRAND.deep,
    panel: BRAND.slateHi,
    accentFill: BRAND.teal,
    onAccent: BRAND.onAccent,
  },
  light: {
    canvas: BRAND.sand,
    panel: BRAND.sandPanel,
    accentFill: BRAND.teal,
    onAccent: BRAND.onAccent,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// TYPE — five roles, one ladder.
//
// Ratio 1.5 (perfect fifth) from a 32px floor: 32 · 48 · 72 · 108 · 162. A high
// ratio is correct here and a document ratio (1.2/1.25) is not — a social graphic
// has three levels of hierarchy and is glanced at, not read. Mortensen's own rule:
// "a website with consistently short, punchy titles may be well suited to a scale
// with a higher ratio... this would add impact to the headings."
// (spencermortensen.com/articles/typographic-scale)
//
// The floor is 32px AT THE 1080 REFERENCE WIDTH. A feed image is downscaled to
// roughly the device's logical width (~390-430pt on a phone), so a 1080 canvas
// renders at ~0.36-0.40x: 32px lands around 11-12pt on glass. Below that, captions
// stop being readable — which is exactly what landscape's 18px labels were doing.
//
// [INFERENCE] the 0.36x downscale is derived, not published — no platform states a
// minimum in-image font size (checked Meta's ads-guide, LinkedIn's ads-guide, and
// NN/g: all silent). FALSIFIER: screenshot a real post and measure the rendered
// image width against the device's logical width; if a feed image renders WIDER
// than the logical width, the floor is too high and can come down.
// ─────────────────────────────────────────────────────────────────────────────

/** The canvas width the px below are authored against. Three of four formats ARE
 *  1080 wide; landscape (1200) scales up by 1.11. */
export const REF_WIDTH = 1080;

/** The smallest type that survives a feed downscale, at REF_WIDTH. Asserted by
 *  `system.test.ts` across every role x every format. */
export const MIN_LEGIBLE_PX = 32;

export const TYPE = {
  /** The headline number. One per canvas. */
  display: 162,
  /** The post's headline. */
  headline: 108,
  /** A section title, or a secondary stat's value. */
  title: 72,
  /** Supporting copy, a tip row, CTA text. */
  body: 48,
  /** A stat's label, a kicker, the citation line. The floor. */
  label: 32,
} as const;

export type TypeRole = keyof typeof TYPE;

/** Smallest → largest. Order is load-bearing (`compact()` walks DOWN it). */
const LADDER: TypeRole[] = ["label", "body", "title", "headline", "display"];

/** WEIGHT — the same three-step ladder as email (app/_design/05-color-and-type.md:
 *  "Weight 600 for hero, 500 for section headers", "400 for body, 500 for emphasis").
 *  Shared VALUES, local mapping: a social canvas has no <h2>, it has roles. */
export const WEIGHT = {
  display: 600,
  sectionHeader: 500,
  body: 400,
  emphasis: 500,
} as const;

/** LEADING — tight on display type (a 162px headline at 1.5 leading would eat the
 *  canvas), open on body. Mirrors email's split at the same boundary. */
const LEADING: Record<TypeRole, number> = {
  display: 1.05,
  headline: 1.1,
  title: 1.15,
  body: 1.4,
  label: 1.3,
};

const ROLE_WEIGHT: Record<TypeRole, number> = {
  display: WEIGHT.display,
  headline: WEIGHT.display,
  title: WEIGHT.sectionHeader,
  body: WEIGHT.body,
  label: WEIGHT.emphasis,
};

/**
 * CONTRAST FLOOR PER ROLE — the table that makes an unreadable color unreachable.
 *
 * WCAG AA: 4.5:1 for text, 3:1 for LARGE text (>=24px on screen / 18.67px bold).
 * "Large" is an ON-SCREEN measure; at the ~0.36x feed downscale, 24 on-screen px is
 * roughly 66px on a 1080 canvas. Rather than hang the rule on that derived number,
 * it hangs on the ROLE — which survives even if the downscale estimate is off:
 *
 *   display (162) · headline (108) · title (72)  →  comfortably "large"  →  3:1
 *   body (48) · label (32)                       →  normal text          →  4.5:1
 *
 * WCAG applies to text baked into an image; Android's a11y docs say so explicitly
 * ("when using ImageView to render graphical content... contrast between foreground
 * and background must meet the recommended ratios").
 */
export const CONTRAST_FLOOR: Record<TypeRole, number> = {
  display: 3,
  headline: 3,
  title: 3,
  body: 4.5,
  label: 4.5,
};

export interface TypeStyle {
  /** Scaled to the format's width. Always >= MIN_LEGIBLE_PX. */
  fontSize: number;
  /** Absolute px. Never absent — an unset leading is how email's stats got clipped. */
  lineHeight: number;
  /** Numeric CSS weight (400/500/600). */
  fontWeight: number;
  /** The same weight as a Konva `fontStyle` string (Konva builds a CSS font
   *  shorthand, so "600" is valid there — it is NOT limited to "bold"/"normal"). */
  fontStyle: string;
}

/**
 * The format's type scale. NOT `min(W,H)` — see the header.
 *
 * Capped at 1.0: **never scale type UP into a canvas that is SHORTER.** Pure
 * width-scaling would give landscape (1200w) a 1.11x uplift, which is
 * typographically "correct" — it is displayed wider, so 1.11x holds apparent size
 * constant. It is also a trap, and the numbers say so plainly. Landscape's content
 * box is 462px tall (630 - 2x84 margin), and a headline+body+CTA stack comes to:
 *
 *      at 1.11x → 568px  (OVERFLOWS by 106px)
 *      at 1.00x → 517px  (OVERFLOWS by  55px)
 *      compacted → 414px / 378px  (FITS)
 *
 * So the uplift buys ~10% of apparent size and costs DOUBLE the overflow on the
 * tightest canvas we have. Not a trade worth making. Landscape gets the same px as
 * a square and must still compact — which is a real structural fact about a 630px
 * canvas, not a shortcoming of the ladder. `fits()` below is how a template checks.
 *
 * (In practice every current format therefore scales 1.0. The cap is kept as a
 * function, not deleted, so a future wide-AND-tall format scales correctly and a
 * future short one can never shrink type below the floor again.)
 */
export function widthScale(format: SocialFormat): number {
  return Math.min(1, SOCIAL_FORMATS[format].width / REF_WIDTH);
}

/**
 * THE ONE ACCESSOR. Size, leading, and weight come out together — there is no API
 * here that lets a template pick a font size and forget its line-height.
 */
export function type(role: TypeRole, format: SocialFormat): TypeStyle {
  const fontSize = Math.round(TYPE[role] * widthScale(format));
  return {
    fontSize,
    lineHeight: Math.round(fontSize * LEADING[role]),
    fontWeight: ROLE_WEIGHT[role],
    fontStyle: String(ROLE_WEIGHT[role]),
  };
}

/** Step DOWN the ladder — the honest way to fit a long headline or a short canvas.
 *  A template that needs smaller type asks for the NEXT ROLE, it does not invent a
 *  multiplier. Clamps at `label` (never below the legibility floor). */
export function compact(role: TypeRole, steps = 1): TypeRole {
  const i = LADDER.indexOf(role);
  return LADDER[Math.max(0, i - steps)];
}

// ─────────────────────────────────────────────────────────────────────────────
// FIT — the vertical budget, as a number a template can check.
//
// The old `min(W,H)` existed to stop a stack overrunning the short landscape strip.
// Deleting it without replacing it would just move the bug. This is the replacement:
// the constraint is now EXPLICIT and CHECKABLE, instead of being paid for silently
// in type size on every format at once.
// ─────────────────────────────────────────────────────────────────────────────

/** The margin templates use (W * 0.07) — matches `dims()` in templates.ts. */
export function margin(format: SocialFormat): number {
  return Math.round(SOCIAL_FORMATS[format].width * 0.07);
}

/** The vertical space a stack actually has, after margins. Landscape's is 462px —
 *  the tightest budget we have, by a wide margin (story's is 1651). */
export function contentHeight(format: SocialFormat): number {
  return SOCIAL_FORMATS[format].height - 2 * margin(format);
}

/** The height of a stack of roles, where each entry is a role and its line count.
 *  Gaps use the same `H * 0.03` templates already use. */
export function stackHeight(
  items: Array<{ role: TypeRole; lines?: number }>,
  format: SocialFormat,
): number {
  const gap = Math.round(SOCIAL_FORMATS[format].height * 0.03);
  const h = items.reduce((sum, it) => sum + type(it.role, format).lineHeight * (it.lines ?? 1), 0);
  return h + gap * Math.max(0, items.length - 1);
}

/** Does this stack fit the format's content box? A template asking for a role it
 *  cannot afford should `compact()` or drop an element — NOT shrink the type. */
export function fits(
  items: Array<{ role: TypeRole; lines?: number }>,
  format: SocialFormat,
): boolean {
  return stackHeight(items, format) <= contentHeight(format);
}

// ─────────────────────────────────────────────────────────────────────────────
// INK — color, resolved by role + surface. No ternaries. No hex in templates.
// ─────────────────────────────────────────────────────────────────────────────

/** The ink a theme wants for plain text: sand on dark, midnight on sand. */
function baseInk(theme: SocialTheme): string {
  return theme === "dark" ? BRAND.sand : BRAND.midnight;
}

/** The pair `legibleInk` DEMOTES to when a preferred color misses its floor.
 *  Email falls back to white/#111827 — its own block palette. The canvas must fall
 *  back to BRAND colors, or a demotion silently introduces a sixth palette. This is
 *  the leak `system.test.ts` caught: without it, a label on sand demoted to email's
 *  #111827 grey, which is not a brand color and never was. */
const NEUTRALS = { dark: BRAND.midnight, light: BRAND.sand } as const;

/**
 * TEXT COLOR for a role, on a surface. `on` is whatever the text actually sits on
 * (the canvas, or a panel) — pass it, because a panel and a canvas are different
 * backgrounds and the contrast answer differs.
 *
 * The role's floor is applied by `legibleInk`, so a color that cannot be read at
 * that size is silently replaced with one that can. Unreadable is unreachable.
 */
export function ink(role: TypeRole, theme: SocialTheme, on?: string): string {
  const bg = on ?? THEMES[theme].canvas;
  return legibleInk(baseInk(theme), bg, CONTRAST_FLOOR[role], NEUTRALS);
}

/**
 * ACCENT TEXT for a role, on a surface — the color of a metric NUMBER or a kicker.
 *
 * This is the whole light/dark theme problem, solved once:
 *   • dark canvas  → BRAND.teal clears 8.44:1 → stays teal at every role.
 *   • sand canvas, display/headline/title (floor 3) → BRAND.tealDim is 3.46 → PASSES.
 *   • sand canvas, body/label (floor 4.5)           → tealDim is 3.46 → FAILS, and
 *     legibleInk demotes it to readable ink automatically.
 *
 * So "the accent dims on light" and "small accent text is illegal on light" are not
 * two rules a template author has to know. They are one function.
 */
export function accent(role: TypeRole, theme: SocialTheme, on?: string): string {
  const bg = on ?? THEMES[theme].canvas;
  const preferred = theme === "dark" ? BRAND.teal : BRAND.tealDim;
  return legibleInk(preferred, bg, CONTRAST_FLOOR[role], NEUTRALS);
}

/** A DECORATIVE fill — a rule, a bar, a chart stroke, a CTA background. Not text,
 *  so no contrast floor applies (WCAG's incidental/decorative carve-out). Full teal
 *  always: this is the one place `BRAND.teal` is correct on a sand canvas. */
export function decor(theme: SocialTheme): string {
  return THEMES[theme].accentFill;
}
