import { test, expect } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { CHART_FONT_FILES, CHART_FONT_FAMILY } from "./chart-fonts";

// THE SILENT-PROD-FAILURE GUARD (prochart-rendering, P1 font bundle): on Vercel's Linux
// runtime there is NO "Arial". resvg with loadSystemFonts:true then silently renders charts
// with ZERO text — no error, blank labels (a 2,832-byte vs 23,500-byte PNG in the probe).
// The fix is a BUNDLED TTF whose path resvg loads. These tests assert the bundle is wired:
// the files are actually present (vendored, not a node_modules path that can be pruned), and
// glyphs rasterize WITHOUT system fonts — the exact production condition.

test("every bundled chart font path exists and is a non-empty TTF", () => {
  expect(CHART_FONT_FILES.length).toBeGreaterThanOrEqual(2); // regular + bold
  for (const p of CHART_FONT_FILES) {
    expect(existsSync(p)).toBe(true);
    expect(statSync(p).size).toBeGreaterThan(10_000); // a real font, not a stub
  }
});

test("the default family is Liberation Sans (Arial-metric-compatible)", () => {
  // Arial-metric compatibility keeps every existing chart layout pixel-identical — the
  // hand-rolled SVG builders pad/position assuming Arial widths.
  expect(CHART_FONT_FAMILY).toBe("Liberation Sans");
});

test("text rasterizes via the bundled font with system fonts OFF (the Vercel condition)", () => {
  const textSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">' +
    '<rect width="600" height="200" fill="#ffffff"/>' +
    '<text x="20" y="60" font-family="Arial" font-size="22" font-weight="bold" fill="#0F1D24">Active Listings 33904</text>' +
    '<text x="20" y="110" font-family="Arial" font-size="14" fill="#3DC9C0">1,234 active as of 06/28/2026</text>' +
    "</svg>";
  const blankSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">' +
    '<rect width="600" height="200" fill="#ffffff"/></svg>';

  const render = (svg: string) =>
    new Resvg(svg, {
      background: "rgba(255,255,255,1)",
      font: {
        fontFiles: CHART_FONT_FILES,
        loadSystemFonts: false, // mirror Vercel: no system Arial available
        defaultFontFamily: CHART_FONT_FAMILY,
      },
    })
      .render()
      .asPng();

  const textPng = render(textSvg);
  const blankPng = render(blankSvg);
  // Glyphs add substantial ink; a blank canvas of the same size compresses tiny. If the
  // bundled font failed to load, textPng would collapse toward blankPng (the prod bug).
  expect(textPng.length).toBeGreaterThan(blankPng.length * 2);
});
