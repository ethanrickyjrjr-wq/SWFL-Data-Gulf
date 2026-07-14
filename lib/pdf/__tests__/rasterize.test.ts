// lib/pdf/__tests__/rasterize.test.ts
//
// Smoke tests for the two rasterization wrappers, PLUS the one vendor-contract
// assumption this whole suite rests on: does @react-pdf/renderer's <Image src>
// actually accept a data:image/png;base64,... string? react-pdf's docs
// (react-pdf.org/components#image) list "URL or filesystem path (Node only)"
// as the String form and don't call out data URIs explicitly — this test
// confirms it empirically instead of assuming it.
import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { Document, Page, Image, renderToBuffer } from "@react-pdf/renderer";
import { rasterizeHtml, rasterizePdfPage, rasterizePdfPageCount } from "./rasterize";
import { findMarkerBoundingBox } from "./pixel-utils";
import { TEST_IMAGE_DATA_URI, MARKER_A, MARKER_B } from "./visual-parity-fixtures";

describe("rasterizeHtml", () => {
  it("returns a decodable PNG for trivial HTML", async () => {
    const html = `<html><body style="margin:0"><div style="width:120px;height:60px;background:red"></div></body></html>`;
    const png = await rasterizeHtml(html, { width: 200, height: 100 });
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });
});

describe("rasterizePdfPage / rasterizePdfPageCount", () => {
  it("returns a decodable PNG and correct page count for a trivial one-page PDF", async () => {
    const buf = await renderToBuffer(
      createElement(Document, null, createElement(Page, { size: "A4" }, null)),
    );
    expect(await rasterizePdfPageCount(buf)).toBe(1);
    const png = await rasterizePdfPage(buf, 1);
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });

  it("@react-pdf/renderer's Image accepts a data:image/png;base64 URI and actually paints it", async () => {
    const buf = await renderToBuffer(
      createElement(
        Document,
        null,
        createElement(
          Page,
          { size: "A4" },
          createElement(Image, { src: TEST_IMAGE_DATA_URI, style: { width: 200, height: 50 } }),
        ),
      ),
    );
    const png = await rasterizePdfPage(buf, 1, 3);
    const box = findMarkerBoundingBox(png, [MARKER_A, MARKER_B]);
    expect(box).not.toBeNull(); // the marker colors were actually drawn, not silently dropped
  });
});
