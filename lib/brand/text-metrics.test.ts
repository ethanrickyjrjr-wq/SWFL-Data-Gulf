// lib/brand/text-metrics.test.ts
//
// TDD per RULE 3.5 — every test is NAMED AFTER THE FAILURE MODE it targets, and the
// first one reproduces a defect that is LIVE ON MAIN before this file existed.
//
// The claim under test: fitting text by CHARACTER COUNT is font-blind AND content-blind,
// so it cannot keep a label inside its gutter. Measured 08/06/2026 off the bundled TTFs:
// the same 22 characters span 3.08x in width WITHIN Montserrat alone (87.4px of "1" vs
// 268.9px of "W" at 11px). No character budget can see that.

import { describe, expect, test } from "bun:test";
import {
  measureText,
  fitText,
  labelGutterFor,
  CHAR_ESTIMATE_FALLBACK_PX_PER_EM,
} from "./text-metrics";

describe("text-metrics — the char-budget defect it exists to kill", () => {
  // THE LIVE DEFECT. barChartSvg (lib/email/chart-image.ts) right-anchors a bar label
  // at padL-8 = 148px and truncates at 26 CHARACTERS. "Whiskey Creek 33919 — SOLD" is
  // exactly 26 chars, so the builder passes it through untouched — and it paints 20.7px
  // over the bars IN LIBERATION SANS, the incumbent chart face. This was never a brand-
  // font regression; it shipped that way before any brand face was wired.
  test("a label that PASSES the 26-char budget still overflows the 148px gutter — in the INCUMBENT face", () => {
    const label = "Whiskey Creek 33919 — SOLD";
    expect(label.length).toBeLessThanOrEqual(26); // the old guard says this is fine
    expect(measureText(label, { size: 12 })).toBeGreaterThan(148); // the pixels say it is not
  });

  test("the same character count spans >2x in width inside ONE face — a char budget cannot see it", () => {
    const narrow = measureText("1".repeat(22), { family: "MONTSERRAT_SANS", size: 11 });
    const wide = measureText("W".repeat(22), { family: "MONTSERRAT_SANS", size: 11 });
    expect(wide / narrow).toBeGreaterThan(2);
  });
});

describe("fitText — the invariant every builder now leans on", () => {
  const FAMILIES = [
    "MODERN_SANS",
    "BOOK_SERIF",
    "GEOMETRIC_SANS",
    "PLAYFAIR_SERIF",
    "LATO_SANS",
    "MONTSERRAT_SANS",
  ] as const;

  // The whole point. If this can fail, the gutter can be painted over again.
  test.each(FAMILIES)("never returns a string wider than the max — %s", (family) => {
    const cases = [
      "Whiskey Creek 33919 — SOLD",
      "This home · 8348 Southwindbay Cir",
      "W".repeat(40),
      "l".repeat(40),
      "Bonita Springs 34135",
    ];
    for (const s of cases) {
      const out = fitText(s, 148, { family, size: 12 });
      expect(measureText(out, { family, size: 12 })).toBeLessThanOrEqual(148);
    }
  });

  test("a string that already fits is returned VERBATIM — no gratuitous ellipsis", () => {
    expect(fitText("Bonita Springs 34135", 148, { family: "MODERN_SANS", size: 12 })).toBe(
      "Bonita Springs 34135",
    );
  });

  test("an overflowing string keeps the ellipsis INSIDE the budget, not appended past it", () => {
    const out = fitText("W".repeat(40), 148, { family: "MONTSERRAT_SANS", size: 12 });
    expect(out.endsWith("…")).toBe(true);
    expect(measureText(out, { family: "MONTSERRAT_SANS", size: 12 })).toBeLessThanOrEqual(148);
  });

  // A max so small nothing fits must not emit a bare "…" wider than the box, and must
  // never return undefined/NaN into an SVG attribute.
  test("a max narrower than one glyph degrades to empty, never to NaN or an oversized ellipsis", () => {
    const out = fitText("Whiskey Creek", 2, { family: "MODERN_SANS", size: 12 });
    expect(typeof out).toBe("string");
    expect(measureText(out, { family: "MODERN_SANS", size: 12 })).toBeLessThanOrEqual(2);
  });
});

