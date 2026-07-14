// lib/brand/tokens.ts
//
// THE BRAND PALETTE, IMPORTABLE. This is the TypeScript mirror of the `:root`
// block in `app/globals.css` — the same hex values, the same names, locked
// together by `tokens.test.ts` (which parses the CSS and fails if either side
// drifts).
//
// ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
//
// `app/globals.css` has been the brand root since the beginning, and it says so
// in its own comment: "Every interactive element must use these tokens, NOT the
// raw hex. Changing --gulf-teal cascades here automatically — zero manual
// find-and-replace ever again."
//
// That promise held for the DOM and broke everywhere else, because a canvas or an
// SVG cannot import a CSS file. resvg has no cascade. Konva has no cascade. An
// email client has no `var()`. So every image-rendering path in the repo re-typed
// the palette by hand, and `lib/charts/social-card.ts` documented the workaround
// in a comment rather than fixing it: "Verbatim --gulf-teal (app/globals.css:14).
// SVG can't resolve CSS vars."
//
// The cost, measured 07/14/2026 before this file existed:
//
//   • FIVE separate paths render a social image, each with a private palette:
//     lib/social/design/templates.ts · lib/social/render-social-image.ts ·
//     lib/charts/social-card.ts · lib/social/chart-svg.ts · the Konva composer.
//   • The house navy exists as BOTH `#0f1d24` and `#0a1419` depending on the path.
//   • The social canvas accent was `#0ea5b7` — A TEAL THAT IS NOT OUR TEAL. Nobody
//     chose it; someone typed a teal from memory and four files copied it. Every
//     unbranded social post we have ever rendered shipped in the wrong brand color.
//
// None of that was laziness. There was no file to import. This is that file.
//
// ── THE RULE ─────────────────────────────────────────────────────────────────
//
// A renderer that cannot use `var(--gulf-teal)` imports `BRAND.teal` from here.
// It NEVER re-types the hex. `app/globals.css` stays the human-facing root (the
// designer edits it); this file is its machine-readable face; the drift test makes
// them one thing rather than two things that agree today.
//
// Adding a color? Add it to globals.css FIRST, then here, then watch the drift
// test go green. If you only add it here, the test tells you the CSS is missing it.

/**
 * The Gulf palette. Names and values mirror `:root` in `app/globals.css` 1:1 —
 * `--gulf-teal` is `BRAND.teal`, `--text-primary` is `BRAND.textPrimary`.
 *
 * Lowercase hex throughout: `contrastRatio`/`parseHex` (lib/charts/palette) are
 * case-insensitive, but a single casing means a value can be compared with `===`
 * and grepped with one pattern. The CSS says `#3DC9C0`; the drift test compares
 * case-insensitively so both spellings are the same token.
 */
export const BRAND = {
  // ── Surfaces ────────────────────────────────────────────────────────────────
  /** `--gulf-midnight` — the darkest surface; the site background. */
  midnight: "#0a1419",
  /** `--gulf-deep` — the standard dark canvas/card surface. */
  deep: "#0f1d24",
  /** `--gulf-slate` — a raised dark surface. */
  slate: "#152832",
  /** `--gulf-slate-hi` — the dark theme's PANEL fill (a card on a dark canvas). */
  slateHi: "#1c3340",
  /** `--gulf-haze` — the lightest dark surface; hairlines and rules on dark. */
  haze: "#22414f",

  // ── Accents ─────────────────────────────────────────────────────────────────
  /** `--gulf-teal` — THE brand accent. 8.44:1 on `deep`. Only 1.74:1 on `sand`:
   *  on a light surface this is a DECORATIVE fill (CTA background, rules, chart
   *  strokes), never a word. See `lib/social/design/system.ts` for the enforcement. */
  teal: "#3dc9c0",
  /** `--gulf-teal-dim` — the accent on a light surface. 3.46:1 on `sand`: clears
   *  WCAG AA large-text (3:1), FAILS normal text (4.5:1). Legal for a big metric
   *  number on sand; illegal for a label. */
  tealDim: "#2a8c85",
  /** `--mangrove` — positive / growth. */
  mangrove: "#5bc97a",
  /** `--mangrove-dim` — positive on a light surface. */
  mangroveDim: "#3d8a52",
  /** `--sunset-coral` — negative / decline. */
  coral: "#e08158",
  /** `--coral-dim` — negative on a light surface. */
  coralDim: "#a45a3d",
  /** `--neutral-gold` — neutral / flat. */
  gold: "#d4b370",

  // ── Text / light surfaces ───────────────────────────────────────────────────
  /** `--text-primary` — the sand. Text on dark AND the light theme's canvas.
   *  (One token, two jobs: it is the ink on `deep` and the surface under `midnight`.) */
  sand: "#f0ede6",
  /** `--text-secondary` — muted ink on a dark surface. 8.29:1 on `deep`. */
  sandMuted: "#b8b4a8",
  /** `--text-tertiary` — faint ink on a dark surface. NOTE: only 3.48:1 on `sand` —
   *  this is a DARK-THEME ink and does not survive on the light theme. */
  sandFaint: "#807e76",
  /** `--text-on-accent` — the ink that sits on a teal fill. 9.15:1 on `teal`, in
   *  both themes (a teal CTA reads the same on either canvas). */
  onAccent: "#0a1419",

  // ── Light theme ─────────────────────────────────────────────────────────────
  /** `--gulf-sand-panel` — the light theme's PANEL fill (a card on a sand canvas).
   *  The sibling of `slateHi`. This is the one genuinely new token the light theme
   *  needed; every other light-theme value already existed in the palette. */
  sandPanel: "#e7e2d7",
} as const;

export type BrandToken = keyof typeof BRAND;

/**
 * The mapping this file is tested against: `BRAND` key → the CSS custom property
 * in `app/globals.css` it mirrors. `tokens.test.ts` parses the CSS and asserts
 * every pair matches, so the two roots cannot drift apart.
 *
 * Exported (not private) because the test is the point of the file — it is the
 * mechanism that makes "one root" true rather than aspirational.
 */
export const CSS_VAR_BY_TOKEN: Record<BrandToken, string> = {
  midnight: "--gulf-midnight",
  deep: "--gulf-deep",
  slate: "--gulf-slate",
  slateHi: "--gulf-slate-hi",
  haze: "--gulf-haze",
  teal: "--gulf-teal",
  tealDim: "--gulf-teal-dim",
  mangrove: "--mangrove",
  mangroveDim: "--mangrove-dim",
  coral: "--sunset-coral",
  coralDim: "--coral-dim",
  gold: "--neutral-gold",
  sand: "--text-primary",
  sandMuted: "--text-secondary",
  sandFaint: "--text-tertiary",
  onAccent: "--text-on-accent",
  sandPanel: "--gulf-sand-panel",
};

/** Every hex the brand legitimately contains — the allowlist a "no raw hex" lint
 *  or test checks membership against. Lowercase. */
export const BRAND_HEXES: ReadonlySet<string> = new Set(Object.values(BRAND));
