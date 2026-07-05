// lib/media/hero-photo.test.ts
import { describe, it, expect } from "bun:test";
import { createHash } from "node:crypto";
import { HERO_MAX_BYTES, heroPhotoKey, mirrorHeroPhoto } from "./hero-photo";

const SRC = "https://ap.rdcpix.com/abc123l-m99s-w480_h360_x2.webp";
const HASH = createHash("sha256").update(SRC).digest("hex").slice(0, 24);

describe("heroPhotoKey", () => {
  it("keys by source-URL hash + ext from content-type (idempotent per source)", () => {
    expect(heroPhotoKey(SRC, "image/webp")).toBe(`hero-photos/${HASH}.webp`);
    expect(heroPhotoKey(SRC, "image/jpeg")).toBe(`hero-photos/${HASH}.jpg`);
  });
  it("tolerates a charset suffix and casing on the content-type", () => {
    expect(heroPhotoKey(SRC, "IMAGE/PNG; charset=binary")).toBe(`hero-photos/${HASH}.png`);
  });
  it("unmappable content-type → null (svg etc. never mirrors)", () => {
    expect(heroPhotoKey(SRC, "image/svg+xml")).toBeNull();
    expect(heroPhotoKey(SRC, "text/html")).toBeNull();
  });
});

describe("mirrorHeroPhoto", () => {
  it("fetch → verbatim upload → hosted URL, keyed by source hash", async () => {
    const bytes = Buffer.from("real-image-bytes");
    const uploaded: { key?: string; buf?: Buffer; contentType?: string } = {};
    const url = await mirrorHeroPhoto(SRC, {
      fetchImage: async () => ({ buf: bytes, contentType: "image/webp" }),
      upload: async (key, buf, contentType) => {
        Object.assign(uploaded, { key, buf, contentType });
        return `https://public.example.com/${key}`;
      },
    });
    expect(url).toBe(`https://public.example.com/hero-photos/${HASH}.webp`);
    expect(uploaded.key).toBe(`hero-photos/${HASH}.webp`);
    expect(uploaded.buf).toBe(bytes); // verbatim — no crop, no re-encode
    expect(uploaded.contentType).toBe("image/webp");
  });
  it("fetch failure → null (caller keeps the original URL, never breaks)", async () => {
    const url = await mirrorHeroPhoto(SRC, {
      fetchImage: async () => null,
      upload: async () => "unreachable",
    });
    expect(url).toBeNull();
  });
  it("oversize or empty body → null, upload never called", async () => {
    let uploadCalled = false;
    const deps = {
      upload: async () => {
        uploadCalled = true;
        return "x";
      },
    };
    expect(
      await mirrorHeroPhoto(SRC, {
        ...deps,
        fetchImage: async () => ({
          buf: Buffer.alloc(HERO_MAX_BYTES + 1),
          contentType: "image/jpeg",
        }),
      }),
    ).toBeNull();
    expect(
      await mirrorHeroPhoto(SRC, {
        ...deps,
        fetchImage: async () => ({ buf: Buffer.alloc(0), contentType: "image/jpeg" }),
      }),
    ).toBeNull();
    expect(uploadCalled).toBe(false);
  });
  it("upload throw → null (storage outage degrades, never blocks the build)", async () => {
    const url = await mirrorHeroPhoto(SRC, {
      fetchImage: async () => ({ buf: Buffer.from("bytes"), contentType: "image/png" }),
      upload: async () => {
        throw new Error("bucket down");
      },
    });
    expect(url).toBeNull();
  });
});
