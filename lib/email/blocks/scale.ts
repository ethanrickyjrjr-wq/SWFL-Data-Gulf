// lib/email/blocks/scale.ts
//
// THE DESIGN SYSTEM, AS CODE. This file is the executable form of
// `app/_design/05-color-and-type.md`. It invents nothing: every number below is
// lifted from that document, and the doc line it came from is cited beside it.
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// The rules were researched for days, written down, and committed — and then read
// by ZERO CODE, because they lived in markdown and markdown cannot be imported. So
// every session that ever built an email block read the doc (or didn't), hand-typed
// numbers, and moved on. Nothing could catch a wrong value; there was nothing to
// check against. Measured 07/14/2026, before this file existed:
//
//   • 17 distinct font sizes in use, where the scale defines 7. No block used
//     28/36/44/64 — four of our own steps went unused entirely.
//   • 30 fontWeight declarations. ZERO compliant (all 600/700/800; the doc says
//     400/500/600).
//   • `tabular-nums` — required by the doc on every numeric cell — used ZERO times.
//   • ~30 text nodes set no lineHeight at all, and therefore silently inherited
//     @react-email's injected ABSOLUTE `lineHeight: 24px`. The 32px stat value
//     rendered in a 24px box (ratio 0.75 — that is the clipping); the 9px strip
//     label rendered at ratio 2.67. THIS is the mechanical cause of "uneven".
//     Not the grid. An invisible default nobody set.
//
// ── THE ONE RULE THAT KILLS THAT BUG BY CONSTRUCTION ─────────────────────────
//
// `text(role)` returns fontSize AND lineHeight AND fontWeight TOGETHER. A size
// cannot be chosen without its leading. There is no API here that lets you pick a
// font size and forget the line-height — which is exactly how ~30 nodes ended up
// pinned to an absolute 24px box they never asked for.
//
// ── WHAT THIS FILE DOES *NOT* GOVERN ─────────────────────────────────────────
//
// Colour, block order, which blocks a template uses, and what a template looks
// like. Operator ruling 07/14/2026: KEEP EVERY DESIGN AS A CHOICE — we are
// unifying RHYTHM, not appearance. Templates stay as different as they are today;
// they just stop each inventing their own type scale.
import type { CSSProperties } from "react";
import { WEIGHT as SHARED_WEIGHT, type TypeStep } from "@/lib/brand/weight";

// ─────────────────────────────────────────────────────────────────────────────
// TYPE — the scale. 05-color-and-type.md §"Scale (rem, 16px base)", ×16 to px
// because email cannot rely on rem.
// ─────────────────────────────────────────────────────────────────────────────
export const TYPE = {
  hero: 64, // 4rem     — "Hero headline"
  h1: 44, // 2.75rem  — "Page H1"
  metric: 36, // 2.25rem  — "Metric value (the big number)", tabular nums
  h2: 28, // 1.75rem  — "Section H2"
  body: 16, // 1rem     — "Body"
  caption: 14, // 0.875rem — "Body small / caption" AND "Card / metric label"
  mono: 12, // 0.75rem  — "Freshness token + source URL", monospace
} as const;

export type TypeRole = keyof typeof TYPE;

/** The ladder, smallest → largest. `compact()` walks DOWN it. Order is load-bearing. */
const LADDER: TypeRole[] = ["mono", "caption", "body", "h2", "metric", "h1", "hero"];

