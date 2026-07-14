// lib/brand/weight.ts
//
// THE SHARED WEIGHT LADDER + COMPOSITE TYPE SHAPE. Email's `lib/email/blocks/scale.ts`
// and social's `lib/social/design/system.ts` each derived the same three weights from
// the same design doc (app/_design/05-color-and-type.md — "Weight 600 for hero, 500
// for section headers" · "400 for body, 500 for emphasis") and arrived, independently,
// at the same composite invariant: a type step returns fontSize AND lineHeight AND
// fontWeight TOGETHER, so there is no accessor that lets a caller pick a size and
// forget its leading — the exact omission that clipped every stat in email (a text
// node with no lineHeight silently inheriting an injected 24px box).
//
// docs/superpowers/handoffs/2026-07-14-social-design-root-handoff.md: "Extract WEIGHT
// + the composite shape. Do NOT unify the px or the role names — a canvas has no h2,
// an email has no display-stat." That's why this file holds only the numbers the doc
// actually states and the shape both systems already converged on — not the scale.
//
// ── WHAT STAYS LOCAL (do NOT extract here) ───────────────────────────────────
//
// The px scale, the role names, the ladder order, and which unit `lineHeight`
// carries (social's is absolute px; email's is a unitless ratio — same TYPE,
// different UNIT, because a canvas has no cascade and an email's CSS does).

/** The three weights `05-color-and-type.md` states, shared by name AND value.
 *  Each system maps its OWN roles onto these (see `weightFor` in scale.ts /
 *  `ROLE_WEIGHT` in system.ts) — a role name is local, the number it resolves to
 *  is not. */
export const WEIGHT = {
  display: 600, // "Weight 600 for hero"
  sectionHeader: 500, // "500 for section headers"
  body: 400, // "Weight 400 for body"
  emphasis: 500, // "500 for emphasis"
} as const;

/**
 * THE COMPOSITE SHAPE. fontSize, lineHeight, and fontWeight come out TOGETHER —
 * there is no accessor built on this shape that can return a size without its
 * leading. Independently, this is the W3C Design Tokens composite `typography`
 * token shape (tr.designtokens.org/format); arriving at it twice without knowing
 * the spec is validation, not a reason to adopt a token toolchain (see the
 * handoff's research section — Style Dictionary/DTCG were evaluated and rejected).
 */
export interface TypeStep {
  fontSize: number;
  lineHeight: number;
  fontWeight: number;
}
