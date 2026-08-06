// lib/brand/canvas-fonts.test.ts
//
// THE CHART FONT MUST BE THE EMAIL FONT. Operator, 08/06/2026, looking at a real
// render: "the font looks fucking different and the email sucks."
//
// He was right, and the cause was structural, not cosmetic: every chart SVG we build
// hardcodes `font-family="Arial"`, which is never a loaded face, so resvg falls back to
// `defaultFontFamily` — pinned to Liberation Sans for every brand. Meanwhile the email
// body around the image renders in `BRAND_FONTS[...].stack` (Montserrat, Playfair, Lato).
// So a bold 15px chart title sat inside a Montserrat email in an Arial clone, always.
//
// Each test below is named for the failure mode it exists to stop (RULE 3.5 — name the
// break before you build). The Arial literals in the 15 SVG builders are deliberately
// NOT touched: the fallback is the mechanism the renderer already documents, so pointing
// the fallback at the brand face fixes every builder at once and adds no new machinery.

import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { BRAND_FONTS, CANVAS_FONT_FILES, canvasFamilyFor, canvasFilesFor } from "./fonts";
import { barChartSvg, svgToPng } from "@/lib/email/chart-image";
import type { FontFamily } from "@/lib/email/doc/types";

const FAMILIES: FontFamily[] = [
  "MODERN_SANS",
  "BOOK_SERIF",
  "GEOMETRIC_SANS",
  "PLAYFAIR_SERIF",
  "LATO_SANS",
  "MONTSERRAT_SANS",
];

/** The chart the operator was looking at: a titled bar chart, longest realistic label. */
function sampleSvg(): string {
  return barChartSvg(
    [
      { label: "Fort Myers 33901", value: 412_000 },
      { label: "Cape Coral 33904", value: 386_500 },
    ],
    { title: "Home values by zip code", accent: "#3DC9C0", valueFormat: "usd", width: 600 },
  );
}

describe("the chart font is the brand font", () => {
  // FAILURE MODE: a family has no bundled face -> resvg renders the text as NOTHING,
  // silently, with no error. This is the exact landmine chart-fonts.ts was written for;
  // a new brand font shipping without a TTF would reintroduce it.
  test("every FontFamily resolves to two real font files that exist on disk", () => {
    for (const f of FAMILIES) {
      const files = canvasFilesFor(f);
      expect(files).toHaveLength(2); // Regular + Bold
      for (const file of files) {
        expect(existsSync(file)).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(10_000); // a real face, not a stub
      }
    }
  });

  // FAILURE MODE: `font-weight:bold` with no Bold face makes resvg SYNTHESIZE a smeared
  // faux-bold. Every chart title and value label in this codebase is bold.
  test("each family ships a distinct Regular and Bold face", () => {
    for (const f of FAMILIES) {
      const [regular, bold] = canvasFilesFor(f);
      expect(regular).not.toBe(bold);
      expect(regular).toMatch(/-Regular\.ttf$/);
      expect(bold).toMatch(/-Bold\.ttf$/);
    }
  });

  // FAILURE MODE: the TTF resolves locally and VANISHES in the serverless bundle. Every
  // route calling svgToPng traces `./assets/fonts/*.ttf`; a file outside that directory
  // renders blank in prod and only in prod.
  test("every canvas font file lives in assets/fonts so the Vercel trace glob catches it", () => {
    const dir = path.join(process.cwd(), "assets", "fonts");
    for (const f of FAMILIES) {
      for (const file of canvasFilesFor(f)) {
        expect(path.dirname(file)).toBe(dir);
        expect(file).toMatch(/\.ttf$/);
      }
      expect(CANVAS_FONT_FILES).toEqual(expect.arrayContaining(canvasFilesFor(f)));
    }
  });

  // FAILURE MODE: the registry drifts — a family names a canvas family with no file, or a
  // file no entry points at. Deriving the file list FROM the Record is what keeps it total.
  test("the bundled file list is exactly the union of the registry's own entries", () => {
    const fromRegistry = new Set(FAMILIES.flatMap((f) => canvasFilesFor(f)));
    for (const file of CANVAS_FONT_FILES) expect(fromRegistry.has(file)).toBe(true);
    expect(CANVAS_FONT_FILES.length).toBe(fromRegistry.size);
  });

  // FAILURE MODE — THE ONE THE OPERATOR SAW. The brand never reaches the raster and every
  // chart comes out in the same Arial clone. Two different brands rasterizing the SAME SVG
  // to IDENTICAL bytes is proof the font is being ignored; different bytes is proof it is
  // not. This asserts the fallback path end-to-end, which no unit test of the Record can.
  test("the same SVG rasterizes differently under two different brand fonts", () => {
    const svg = sampleSvg();
    const montserrat = svgToPng(svg, { fontFamily: "MONTSERRAT_SANS" });
    const playfair = svgToPng(svg, { fontFamily: "PLAYFAIR_SERIF" });
    const lato = svgToPng(svg, { fontFamily: "LATO_SANS" });

    expect(montserrat.equals(playfair)).toBe(false);
    expect(montserrat.equals(lato)).toBe(false);
    expect(playfair.equals(lato)).toBe(false);
  });

  // FAILURE MODE: text renders as nothing. A blank-text PNG is mostly one flat colour and
  // compresses far smaller than one carrying real glyphs — so a size floor catches the
  // silent-blank case that a "did it throw?" check never would.
  test("no brand font rasterizes to a blank-text PNG", () => {
    const svg = sampleSvg();
    for (const f of FAMILIES) {
      const png = svgToPng(svg, { fontFamily: f });
      expect(png.length).toBeGreaterThan(6_000);
    }
  });

  // FAILURE MODE: an unknown/absent family key (a brand blob carrying a font we retired)
  // wipes every label. It must degrade to a real bundled face, never to nothing.
  test("an absent font family still renders text, never blank", () => {
    const svg = sampleSvg();
    const withoutBrand = svgToPng(svg);
    const bogus = svgToPng(svg, { fontFamily: "NOT_A_REAL_FONT" as FontFamily });
    expect(withoutBrand.length).toBeGreaterThan(6_000);
    expect(bogus.length).toBeGreaterThan(6_000);
  });

  // FAILURE MODE: Georgia and Century Gothic are PROPRIETARY — they cannot be bundled. The
  // substitutes have to be honest ones, and a serif brand must never fall to a sans face.
  test("serif brands resolve to a serif canvas face, sans brands to a sans face", () => {
    expect(canvasFamilyFor("BOOK_SERIF")).toBe("Gelasio"); // metric-compatible with Georgia
    expect(canvasFamilyFor("PLAYFAIR_SERIF")).toBe("Playfair Display");
    expect(canvasFamilyFor("MONTSERRAT_SANS")).toBe("Montserrat");
    expect(canvasFamilyFor("LATO_SANS")).toBe("Lato");
    expect(canvasFamilyFor("MODERN_SANS")).toBe("Inter");
    expect(canvasFamilyFor("GEOMETRIC_SANS")).toBe("Jost");
    for (const f of FAMILIES) expect(BRAND_FONTS[f].canvasFamily.length).toBeGreaterThan(0);
  });
});
