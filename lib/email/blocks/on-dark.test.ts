// on-dark flip: any dark section background (band-resolved OR hand-set) swaps
// block text to light ink — dark-on-dark is unreachable. Pure helper tests +
// golden-style render asserts through the ONE render root.
import { test, expect, describe } from "bun:test";
import { isDarkBg, legibleAccent, legibleInk, ON_DARK_BODY, ON_DARK_TITLE } from "./on-dark";
import { renderEmailDocHtml } from "../render-email-doc";
import { DEFAULT_GLOBAL_STYLE } from "../doc/default-docs";
import type { EmailDoc } from "../doc/types";

describe("isDarkBg", () => {
  test("dark hex → true; light hex → false", () => {
    expect(isDarkBg("#0f1d24")).toBe(true);
    expect(isDarkBg("#111827")).toBe(true);
    expect(isDarkBg("#ffffff")).toBe(false);
    expect(isDarkBg("#F0F9FA")).toBe(false);
  });

  test("absent or non-hex input never flips (never throws)", () => {
    expect(isDarkBg(undefined)).toBe(false);
    expect(isDarkBg("")).toBe(false);
    expect(isDarkBg("rgba(0,0,0,0.45)")).toBe(false);
    expect(isDarkBg("navy")).toBe(false);
  });
});

describe("legibleAccent", () => {
  test("a vivid accent survives on a dark band; an illegible one falls to white", () => {
    expect(legibleAccent("#3DC9C0", "#0f1d24")).toBe("#3DC9C0"); // teal pops on navy
    expect(legibleAccent("#123037", "#0f1d24")).toBe(ON_DARK_TITLE); // navy-on-navy → white
  });
});

// Fence 6 Task 1 — legibleInk: directional readable-neutral fallback. Expected
// ratios computed 07/09/2026 with the repo's contrastRatio (lib/charts/palette):
// #3DC9C0 on #0f1d24 = 8.44 · #3DC9C0 on #ffffff = 2.04 · #1B3A5C on #1B3A5C = 1.00 ·
// #FFF8E1 on #F5E6C4 = 1.16 · #ffffff on #D4AF37 = 2.10 · #B8860B on #ffffff = 3.25.
describe("legibleInk", () => {
  test("keeps the preferred ink when it clears the floor", () => {
    expect(legibleInk("#3DC9C0", "#0f1d24", 4.5)).toBe("#3DC9C0"); // 8.44
  });

  test("falls to WHITE on a dark bg it cannot clear", () => {
    expect(legibleInk("#1B3A5C", "#1B3A5C", 4.5)).toBe("#ffffff"); // 1.00, dark bg
  });

  test("falls to DARK ink on a light bg it cannot clear (NOT white)", () => {
    expect(legibleInk("#3DC9C0", "#ffffff", 4.5)).toBe("#111827"); // 2.04, light bg
    expect(legibleInk("#FFF8E1", "#F5E6C4", 4.5)).toBe("#111827"); // 1.16, light bg
    expect(legibleInk("#ffffff", "#D4AF37", 4.5)).toBe("#111827"); // 2.10, light fill
  });

  test("respects the floor argument (3 passes what 4.5 rejects)", () => {
    expect(legibleInk("#B8860B", "#ffffff", 3)).toBe("#B8860B"); // 3.25 >= 3
    expect(legibleInk("#B8860B", "#ffffff", 4.5)).toBe("#111827"); // 3.25 < 4.5
  });

  test("passes through non-hex input untouched (never throws)", () => {
    expect(legibleInk("rgba(0,0,0,0.5)", "#ffffff", 4.5)).toBe("rgba(0,0,0,0.5)");
    expect(legibleInk("#3DC9C0", "linear-gradient(x)", 4.5)).toBe("#3DC9C0");
  });
});

describe("render: dark band flips text, light band keeps ink", () => {
  const doc = (sectionBg: string): EmailDoc => ({
    globalStyle: DEFAULT_GLOBAL_STYLE,
    blocks: [
      { id: "b1", type: "text", props: { body: "Banded copy.", sectionBg } },
      {
        id: "b2",
        type: "list",
        props: {
          title: "This month",
          items: [{ lead: "SAT ·", text: "Farmers market" }],
          sectionBg,
        },
      },
    ],
  });

  test("dark sectionBg renders light body text", async () => {
    const html = await renderEmailDocHtml(doc("#0f1d24"));
    expect(html).toContain(ON_DARK_BODY);
    expect(html).toContain(ON_DARK_TITLE); // list title flips
  });

  test("light sectionBg keeps the brand ink", async () => {
    const html = await renderEmailDocHtml(doc("#ffffff"));
    expect(html).not.toContain(ON_DARK_BODY);
    expect(html).toContain(DEFAULT_GLOBAL_STYLE.textColor);
  });

  test("an image overlay renders its title on the scrim", async () => {
    const html = await renderEmailDocHtml({
      globalStyle: DEFAULT_GLOBAL_STYLE,
      blocks: [
        {
          id: "b1",
          type: "image",
          props: {
            url: "https://x/hero.jpg",
            overlayTitle: "Live on the water",
            overlayBody: "A tour of the featured listing.",
          },
        },
      ],
    });
    expect(html).toContain("Live on the water");
    expect(html).toContain("A tour of the featured listing.");
  });
});
