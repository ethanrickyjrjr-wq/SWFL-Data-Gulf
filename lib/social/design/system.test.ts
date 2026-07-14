// lib/social/design/system.test.ts
//
// THE FENCE. lib/social/design/system.ts claims two things are impossible:
// (1) type below the legibility floor, and (2) text a human cannot read on the
// surface it sits on. This test tries to make both happen, across every role x
// every format x every theme x every surface, and fails if it succeeds.
//
// It computes contrast — it does not assert remembered numbers. Re-tune a brand
// color and this tells you which role broke, before a post ships into a feed where
// nobody can fix it.
import { describe, expect, it } from "bun:test";
import { contrastRatio } from "@/lib/charts/palette";
import { BRAND, BRAND_HEXES } from "@/lib/brand/tokens";
import { SOCIAL_FORMATS, type SocialFormat } from "@/lib/social/formats";
import {
  CONTRAST_FLOOR,
  MIN_LEGIBLE_PX,
  REF_WIDTH,
  THEMES,
  TYPE,
  accent,
  compact,
  decor,
  ink,
  type SocialTheme,
  type TypeRole,
  type as typeOf,
  widthScale,
} from "@/lib/social/design/system";

const FORMATS = Object.keys(SOCIAL_FORMATS) as SocialFormat[];
const THEME_NAMES = Object.keys(THEMES) as SocialTheme[];
const ROLES = Object.keys(TYPE) as TypeRole[];

/** Every background text can legitimately land on, per theme. */
const surfacesOf = (t: SocialTheme) => [THEMES[t].canvas, THEMES[t].panel];

describe("type — one ladder, every format", () => {
  it("size, leading and weight always come out TOGETHER", () => {
    // The bug this prevents: email had ~30 text nodes that set a size and no
    // lineHeight, silently inheriting an absolute 24px box. There is no accessor
    // here that can return a size without its leading.
    for (const role of ROLES) {
      for (const f of FORMATS) {
        const s = typeOf(role, f);
        expect(s.fontSize).toBeGreaterThan(0);
        expect(s.lineHeight).toBeGreaterThan(0);
        expect(s.fontWeight).toBeGreaterThan(0);
        expect(s.fontStyle).toBe(String(s.fontWeight));
      }
    }
  });

  it("NO role, in ANY format, falls below the legibility floor", () => {
    // The min(W,H) bug, permanently. Under the old base, landscape's label role
    // came out at 18px — about 7pt once a phone downscales the feed image.
    for (const role of ROLES) {
      for (const f of FORMATS) {
        const { fontSize } = typeOf(role, f);
        expect(
          fontSize,
          `${role} @ ${f} is ${fontSize}px — below the ${MIN_LEGIBLE_PX}px floor`,
        ).toBeGreaterThanOrEqual(MIN_LEGIBLE_PX);
      }
    }
  });

  it("landscape is scaled UP, not down (it is the wide format, not the small one)", () => {
    // The whole point. Landscape is 1200 wide — displayed WIDER than a square, so
    // its type must be BIGGER, never 42% smaller.
    expect(widthScale("landscape")).toBeGreaterThan(1);
    expect(widthScale("square")).toBe(1);
    for (const role of ROLES) {
      expect(typeOf(role, "landscape").fontSize).toBeGreaterThan(typeOf(role, "square").fontSize);
    }
  });

  it("the three 1080-wide formats render type IDENTICALLY", () => {
    for (const role of ROLES) {
      const sq = typeOf(role, "square").fontSize;
      expect(typeOf(role, "portrait").fontSize).toBe(sq);
      expect(typeOf(role, "story").fontSize).toBe(sq);
    }
  });

  it("the ladder is strictly ordered and every step is distinguishable", () => {
    // The four-way 30/32/35/37 mush in the old templates was not a ladder. Adjacent
    // roles must differ by enough that a reader can SEE the hierarchy — the 1.5
    // ratio gives >= 1.4x at every step.
    const asc = [...ROLES].sort((a, b) => TYPE[a] - TYPE[b]);
    for (let i = 1; i < asc.length; i++) {
      expect(TYPE[asc[i]] / TYPE[asc[i - 1]]).toBeGreaterThanOrEqual(1.4);
    }
  });

  it("the reference width is a real format's width", () => {
    expect(SOCIAL_FORMATS.square.width).toBe(REF_WIDTH);
  });

  it("compact() steps DOWN the ladder and clamps at the floor", () => {
    expect(compact("display")).toBe("headline");
    expect(compact("display", 2)).toBe("title");
    expect(compact("label")).toBe("label"); // never below the floor
    expect(TYPE[compact("headline")]).toBeLessThan(TYPE.headline);
  });
});

