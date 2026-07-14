// lib/brand/tokens.test.ts
//
// THE DRIFT TEST. `app/globals.css` and `lib/brand/tokens.ts` hold the same
// palette in two languages because renderers that cannot parse CSS (resvg, Konva,
// email clients) still need the values. Two copies of a fact will always drift —
// unless something fails when they do. This is that something.
//
// It reads the REAL globals.css off disk (not a fixture) and asserts every token
// matches. Add a color to one side only and this goes red with the name of the
// token you forgot.
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BRAND, BRAND_HEXES, CSS_VAR_BY_TOKEN, type BrandToken } from "@/lib/brand/tokens";
import { contrastRatio } from "@/lib/charts/palette";

const CSS_PATH = join(process.cwd(), "app", "globals.css");

/** Parse `--name: #hex;` declarations out of globals.css. Only literal hex values —
 *  a `var()` alias (e.g. --brand-primary) is an alias, not a token, and is skipped. */
function cssHexVars(): Map<string, string> {
  const css = readFileSync(CSS_PATH, "utf8");
  const out = new Map<string, string>();
  for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out.set(m[1], m[2].toLowerCase());
  }
  return out;
}

describe("BRAND mirrors app/globals.css", () => {
  const vars = cssHexVars();

  it("finds the :root palette in globals.css (guards the parser itself)", () => {
    // If globals.css is ever restructured so the regex stops matching, every
    // per-token test below would vacuously pass. This is the canary.
    expect(vars.size).toBeGreaterThan(10);
    expect(vars.get("--gulf-teal")).toBe("#3dc9c0");
  });

  const tokens = Object.keys(CSS_VAR_BY_TOKEN) as BrandToken[];

  it.each(tokens)("BRAND.%s === its CSS custom property", (token) => {
    const cssVar = CSS_VAR_BY_TOKEN[token];
    const cssValue = vars.get(cssVar);
    expect(
      cssValue,
      `${cssVar} is missing from app/globals.css — add it there FIRST, then here.`,
    ).toBeDefined();
    // Case-insensitive: globals.css writes #3DC9C0, tokens.ts writes #3dc9c0.
    // Same token, and lowercase in TS keeps `===` and grep single-pattern.
    expect(cssValue).toBe(BRAND[token].toLowerCase());
  });

  it("every BRAND value is lowercase (so one grep finds every use)", () => {
    for (const [k, v] of Object.entries(BRAND)) {
      expect(v, `BRAND.${k} must be lowercase hex`).toBe(v.toLowerCase());
    }
  });

  it("BRAND_HEXES is the allowlist a no-raw-hex check tests membership against", () => {
    expect(BRAND_HEXES.has(BRAND.teal)).toBe(true);
    // The teal that is NOT our teal. It was the social canvas default in four
    // files until 07/14/2026. If it ever comes back, it is not a brand color.
    expect(BRAND_HEXES.has("#0ea5b7")).toBe(false);
  });
});

// ── The contrast facts the design system is built on ─────────────────────────
//
// These are not style opinions — they are the load-bearing numbers that decide
// which color a role may use on which surface (lib/social/design/system.ts).
// Cross-checked against WebAIM's contrast checker (webaim.org, 07/14/2026): this
// repo's contrastRatio reproduces its published 1.74 and 3.46 exactly.
//
// If a brand color is ever re-tuned, these go red and tell you WHICH rule broke,
// instead of shipping unreadable text into a social feed where nobody can fix it.
describe("brand contrast facts (WCAG AA: 4.5 normal text · 3 large text)", () => {
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 1);

  it("full teal is DECORATIVE-ONLY on sand — it fails even the large-text floor", () => {
    near(contrastRatio(BRAND.teal, BRAND.sand), 1.74);
    expect(contrastRatio(BRAND.teal, BRAND.sand)).toBeLessThan(3);
  });

  it("dimmed teal on sand clears LARGE text and fails NORMAL text", () => {
    const r = contrastRatio(BRAND.tealDim, BRAND.sand);
    near(r, 3.46);
    expect(r).toBeGreaterThanOrEqual(3); // a big metric number: legal
    expect(r).toBeLessThan(4.5); // a small label: illegal
  });

  it("full teal is safe for ANY text size on the dark canvas", () => {
    expect(contrastRatio(BRAND.teal, BRAND.deep)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(BRAND.teal, BRAND.slateHi)).toBeGreaterThanOrEqual(4.5);
  });

  it("a teal CTA reads identically in BOTH themes (why the CTA never dims)", () => {
    // The spec's "CTA fill always stays full accent regardless of theme" — verified.
    // The fill is teal and the ink on it is onAccent, on either canvas.
    expect(contrastRatio(BRAND.onAccent, BRAND.teal)).toBeGreaterThanOrEqual(4.5);
  });

  it("the light theme's ink is the dark surfaces, and it is comfortable", () => {
    expect(contrastRatio(BRAND.midnight, BRAND.sand)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(BRAND.midnight, BRAND.sandPanel)).toBeGreaterThanOrEqual(4.5);
  });

  it("sandFaint is LARGE-TEXT-ONLY on both canvases — it is never a caption", () => {
    // Written expecting --text-tertiary to be a safe muted ink on navy. It is not:
    // 4.23:1 on `deep` — it misses normal text on its OWN canvas, and lands at
    // 3.48:1 on sand. So it is a large-text/decorative ink EVERYWHERE, and any
    // template reaching for it as a caption color is reaching for a bug. The
    // role→floor table in lib/social/design/system.ts is what prevents that.
    expect(contrastRatio(BRAND.sandFaint, BRAND.deep)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(BRAND.sandFaint, BRAND.deep)).toBeLessThan(4.5);
    expect(contrastRatio(BRAND.sandFaint, BRAND.sand)).toBeLessThan(4.5);
  });

  it("sandMuted IS the safe muted ink on dark (what sandFaint is not)", () => {
    expect(contrastRatio(BRAND.sandMuted, BRAND.deep)).toBeGreaterThanOrEqual(4.5);
  });
});
