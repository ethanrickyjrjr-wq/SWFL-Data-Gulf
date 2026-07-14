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
  contentHeight,
  decor,
  fits,
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

  it("landscape is NOT shrunk — it gets the same type as a square", () => {
    // THE min(W,H) BUG, nailed shut. Landscape (1200x630) is the only format where
    // height < width, so it alone sized off 630 and came out ~42% smaller than every
    // other format — a label at 18px, roughly 7pt once a phone downscales the feed
    // image. Every one of these surfaces displays fit-to-WIDTH; height never touches
    // how big the text looks. Landscape is not the small format. It never was.
    for (const role of ROLES) {
      expect(typeOf(role, "landscape").fontSize).toBe(typeOf(role, "square").fontSize);
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

  it("type is NEVER scaled UP into a shorter canvas", () => {
    // Pure width-scaling would hand landscape a 1.11x uplift — typographically
    // "correct" (it displays wider) and a trap: it OVERFLOWS landscape's 462px
    // content box by 106px instead of 55px. ~10% of apparent size is not worth
    // double the overflow on the tightest canvas we have.
    for (const f of FORMATS) {
      expect(widthScale(f), `${f} must not scale type up`).toBeLessThanOrEqual(1);
    }
  });
});

// ── The vertical budget — the thing min(W,H) was silently paying for ─────────
//
// Deleting min(W,H) without replacing it would just move the bug. These tests make
// the landscape constraint EXPLICIT, so Round 2 cannot migrate the templates and be
// surprised by a stack running off a 630px canvas.
describe("fit — landscape is short, and the system says so out loud", () => {
  it("landscape has by far the tightest vertical budget", () => {
    expect(contentHeight("landscape")).toBe(462);
    for (const f of FORMATS) {
      if (f === "landscape") continue;
      expect(contentHeight(f)).toBeGreaterThan(contentHeight("landscape"));
    }
  });

  it("a full headline+body+CTA stack does NOT fit landscape — and DOES fit square", () => {
    // THE trap this suite exists to catch. It is not a bug in the ladder; a 630px
    // canvas genuinely cannot carry a 2-line headline at 108px. The template must
    // compact or drop an element — it must NOT shrink type below the floor, which
    // is exactly what min(W,H) was doing to buy this room.
    const full = [
      { role: "headline" as const, lines: 2 },
      { role: "body" as const, lines: 2 },
      { role: "body" as const, lines: 1 }, // the CTA
    ];
    expect(fits(full, "landscape")).toBe(false);
    expect(fits(full, "square")).toBe(true);
    expect(fits(full, "portrait")).toBe(true);
  });

  it("compact() is what buys landscape the room — and it is enough", () => {
    const compacted = [
      { role: compact("headline"), lines: 2 }, // title
      { role: "body" as const, lines: 1 },
      { role: "body" as const, lines: 1 },
    ];
    expect(fits(compacted, "landscape")).toBe(true);
  });

  it("even the biggest role clears the floor on the tightest canvas", () => {
    // Sanity: compacting is a LAYOUT answer, never a legibility one.
    expect(typeOf(compact("headline"), "landscape").fontSize).toBeGreaterThanOrEqual(
      MIN_LEGIBLE_PX,
    );
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