describe("ink — unreadable is unreachable", () => {
  it("EVERY role, theme, and surface clears that role's WCAG floor", () => {
    for (const theme of THEME_NAMES) {
      for (const on of surfacesOf(theme)) {
        for (const role of ROLES) {
          const floor = CONTRAST_FLOOR[role];
          const r = contrastRatio(ink(role, theme, on), on);
          expect(
            r,
            `ink(${role}, ${theme}) on ${on} = ${r.toFixed(2)}, floor ${floor}`,
          ).toBeGreaterThanOrEqual(floor);
        }
      }
    }
  });

  it("EVERY accent role, theme, and surface clears that role's WCAG floor", () => {
    for (const theme of THEME_NAMES) {
      for (const on of surfacesOf(theme)) {
        for (const role of ROLES) {
          const floor = CONTRAST_FLOOR[role];
          const r = contrastRatio(accent(role, theme, on), on);
          expect(
            r,
            `accent(${role}, ${theme}) on ${on} = ${r.toFixed(2)}, floor ${floor}`,
          ).toBeGreaterThanOrEqual(floor);
        }
      }
    }
  });

  it("the accent stays TEAL at every role on dark", () => {
    for (const role of ROLES) {
      expect(accent(role, "dark")).toBe(BRAND.teal);
    }
  });

  it("on sand, the accent is legal for a BIG NUMBER and demoted for a LABEL", () => {
    // The exact thing the Round-2 spec got half-right. #2a8c85 on #f0ede6 is
    // 3.46:1 — it clears the 3:1 large-text floor and misses the 4.5:1 normal-text
    // floor. So it is the metric number's color and it is NOT a label's color, and
    // no template author has to know that.
    expect(accent("display", "light")).toBe(BRAND.tealDim);
    expect(accent("headline", "light")).toBe(BRAND.tealDim);
    expect(accent("title", "light")).toBe(BRAND.tealDim);

    expect(accent("body", "light")).not.toBe(BRAND.tealDim);
    expect(accent("label", "light")).not.toBe(BRAND.tealDim);
  });

  it("full teal NEVER reaches text on a sand canvas (1.74:1 — decorative only)", () => {
    for (const role of ROLES) {
      for (const on of surfacesOf("light")) {
        expect(ink(role, "light", on)).not.toBe(BRAND.teal);
        expect(accent(role, "light", on)).not.toBe(BRAND.teal);
      }
    }
  });

  it("decor() IS full teal on both themes — a fill has no contrast floor", () => {
    // A CTA button, a rule, a chart stroke. This is the one place BRAND.teal is
    // right on sand, and the CTA's ink on it reads 9.15:1 either way.
    expect(decor("dark")).toBe(BRAND.teal);
    expect(decor("light")).toBe(BRAND.teal);
    for (const theme of THEME_NAMES) {
      expect(contrastRatio(THEMES[theme].onAccent, decor(theme))).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the system holds no color of its own", () => {
  it("every value a theme resolves is a BRAND token", () => {
    // If a theme could hold its own hex, this file would be the sixth place the
    // palette lives. It cannot.
    for (const theme of THEME_NAMES) {
      for (const [slot, v] of Object.entries(THEMES[theme])) {
        expect(BRAND_HEXES.has(v), `THEMES.${theme}.${slot} = ${v} is not a brand token`).toBe(
          true,
        );
      }
    }
  });

  it("every color ink()/accent() can emit is a BRAND token", () => {
    for (const theme of THEME_NAMES) {
      for (const on of surfacesOf(theme)) {
        for (const role of ROLES) {
          for (const c of [ink(role, theme, on), accent(role, theme, on)]) {
            expect(BRAND_HEXES.has(c.toLowerCase()), `${c} is not a brand token`).toBe(true);
          }
        }
      }
    }
  });
});
