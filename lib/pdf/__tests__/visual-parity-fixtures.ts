// lib/pdf/__tests__/visual-parity-fixtures.ts
//
// Shared fixtures for the PDF/HTML visual-parity suite. The test image is
// generated in code (not a checked-in binary asset) so it's reviewable as
// plain code and reproducible byte-for-byte.
import { PNG } from "pngjs";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { Rgb } from "./pixel-utils";

export const MARKER_A: Rgb = { r: 255, g: 0, b: 255 }; // magenta
export const MARKER_B: Rgb = { r: 255, g: 255, b: 0 }; // yellow

const IMAGE_WIDTH = 400;
const IMAGE_HEIGHT = 100;

function buildTestImage(): Buffer {
  const png = new PNG({ width: IMAGE_WIDTH, height: IMAGE_HEIGHT });
  for (let y = 0; y < IMAGE_HEIGHT; y++) {
    for (let x = 0; x < IMAGE_WIDTH; x++) {
      const idx = (IMAGE_WIDTH * y + x) << 2;
      const c = x < IMAGE_WIDTH / 2 ? MARKER_A : MARKER_B;
      png.data[idx] = c.r;
      png.data[idx + 1] = c.g;
      png.data[idx + 2] = c.b;
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

export const TEST_IMAGE_DATA_URI = `data:image/png;base64,${buildTestImage().toString("base64")}`;

const GLOBAL_STYLE = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS" as const,
  textColor: "#242424",
  backdropColor: "#F8F8F8",
};

export function headerFixtureDoc(): EmailDoc {
  return {
    globalStyle: { ...GLOBAL_STYLE },
    blocks: [{ id: "h1", type: "header", props: { logoUrl: TEST_IMAGE_DATA_URI } }],
  };
}

export function agentHeroFixtureDoc(): EmailDoc {
  return {
    globalStyle: { ...GLOBAL_STYLE },
    blocks: [{ id: "a1", type: "agent-hero", props: { photoUrl: TEST_IMAGE_DATA_URI } }],
  };
}

/** Header + one very long text block — forces @react-pdf's automatic page wrap
 *  (Page `wrap` defaults true) onto a 2nd LETTER page regardless of exact font
 *  metrics, so the page-break check (Task 6) has something to check against. */
export function pageBreakFixtureDoc(): EmailDoc {
  const longBody = Array.from(
    { length: 400 },
    (_, i) => `Line ${i + 1} of filler prose to force pagination.`,
  ).join("\n");
  return {
    globalStyle: { ...GLOBAL_STYLE },
    blocks: [
      { id: "h1", type: "header", props: { logoUrl: TEST_IMAGE_DATA_URI } },
      { id: "t1", type: "text", props: { body: longBody, align: "left" } },
    ],
  };
}