// ─────────────────────────────────────────────────────────────────────────────
// WEIGHT — §"Stack": "Weight 600 for hero, 500 for section headers" · "Weight 400
// for body, 500 for emphasis" · mono "Weight 500". The four values shared with
// social live in `lib/brand/weight.ts` (docs/superpowers/handoffs/2026-07-14-
// social-design-root-handoff.md — "extract WEIGHT, not the px or the role
// names"); `mono` has no social equivalent (a canvas has no monospace role), so
// it stays local.
//
// NOTE: the doc does not state a weight for the card/metric LABEL. It is not body
// prose — it is an emphasised micro-heading — so it takes the doc's `emphasis`
// weight (500). That is a real weight from the document, not a new one.
// ─────────────────────────────────────────────────────────────────────────────
export const WEIGHT = {
  ...SHARED_WEIGHT,
  mono: 500,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// LEADING — §"Line height". Display is given as a RANGE (1.05–1.15); 1.1 is its
// midpoint, the one value in the range. Applies at 28px+ per the doc.
// ─────────────────────────────────────────────────────────────────────────────
export const LEADING = {
  display: 1.1, // "Display (28px+): 1.05-1.15"
  body: 1.55, // "Body: 1.55"
  caption: 1.4, // "Caption: 1.4"
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TRACK — §"Stack": "Tighten tracking by -1% to -2% at display sizes (28px+)"
// (-1.5% is the midpoint) · §"Scale": card/metric label "+0.06em tracking".
// ─────────────────────────────────────────────────────────────────────────────
export const TRACK = {
  display: "-0.015em",
  label: "0.06em",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SPACE — §"Spacing": "8px base grid. Spacing tokens: 4 / 8 / 12 / 16 / 24 / 32 /
// 48 / 64 / 96." Typed as a UNION, so an off-grid literal is a COMPILE ERROR, not
// a code review someone has to notice. `0` is included: absence of space is legal.
// ─────────────────────────────────────────────────────────────────────────────
export type Space = 0 | 4 | 8 | 12 | 16 | 24 | 32 | 48 | 64 | 96;

/** Card padding — §"Spacing": "Card padding: 24". The section gutter, every block. */
export const CARD_PAD: Space = 24;
/** Metric row vertical padding — §"Spacing": "Metric row vertical padding: 12". */
export const METRIC_ROW_PAD: Space = 12;
/** Table row padding — §"Spacing": "Audit table row padding: 8 (denser; people scan)". */
export const TABLE_ROW_PAD: Space = 8;

/** `pad(12, 24)` → "12px 24px". Both args must be grid tokens or it will not compile. */
export function pad(y: Space, x: Space = y): string {
  return `${y}px ${x}px`;
}
/** `space(0, 0, 8)` → "0px 0px 8px" — for margins. Grid-typed, same guarantee. */
export function space(
  ...v: [Space] | [Space, Space] | [Space, Space, Space] | [Space, Space, Space, Space]
): string {
  return v.map((n) => `${n}px`).join(" ");
}

// ─────────────────────────────────────────────────────────────────────────────
// NUMERIC — §"Numeric / tabular": "Use a typeface with tabular figures so columns
// of numbers align… Apply it to every table cell containing a number."
// Used ZERO times in the email renderer before 07/14/2026. Every figure gets this.
// ─────────────────────────────────────────────────────────────────────────────
export const NUMERIC: CSSProperties = { fontVariantNumeric: "tabular-nums" };

// ─────────────────────────────────────────────────────────────────────────────
// text() — THE ONLY WAY TO SIZE TEXT IN AN EMAIL BLOCK.
//
// Returns size + leading + weight (+ tracking) as one object. You cannot take the
// size without the leading, which is the whole point: the injected-24px bug is
// unreachable from this API.
// ─────────────────────────────────────────────────────────────────────────────
const isDisplay = (role: TypeRole): boolean => TYPE[role] >= TYPE.h2; // doc: "28px+"

function leadingFor(role: TypeRole): number {
  if (isDisplay(role)) return LEADING.display;
  if (role === "body") return LEADING.body;
  return LEADING.caption; // caption + mono
}

function weightFor(role: TypeRole): number {
  switch (role) {
    case "hero":
    case "h1":
    case "metric":
      return WEIGHT.display; // "Weight 600 for hero"
    case "h2":
      return WEIGHT.sectionHeader; // "500 for section headers"
    case "body":
      return WEIGHT.body;
    case "caption":
      return WEIGHT.body;
    case "mono":
      return WEIGHT.mono;
  }
}

export interface TextOpts {
  /** Override the derived weight with another SCALE weight (never a raw number). */
  weight?: (typeof WEIGHT)[keyof typeof WEIGHT];
  /** A figure — adds tabular-nums (doc: every numeric cell). */
  numeric?: boolean;
}

/** The type step for a role, complete and self-consistent. Spread it into `style`. */
export function text(role: TypeRole, opts: TextOpts = {}): CSSProperties {
  const step: TypeStep = {
    fontSize: TYPE[role],
    lineHeight: leadingFor(role), // unitless ratio, e.g. 1.55 — email's own unit
    fontWeight: opts.weight ?? weightFor(role),
  };
  const style: CSSProperties = {
    fontSize: `${step.fontSize}px`,
    lineHeight: String(step.lineHeight),
    fontWeight: step.fontWeight,
  };
  if (isDisplay(role)) style.letterSpacing = TRACK.display;
  if (opts.numeric) Object.assign(style, NUMERIC);
  return style;
}

/** A card/metric label — §"Scale": 0.875rem, uppercase, +0.06em. One call, all three. */
export function label(): CSSProperties {
  return {
    ...text("caption", { weight: WEIGHT.emphasis }),
    textTransform: "uppercase",
    letterSpacing: TRACK.label,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DENSITY — operator ruling, 07/14/2026.
//
// The compact "spec strip" (the hairline beds/baths/sqft row under a listing price)
// had NO step in the design doc, and was therefore invented: 17/20/13/9px, none of
// them on any scale. The ruling: **a strip is a DENSITY variant, not a second type
// scale — it shifts one step DOWN the existing ladder.** No new numbers, ever.
//
//   role      grid (default)   strip (compact)
//   primary   metric  36   →   h2       28
//   default   h2      28   →   body     16
//   muted     body    16   →   caption  14
//   label     caption 14   →   caption  14   (labels do not compact)
// ─────────────────────────────────────────────────────────────────────────────
export function compact(role: TypeRole): TypeRole {
  const i = LADDER.indexOf(role);
  return i <= 0 ? role : LADDER[i - 1];
}

/**
 * The height of `n` line boxes at a role — a DERIVED TYPE METRIC, not a spacing token.
 *
 * Used to reserve vertical space so two side-by-side blocks cannot stagger when one
 * kicker wraps to a second line. This was a hand-typed `minHeight: "34px"` — a number
 * that silently encoded "two lines of an 11px kicker" and would have gone wrong the
 * instant the kicker's size changed (it just did). Derived from the scale, it tracks
 * the type automatically and can never go stale.
 */
export function lines(role: TypeRole, n: number): string {
  const leading = isDisplay(role)
    ? LEADING.display
    : role === "body"
      ? LEADING.body
      : LEADING.caption;
  return `${Math.round(TYPE[role] * leading * n)}px`;
}

/**
 * THE IMPORTANCE DIAL. Operator, 07/13/2026: *"we need to make numbers different
 * sizes… in accordance with importance."*
 *
 * Before this, `emphasis` was live but WRONG: in the grid variant `primary` rendered
 * at 30px while a plain cell rendered at 32px — the important number was SMALLER —
 * and the stacked path dropped emphasis entirely. Here it is monotonic by
 * construction: primary > default > muted, at every density, always.
 */
export function statRole(
  emphasis: "primary" | "muted" | undefined,
  density: "grid" | "strip",
): TypeRole {
  const base: TypeRole = emphasis === "primary" ? "metric" : emphasis === "muted" ? "body" : "h2";
  return density === "strip" ? compact(base) : base;
}
