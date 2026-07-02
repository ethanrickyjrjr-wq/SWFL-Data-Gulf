// lib/media/listing-photo.test.ts
import { describe, it, expect } from "bun:test";
import sharp from "sharp";
import {
  WATERMARK_CROP,
  listingPhotoKey,
  cropWatermarkBand,
  deriveListingPhoto,
} from "./listing-photo";

/** A real in-memory 200x100 JPEG so the crop math is exercised end-to-end. */
async function fixtureJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 200, height: 100, channels: 3, background: { r: 200, g: 30, b: 30 } },
  })
    .jpeg()
    .toBuffer();
}

describe("listingPhotoKey", () => {
  it("keys by sanitized listing id + crop version", () => {
    expect(listingPhotoKey("abc-123")).toBe(
      `listing-photos/abc-123-v${WATERMARK_CROP.version}.jpg`,
    );
  });
  it("sanitizes ids that would break a storage key", () => {
    expect(listingPhotoKey("a/b?c d")).toBe(
      `listing-photos/a_b_c_d-v${WATERMARK_CROP.version}.jpg`,
    );
  });
  it("a version bump changes the key (retune = new derivative, old ones inert)", () => {
    expect(listingPhotoKey("abc", 2)).toBe("listing-photos/abc-v2.jpg");
  });
});

describe("cropWatermarkBand", () => {
  it("trims the bottom band and outputs JPEG", async () => {
    const out = await cropWatermarkBand(await fixtureJpeg());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(200);
    // 100 * (1 - bottomFraction)
    expect(meta.height).toBe(Math.round(100 * (1 - WATERMARK_CROP.bottomFraction)));
  });
  it("throws on a non-image buffer (deriveListingPhoto turns this into null)", async () => {
    await expect(cropWatermarkBand(Buffer.from("not an image"))).rejects.toThrow();
  });
});

describe("deriveListingPhoto", () => {
  it("fetch → crop → upload → hosted URL, keyed by listing id", async () => {
    const jpeg = await fixtureJpeg();
    const uploaded: { key?: string; bytes?: number } = {};
    const url = await deriveListingPhoto(
      { listingId: "L1", photoUrl: "https://cdn.example.com/photo.jpg" },
      {
        fetchImage: async () => jpeg,
        upload: async (key, buf) => {
          uploaded.key = key;
          uploaded.bytes = buf.length;
          return `https://public.example.com/${key}`;
        },
      },
    );
    expect(url).toBe(`https://public.example.com/listing-photos/L1-v${WATERMARK_CROP.version}.jpg`);
    expect(uploaded.key).toBe(`listing-photos/L1-v${WATERMARK_CROP.version}.jpg`);
    expect(uploaded.bytes).toBeGreaterThan(0);
  });
  it("fetch failure → null (caller keeps the original photo, never breaks)", async () => {
    const url = await deriveListingPhoto(
      { listingId: "L1", photoUrl: "https://cdn.example.com/gone.jpg" },
      { fetchImage: async () => null, upload: async () => "unreachable" },
    );
    expect(url).toBeNull();
  });
  it("un-processable bytes → null, upload never called", async () => {
    let uploadCalled = false;
    const url = await deriveListingPhoto(
      { listingId: "L1", photoUrl: "https://cdn.example.com/x.jpg" },
      {
        fetchImage: async () => Buffer.from("junk"),
        upload: async () => {
          uploadCalled = true;
          return "x";
        },
      },
    );
    expect(url).toBeNull();
    expect(uploadCalled).toBe(false);
  });
});
