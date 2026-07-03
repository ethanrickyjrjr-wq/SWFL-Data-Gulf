// Media library helpers — the pure contracts behind /api/email-lab/media.
// Live auth + storage behaviour is verified manually on the real endpoint
// (pattern: app/api/email-lab/social/__tests__/upload.test.ts).
import { test, expect, describe } from "bun:test";
import sharp from "sharp";
import {
  MEDIA_MAX_WIDTH,
  attributionCaption,
  deriveMediaUpload,
  labMediaKey,
  storageKeyFromPublicUrl,
  toPanelItem,
  type MediaAssetRow,
} from "./media-assets";

describe("labMediaKey", () => {
  test("keys under the user's uid in the lab folder, jpg derivative", () => {
    expect(labMediaKey("user-1", "abc-123")).toBe("user-1/lab/abc-123.jpg");
  });
});

describe("deriveMediaUpload — research targets (≤1200px wide 2x retina, JPEG)", () => {
  test("downsizes an oversized image to the max width and emits JPEG", async () => {
    const input = await sharp({
      create: { width: 2400, height: 1200, channels: 3, background: { r: 200, g: 120, b: 40 } },
    })
      .png()
      .toBuffer();
    const out = await deriveMediaUpload(input);
    expect(out.width).toBe(MEDIA_MAX_WIDTH);
    expect(out.height).toBe(600); // aspect kept
    expect(out.buf[0]).toBe(0xff); // JPEG magic
    expect(out.buf[1]).toBe(0xd8);
  });

  test("leaves a small image at its native size", async () => {
    const input = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .png()
      .toBuffer();
    const out = await deriveMediaUpload(input);
    expect(out.width).toBe(640);
    expect(out.height).toBe(480);
  });

  test("rejects non-image bytes", async () => {
    await expect(deriveMediaUpload(Buffer.from("not an image"))).rejects.toThrow();
  });
});

describe("attribution + panel mapping", () => {
  test("Pexels attribution caption (citation culture)", () => {
    expect(attributionCaption({ photographer: "Dana Q" })).toBe("Photo by Dana Q on Pexels");
  });

  test("toPanelItem carries caption only for attributed assets", () => {
    const base: MediaAssetRow = {
      id: "a1",
      url: "https://x/img.jpg",
      kind: "upload",
      label: "Headshot",
      width: 600,
      height: 600,
      attribution: null,
      created_at: "2026-07-03T00:00:00Z",
    };
    expect(toPanelItem(base).caption).toBeUndefined();
    const pexels = toPanelItem({
      ...base,
      kind: "pexels",
      attribution: { photographer: "Dana Q", pexels_url: "https://www.pexels.com/photo/1" },
    });
    expect(pexels.caption).toBe("Photo by Dana Q on Pexels");
  });
});

describe("storageKeyFromPublicUrl — DELETE only removes our own objects", () => {
  test("extracts the key from an email-media public URL", () => {
    expect(
      storageKeyFromPublicUrl(
        "https://abc.supabase.co/storage/v1/object/public/email-media/user-1/lab/x.jpg",
      ),
    ).toBe("user-1/lab/x.jpg");
  });

  test("foreign URLs (Pexels CDN, other buckets) return null", () => {
    expect(storageKeyFromPublicUrl("https://images.pexels.com/photos/1/x.jpeg")).toBeNull();
    expect(
      storageKeyFromPublicUrl("https://abc.supabase.co/storage/v1/object/public/other/x.jpg"),
    ).toBeNull();
  });
});
