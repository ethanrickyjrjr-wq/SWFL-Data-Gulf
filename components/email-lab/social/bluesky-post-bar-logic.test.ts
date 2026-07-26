import { describe, expect, it } from "bun:test";
import {
  DEFAULT_ALT,
  SHRINK_LADDER,
  captionState,
  deriveAltDefault,
  shrinkToCap,
  type ExportImageFn,
} from "./bluesky-post-bar-logic";
import { MAX_CAPTION_GRAPHEMES, MAX_IMAGE_BYTES } from "@/lib/social/post-now-validate";
import type { SocialElement, TextElement } from "@/lib/social/design/types";

/**
 * bluesky-post-bar-logic — the caption counter + the re-encode ladder.
 * Pure/DOM-free per the brief, so this only ever imports bun:test + the two
 * modules above; no React, no Konva.
 */

// `"A".repeat(n)` (n a multiple of 4) decodes to exactly (n/4)*3 zero bytes —
// same trick lib/social/post-now-validate.test.ts uses for exact byte counts.
function fakeDataUrl(byteLength: number, mime = "image/png"): string {
  const b64Len = Math.ceil(byteLength / 3) * 4;
  return `data:${mime};base64,${"A".repeat(b64Len)}`;
}

const OVER_CAP = fakeDataUrl(MAX_IMAGE_BYTES + 300_000); // decodes over the cap
const UNDER_CAP = fakeDataUrl(1_000); // decodes comfortably under the cap

function textElement(id: string, text: string): TextElement {
  return {
    id,
    type: "text",
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    text,
    fontSize: 32,
    fontFamily: "Arial",
    fill: "#000000",
  };
}

describe("captionState", () => {
  it("reports the count and is not over-limit at exactly the cap", () => {
    const caption = "a".repeat(MAX_CAPTION_GRAPHEMES);
    const state = captionState(caption);
    expect(state.count).toBe(MAX_CAPTION_GRAPHEMES);
    expect(state.overLimit).toBe(false);
  });

  it("is over-limit one grapheme past the cap (301)", () => {
    const caption = "a".repeat(MAX_CAPTION_GRAPHEMES + 1);
    const state = captionState(caption);
    expect(state.count).toBe(MAX_CAPTION_GRAPHEMES + 1);
    expect(state.overLimit).toBe(true);
  });

  it("is not over-limit for an empty caption", () => {
    expect(captionState("").overLimit).toBe(false);
  });
});

describe("SHRINK_LADDER", () => {
  it("matches the exact pinned ladder, in order", () => {
    expect(SHRINK_LADDER).toEqual([
      { pixelRatio: 2, mimeType: "image/png" },
      { pixelRatio: 2, mimeType: "image/jpeg", quality: 0.9 },
      { pixelRatio: 1.5, mimeType: "image/jpeg", quality: 0.85 },
      { pixelRatio: 1, mimeType: "image/jpeg", quality: 0.8 },
    ]);
  });
});

describe("shrinkToCap", () => {
  it("takes the first rung when it already fits under the cap", () => {
    const calls: Array<{ pixelRatio: number; mimeType: string; quality?: number }> = [];
    const exportImage: ExportImageFn = (opts) => {
      calls.push(opts);
      return UNDER_CAP;
    };

    const result = shrinkToCap(exportImage);

    expect(result).toEqual({ dataUrl: UNDER_CAP });
    // Only the first rung was ever tried — no unnecessary re-exports.
    expect(calls).toEqual([SHRINK_LADDER[0]]);
  });

  it("falls through in ladder order when earlier rungs are over the cap", () => {
    const calls: Array<{ pixelRatio: number; mimeType: string; quality?: number }> = [];
    const exportImage: ExportImageFn = (opts) => {
      calls.push(opts);
      // First two rungs (png, jpeg@0.9) are over the cap; the third
      // (jpeg@0.85 at 1.5x) is the first one that fits.
      if (calls.length <= 2) return OVER_CAP;
      return UNDER_CAP;
    };

    const result = shrinkToCap(exportImage);

    expect(result).toEqual({ dataUrl: UNDER_CAP });
    expect(calls).toEqual(SHRINK_LADDER.slice(0, 3));
  });

  it("treats a null export (e.g. CORS-blocked canvas image) as a miss and tries the next rung", () => {
    const calls: Array<{ pixelRatio: number; mimeType: string; quality?: number }> = [];
    const exportImage: ExportImageFn = (opts) => {
      calls.push(opts);
      if (calls.length === 1) return null;
      return UNDER_CAP;
    };

    const result = shrinkToCap(exportImage);

    expect(result).toEqual({ dataUrl: UNDER_CAP });
    expect(calls.length).toBe(2);
  });

  it("returns {error} when every rung exceeds the cap", () => {
    const exportImage: ExportImageFn = () => OVER_CAP;

    const result = shrinkToCap(exportImage);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain(String(MAX_IMAGE_BYTES.toLocaleString()));
    }
  });

  it("returns {error} when every rung returns null", () => {
    const exportImage: ExportImageFn = () => null;

    const result = shrinkToCap(exportImage);

    expect("error" in result).toBe(true);
  });
});

describe("deriveAltDefault", () => {
  it("uses the headline text element's text when present", () => {
    const elements: SocialElement[] = [textElement("headline", "Fort Myers Beach stays hot")];
    expect(deriveAltDefault(elements)).toBe("Fort Myers Beach stays hot");
  });

  it("falls back to DEFAULT_ALT when there is no headline element", () => {
    const elements: SocialElement[] = [textElement("kicker", "SWFL Data Gulf")];
    expect(deriveAltDefault(elements)).toBe(DEFAULT_ALT);
  });

  it("falls back to DEFAULT_ALT when the headline element's text is blank", () => {
    const elements: SocialElement[] = [textElement("headline", "   ")];
    expect(deriveAltDefault(elements)).toBe(DEFAULT_ALT);
  });

  it("falls back to DEFAULT_ALT for an empty design", () => {
    expect(deriveAltDefault([])).toBe(DEFAULT_ALT);
  });
});
