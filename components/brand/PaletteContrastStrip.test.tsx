// components/brand/PaletteContrastStrip.test.tsx — Fence 6 Tier B warn strip.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PaletteContrastStrip } from "./PaletteContrastStrip";

describe("PaletteContrastStrip", () => {
  it("lists failing pairs in plain language with rounded ratios", () => {
    const html = renderToStaticMarkup(
      createElement(PaletteContrastStrip, {
        scheme: ["#0f1d24", "#3DC9C0", "#1F2937", "#F8FAFC"], // house default: 2 live failures
      }),
    );
    expect(html).toContain("accent links on white cards");
    expect(html).toContain("2.0:1"); // rounded for display, not the raw float
    expect(html).toContain("4.5:1");
  });

  it("renders nothing when no evaluated pair fails (empty accent slot skips its pairs)", () => {
    const html = renderToStaticMarkup(
      createElement(PaletteContrastStrip, {
        scheme: ["#0f1d24", "", "#111827", "#ffffff"], // all present pairs pass
      }),
    );
    expect(html).toBe("");
  });

  it("caps at 3 rows and counts the rest", () => {
    const html = renderToStaticMarkup(
      createElement(PaletteContrastStrip, {
        scheme: ["#F5E6C4", "#FFF8E1", "#dddddd", "#eeeeee"], // pale-on-pale: 7 failures
      }),
    );
    expect(html).toMatch(/\+\d+ more/);
  });
});
