import { describe, expect, it } from "bun:test";
import {
  MAX_CAPTION_GRAPHEMES,
  MAX_IMAGE_BYTES,
  contentHash,
  decodeDataUrl,
  graphemeCount,
  validatePostNow,
} from "./post-now-validate";

/**
 * post-now-validate — grapheme cap, byte cap, dedupe hash.
 * Dependency-free (Web APIs only: Intl.Segmenter, atob, crypto.subtle) so
 * lib/social/post-now-validate.ts can be imported by both the API route
 * (server) and the client UI (browser bundle) without pulling in Node-only
 * APIs like Buffer.
 */

// A tiny valid 1x1 transparent PNG, base64-encoded.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("graphemeCount", () => {
  it("counts plain ASCII characters 1:1", () => {
    expect(graphemeCount("hello")).toBe(5);
  });

  it("counts an emoji family (ZWJ sequence) as a single grapheme", () => {
    expect(graphemeCount("👨‍👩‍👧‍👦")).toBe(1);
  });

  it("counts an empty string as zero", () => {
    expect(graphemeCount("")).toBe(0);
  });
});

describe("decodeDataUrl", () => {
  it("decodes a valid image/png data URL to bytes + mime", () => {
    const result = decodeDataUrl(`data:image/png;base64,${TINY_PNG_B64}`);
    expect(result).not.toBeNull();
    expect(result!.mime).toBe("image/png");
    expect(result!.bytes).toBeInstanceOf(Uint8Array);
    expect(result!.bytes.length).toBeGreaterThan(0);
  });

  it("returns null for a non-image mime type", () => {
    const result = decodeDataUrl("data:text/html;base64,PGgxPmhpPC9oMT4=");
    expect(result).toBeNull();
  });

  it("returns null for a malformed data URL", () => {
    expect(decodeDataUrl("not-a-data-url")).toBeNull();
  });

  it("returns null for a data URL with invalid base64", () => {
    expect(decodeDataUrl("data:image/png;base64,***not-valid-base64***")).toBeNull();
  });
});

describe("contentHash", () => {
  it("is stable for the same input", async () => {
    const a = await contentHash("hello world", null);
    const b = await contentHash("hello world", null);
    expect(a).toBe(b);
  });

  it("differs for different captions", async () => {
    const a = await contentHash("hello world", null);
    const b = await contentHash("goodbye world", null);
    expect(a).not.toBe(b);
  });

  it("differs when image bytes differ but caption is the same", async () => {
    const a = await contentHash("same caption", new Uint8Array([1, 2, 3]));
    const b = await contentHash("same caption", new Uint8Array([4, 5, 6]));
    expect(a).not.toBe(b);
  });

  it("returns a sha256 hex string (64 lowercase hex chars)", async () => {
    const h = await contentHash("hello world", null);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("validatePostNow", () => {
  it("accepts a caption at exactly the grapheme cap", () => {
    const caption = "a".repeat(MAX_CAPTION_GRAPHEMES);
    const result = validatePostNow({ caption });
    expect(result.ok).toBe(true);
  });

  it("rejects a caption one grapheme over the cap, naming the count", () => {
    const caption = "a".repeat(MAX_CAPTION_GRAPHEMES + 1);
    const result = validatePostNow({ caption });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain(String(MAX_CAPTION_GRAPHEMES + 1));
    }
  });

  it("is valid with bytes: null when no image is provided (caption-only)", () => {
    const result = validatePostNow({ caption: "hello" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes).toBeNull();
      expect(result.mime).toBeNull();
    }
  });

  it("accepts a caption + a valid, under-cap image", () => {
    const result = validatePostNow({
      caption: "hello",
      imageDataUrl: `data:image/png;base64,${TINY_PNG_B64}`,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes).toBeInstanceOf(Uint8Array);
      expect(result.mime).toBe("image/png");
    }
  });

  it("rejects an over-cap image with status 413, naming the exact byte count", () => {
    // 4,000,000 base64 chars (a multiple of 4) decode to exactly 3,000,000
    // bytes — past MAX_IMAGE_BYTES. The error must name that measured
    // count, not just echo the configured cap.
    const chunk = "A".repeat(4_000_000);
    const decodedByteLength = (chunk.length / 4) * 3;
    expect(decodedByteLength).toBeGreaterThan(MAX_IMAGE_BYTES);

    const result = validatePostNow({
      caption: "hello",
      imageDataUrl: `data:image/png;base64,${chunk}`,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error).toContain(String(decodedByteLength));
    }
  });

  it("rejects a malformed/non-image data URL with a 400", () => {
    const result = validatePostNow({
      caption: "hello",
      imageDataUrl: "data:text/html;base64,PGgxPmhpPC9oMT4=",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });
});