describe("measureText — the two traps that silently under-measure", () => {
  // Chart titles and every value label in the SVG builders are font-weight:bold.
  // Measuring the Regular face for a bold string under-measures and overflows.
  test("bold measures WIDER than regular — measuring the regular face would under-measure", () => {
    const s = "Median sale price by ZIP — 12 months";
    const reg = measureText(s, { family: "MONTSERRAT_SANS", size: 15 });
    const bold = measureText(s, { family: "MONTSERRAT_SANS", size: 15, weight: "bold" });
    expect(bold).toBeGreaterThan(reg);
  });

  // Real labels here carry em-dashes and middots ("This home · …", "… — SOLD"). A
  // .notdef-width fallback silently mis-measures every one of them.
  test("non-ASCII punctuation the recipes really emit is measured, not silently dropped", () => {
    const plain = measureText("This home", { family: "LATO_SANS", size: 12 });
    const withPunct = measureText("This home · —", { family: "LATO_SANS", size: 12 });
    expect(withPunct).toBeGreaterThan(plain);
  });

  test("width scales linearly with size — a px size is honored, not a fixed design unit", () => {
    const a = measureText("Bonita Springs", { family: "LATO_SANS", size: 10 });
    const b = measureText("Bonita Springs", { family: "LATO_SANS", size: 20 });
    expect(b / a).toBeCloseTo(2, 1);
  });
});

describe("fail-safe — a bad parse must degrade, never blank the chart", () => {
  // If the face cannot be read (missing from the serverless bundle is the documented
  // landmine — next.config.ts outputFileTracingIncludes), measurement must fall back to
  // a conservative estimate. Returning 0 would make everything "fit" and paint over the
  // bars; returning NaN would emit NaN into an SVG attribute and blank the label.
  test("an unresolvable family estimates from the char count instead of returning 0 or NaN", () => {
    // @ts-expect-error — deliberately outside FontFamily, the shape a bad brand row has
    const w = measureText("Bonita Springs 34135", { family: "NOT_A_REAL_FONT", size: 12 });
    expect(Number.isFinite(w)).toBe(true);
    expect(w).toBeGreaterThan(0);
  });

  test("the fallback estimate is CONSERVATIVE — it over-estimates rather than overflowing", () => {
    // Wider than the real Liberation width of the same string, so a fallback truncates
    // early instead of painting over the bars.
    const est = "Bonita Springs 34135".length * CHAR_ESTIMATE_FALLBACK_PX_PER_EM * 12;
    expect(est).toBeGreaterThan(measureText("Bonita Springs 34135", { size: 12 }));
  });

  // THE GUARD FOR THE FAILURE THIS FILE ALREADY HAD. The node-only face loader is
  // reached through an indirect require so the bundler cannot pull fontkit into the
  // client bundle. The first attempt used `eval("require")`, which throws under Bun's
  // ESM loader — the loader the whole 7,078-test lib suite runs on. Every measurement
  // silently fell through to the character estimate and EVERY TEST ABOVE STILL PASSED,
  // because the estimate satisfies all of them. A fallback that can quietly become the
  // only path is worse than no fallback. This asserts the REAL metrics are live in node
  // by pinning a value the estimate cannot produce.
  test("the real TTF metrics are actually in use in node — not silently degraded to the estimate", () => {
    const s = "Bonita Springs 34135";
    const measured = measureText(s, { family: "MONTSERRAT_SANS", size: 12 });
    const estimated = [...s].length * CHAR_ESTIMATE_FALLBACK_PX_PER_EM * 12;
    expect(measured).not.toBeCloseTo(estimated, 1);
    // Two different faces must disagree — under the estimate they would be identical.
    expect(measureText(s, { family: "MONTSERRAT_SANS", size: 12 })).not.toBeCloseTo(
      measureText(s, { family: "GEOMETRIC_SANS", size: 12 }),
      1,
    );
  });

  test("empty string is 0 width and fits any box", () => {
    expect(measureText("", { size: 12 })).toBe(0);
    expect(fitText("", 100, { size: 12 })).toBe("");
  });
});

describe("labelGutterFor — this is the 'auto adjusts' the operator asked for", () => {
  // The builders hardcode padL = 150/156 regardless of what the labels actually are.
  // Short labels waste a third of a 600px canvas; long ones get truncated to fit a
  // gutter nobody measured. The gutter should size itself to the real content.
  test("short labels give back their unused gutter to the bars", () => {
    const wide = labelGutterFor(["Fort Myers Beach 33931", "Bonita Springs 34135"], { size: 12 });
    const narrow = labelGutterFor(["34135", "33931"], { size: 12 });
    expect(narrow).toBeLessThan(wide);
  });

  test("the gutter is CLAMPED so a pathological label cannot eat the chart", () => {
    const g = labelGutterFor(["W".repeat(80)], { size: 12, max: 200 });
    expect(g).toBeLessThanOrEqual(200);
  });

  test("a floor keeps the axis from collapsing when every label is tiny", () => {
    expect(labelGutterFor(["1"], { size: 12, min: 60 })).toBeGreaterThanOrEqual(60);
  });

  test("no labels at all returns the floor, not NaN", () => {
    const g = labelGutterFor([], { size: 12, min: 60 });
    expect(Number.isFinite(g)).toBe(true);
    expect(g).toBe(60);
  });
});
