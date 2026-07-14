// lib/pdf/__tests__/pdf-html-visual-parity.test.ts
//
// Catches visual-fidelity regressions between the PDF and HTML renders of the
// SAME EmailDoc — a gap email-doc-pdf.test.ts doesn't cover (it only proves
// every block type produces *a* valid PDF, not that it visually matches HTML).
// Three production bugs already slipped through exactly this gap (see the
// design spec, 2026-07-14-pdf-html-visual-parity-design.md): a squashed logo
// (objectFit "fill" vs HTML's implicit "contain"), a stretched logo (flexbox
// alignItems defaulting to "stretch"), and a page-2 header bleeding to the
// physical edge (PAGE_TOP_PAD margin math). All three are geometry bugs, not
// text-rendering bugs — the checks below are pixel-based but deliberately
// avoid comparing text, since the PDF path uses built-in Helvetica/Times-Roman
// while HTML uses real webfonts and will never match glyph-for-glyph.
import { describe, expect, it } from "bun:test";
import pixelmatchMod from "pixelmatch";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { renderEmailDocToBuffer } from "@/lib/pdf";
import { rasterizeHtml, rasterizePdfPage, rasterizePdfPageCount } from "./rasterize";
import {
  findMarkerBoundingBox,
  findContentBoundingBox,
  boundingBoxRatio,
  resizeNearestNeighbor,
} from "./pixel-utils";
import {
  headerFixtureDoc,
  agentHeroFixtureDoc,
  pageBreakFixtureDoc,
  MARKER_A,
  MARKER_B,
} from "./visual-parity-fixtures";

const pixelmatch = pixelmatchMod as unknown as (
  img1: Uint8Array,
  img2: Uint8Array,
  output: Uint8Array | null,
  width: number,
  height: number,
  options?: { threshold?: number },
) => number;

const HTML_VIEWPORT = { width: 600, height: 800 };
const REGION_RATIO_TOLERANCE = 0.05; // 5%
const FULL_PAGE_DIFF_CEILING = 0.5; // 50% — a coarse tripwire, not a precise gate
const CANON_SIZE = { width: 300, height: 300 };

const FIXTURES = [
  { name: "header logo", doc: headerFixtureDoc() },
  { name: "agent-hero photo", doc: agentHeroFixtureDoc() },
];

describe.each(FIXTURES)("PDF/HTML visual parity — $name", ({ doc }) => {
  it("Layer 1 (region-strict): marker image's aspect ratio matches within 5%", async () => {
    const html = await renderEmailDocHtml(doc);
    const htmlPng = await rasterizeHtml(html, HTML_VIEWPORT);

    const pdfBuf = await renderEmailDocToBuffer(doc);
    const pdfPng = await rasterizePdfPage(pdfBuf, 1);

    const htmlBox = findMarkerBoundingBox(htmlPng, [MARKER_A, MARKER_B]);
    const pdfBox = findMarkerBoundingBox(pdfPng, [MARKER_A, MARKER_B]);

    expect(htmlBox).not.toBeNull();
    expect(pdfBox).not.toBeNull();
    if (!htmlBox || !pdfBox) return; // unreachable — narrows for TS below

    const htmlRatio = boundingBoxRatio(htmlBox);
    const pdfRatio = boundingBoxRatio(pdfBox);
    const relDiff = Math.abs(htmlRatio - pdfRatio) / htmlRatio;

    console.log(`[visual-parity] ${JSON.stringify({ htmlRatio, pdfRatio, relDiff })}`);
    expect(relDiff).toBeLessThan(REGION_RATIO_TOLERANCE);
  });

  it("Layer 2 (full-page loose): coarse pixel diff stays under 50% (catastrophic-breakage tripwire)", async () => {
    const html = await renderEmailDocHtml(doc);
    const htmlPng = await rasterizeHtml(html, HTML_VIEWPORT);

    const pdfBuf = await renderEmailDocToBuffer(doc);
    const pdfPng = await rasterizePdfPage(pdfBuf, 1);

    const a = resizeNearestNeighbor(htmlPng, CANON_SIZE.width, CANON_SIZE.height);
    const b = resizeNearestNeighbor(pdfPng, CANON_SIZE.width, CANON_SIZE.height);
    const diffPixels = pixelmatch(a.data, b.data, null, CANON_SIZE.width, CANON_SIZE.height, {
      threshold: 0.3,
    });
    const diffRatio = diffPixels / (CANON_SIZE.width * CANON_SIZE.height);

    console.log(`[visual-parity] full-page diff ratio: ${(diffRatio * 100).toFixed(1)}%`);
    expect(diffRatio).toBeLessThan(FULL_PAGE_DIFF_CEILING);
  });
});

// Mirrors PAGE_TOP_PAD in lib/pdf/email-doc-pdf.tsx (currently 24, not exported —
// this build makes no change to production rendering code, so the value is
// duplicated here; if that constant changes, update this literal to match).
const PAGE_TOP_PAD_PT = 24;
const PDF_WHITE = { r: 255, g: 255, b: 255 };
const RASTER_SCALE = 2;

describe("PDF page-break bleed (bug #3 — PDF-only, no HTML side to compare against)", () => {
  it("page 2's top content is offset from the physical edge by roughly PAGE_TOP_PAD, not flush", async () => {
    const buf = await renderEmailDocToBuffer(pageBreakFixtureDoc());

    const pageCount = await rasterizePdfPageCount(buf);
    // If this fails, the fixture no longer forces a 2nd page (e.g. font metrics
    // changed) — fix the fixture's line count, don't loosen the assertion below.
    expect(pageCount).toBeGreaterThanOrEqual(2);

    const page2 = await rasterizePdfPage(buf, 2, RASTER_SCALE);
    const box = findContentBoundingBox(page2, PDF_WHITE);

    expect(box).not.toBeNull();
    if (!box) return;

    console.log(
      `[visual-parity] page 2 top offset: ${box.y}px (expect >= ~${PAGE_TOP_PAD_PT * RASTER_SCALE * 0.5}px)`,
    );
    expect(box.y).toBeGreaterThanOrEqual(PAGE_TOP_PAD_PT * RASTER_SCALE * 0.5);
  });
});
