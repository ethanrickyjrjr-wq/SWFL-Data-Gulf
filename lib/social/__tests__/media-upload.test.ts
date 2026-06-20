/**
 * lib/social/__tests__/media-upload.test.ts
 *
 * Round-trip unit tests for uploadSocialImage (mocked Storage — no live calls).
 */
import { describe, expect, it } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadSocialImage, SOCIAL_MEDIA_BUCKET } from "../media-upload";

interface MockOpts {
  uploadError?: { message: string };
  /** undefined → default URL; null → simulate a missing public URL */
  publicUrl?: string | null;
}

function mockDb(opts: MockOpts) {
  const calls: {
    bucket?: string;
    uploadKey?: string;
    uploadBody?: unknown;
    fileOpts?: unknown;
    publicUrlKey?: string;
  } = {};

  const db = {
    storage: {
      from(bucket: string) {
        calls.bucket = bucket;
        return {
          async upload(key: string, body: unknown, fileOpts: unknown) {
            calls.uploadKey = key;
            calls.uploadBody = body;
            calls.fileOpts = fileOpts;
            return {
              data: opts.uploadError ? null : { path: key },
              error: opts.uploadError ?? null,
            };
          },
          getPublicUrl(key: string) {
            calls.publicUrlKey = key;
            const publicUrl =
              opts.publicUrl === undefined
                ? `https://cdn.example.com/storage/v1/object/public/${bucket}/${key}`
                : opts.publicUrl;
            return { data: { publicUrl } };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  return { db, calls };
}

describe("uploadSocialImage", () => {
  it("uploads PNG with upsert + image/png content-type and returns the public URL", async () => {
    const { db, calls } = mockDb({});
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    const url = await uploadSocialImage(db, buf, "42/2026-06-20.png");

    expect(url).toBe(
      "https://cdn.example.com/storage/v1/object/public/social-media/42/2026-06-20.png",
    );
    expect(calls.bucket).toBe(SOCIAL_MEDIA_BUCKET);
    expect(calls.uploadKey).toBe("42/2026-06-20.png");
    expect(calls.fileOpts).toEqual({ contentType: "image/png", upsert: true });
    expect(calls.uploadBody).toBe(buf);
    expect(calls.publicUrlKey).toBe("42/2026-06-20.png");
  });

  it("throws on Storage upload error (caller treats it as non-fatal)", async () => {
    const { db } = mockDb({ uploadError: { message: "bucket not found" } });
    await expect(uploadSocialImage(db, Buffer.from([1]), "k.png")).rejects.toThrow(
      /bucket not found/,
    );
  });

  it("throws when Storage returns no public URL", async () => {
    const { db } = mockDb({ publicUrl: null });
    await expect(uploadSocialImage(db, Buffer.from([1]), "k.png")).rejects.toThrow(/no public URL/);
  });
});
