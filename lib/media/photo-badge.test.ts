// lib/media/photo-badge.test.ts — the flag's geometry and palette, asserted on the
// SVG seam (composeBadgeSvg) without rasterising anything.
//
// Operator decree 08/09/2026, looking at the render: *"I CAN SEE A BLACK LINE AND THE
// ANGLE IS TERRIBLE. JUST MAKE IT A DIFFERENT COLORED COMPLEMENTARY COLOR FLAG AT THE
// BOTTOM OF THE PICTURE."* Every test here is named after one clause of that decree,
// so the diagonal ribbon and its black scrim cannot quietly come back.
import { describe, expect, it } from "bun:test";
import { complementOf, composeBadgeSvg } from "./photo-badge";

const svg = (accent = "#B98F45") =>
  composeBadgeSvg({ photoPngBase64: "abc", word: "Just Sold", accent });

describe("complementOf — a different colour, derived from the brand, never invented", () => {
  it("rotates the hue 180°: red ↔ cyan, exactly", () => {
    expect(complementOf("#ff0000")).toBe("#00ffff");
    expect(complementOf("#00ffff")).toBe("#ff0000");
  });

  it("always returns a parseable #rrggbb that differs from a chromatic input", () => {
    for (const c of ["#B98F45", "#2563eb", "#0f766e"]) {
      const out = complementOf(c);
      expect(out).toMatch(/^#[0-9a-f]{6}$/);
      expect(out.toLowerCase()).not.toBe(c.toLowerCase());
    }
  });

  it("unparseable input falls to the neutral slate — a UI fallback, never a crash", () => {
    expect(complementOf("not-a-color")).toBe("#334155");
  });
});

describe("composeBadgeSvg — the flag, per the decree", () => {
  it("NO ANGLE: nothing in the SVG is rotated", () => {
    expect(svg()).not.toContain("rotate(");
  });

  it("NO BLACK LINE: the corner scrim gradient is gone", () => {
    expect(svg()).not.toContain("cornerScrim");
    expect(svg()).not.toContain("linearGradient");
  });

  it("AT THE BOTTOM: the flag is a full-width band on the photo's bottom edge", () => {
    // 800px canvas, 120px flag → the band and its label sit at y=680.
    const out = svg();
    expect(out).toContain('<rect x="0" y="680" width="1200" height="120"');
  });

  it("A DIFFERENT COLORED COMPLEMENTARY COLOR: the band wears the accent's complement, keylined by the accent", () => {
    const accent = "#B98F45";
    const out = svg(accent);
    expect(out).toContain(`fill="${complementOf(accent)}"`);
    // The slim keyline ties it back to the brand — the accent appears only there.
    expect(out).toContain(`height="6" fill="${accent}"`);
  });

  it("the word rides uppercase, centred", () => {
    expect(svg()).toContain(">JUST SOLD</text>");
    expect(svg()).toContain('text-anchor="middle"');
  });
});
