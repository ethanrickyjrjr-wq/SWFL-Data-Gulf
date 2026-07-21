/**
 * lib/social/media-upload.ts
 *
 * Upload a rendered social card PNG to public Storage and return its public URL.
 *
 * WHY PUBLIC: every publish adapter consumes a URL, not bytes —
 *   - Meta + Instagram fetch the image SERVER-SIDE from a public URL
 *     (IG content-publishing REQUIRES a publicly reachable `image_url`);
 *   - X v2 media upload (`channels/x.ts:uploadMedia`) fetches the bytes from the
 *     URL before its chunked upload.
 * The card is already brand-watermarked + no-fabrication-gated by the renderer
 * (build 02), so the asset is safe to expose.
 *
 * Bucket: `social-media` (public). Created idempotently —
 * see docs/sql/20260620_social_media_bucket.sql.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_CACHE_MUTABLE } from "@/lib/media/cache-control";

export const SOCIAL_MEDIA_BUCKET = "social-media";

/**
 * Upload a PNG buffer to the social-media bucket and return its public URL.
 *
 * Idempotent per key (`upsert: true`) — a re-fire for the same schedule/date
 * overwrites rather than duplicating. The caller (cron worker) treats a thrown
 * error as non-fatal (posts without an image rather than skipping the row).
 *
 * @param db      service-role Supabase client (Storage upload bypasses RLS)
 * @param buffer  the rendered PNG bytes (from renderSocialImage)
 * @param key     storage path, e.g. `${scheduleId}/${YYYY-MM-DD}.png`
 * @returns the public, 200-fetchable URL of the uploaded object
 */
export async function uploadSocialImage(
  db: SupabaseClient,
  buffer: Buffer | Uint8Array,
  key: string,
): Promise<string> {
  const { error } = await db.storage.from(SOCIAL_MEDIA_BUCKET).upload(key, buffer, {
    contentType: "image/png",
    upsert: true,
    // MUTABLE, not IMMUTABLE: the key is `${scheduleId}/${YYYY-MM-DD}.png` with
    // upsert on, so a re-render the same day overwrites in place. Without any
    // cacheControl every platform fetch was billed as origin egress.
    cacheControl: MEDIA_CACHE_MUTABLE,
  });
  if (error) throw new Error(`uploadSocialImage failed for ${key}: ${error.message}`);

  const { data } = db.storage.from(SOCIAL_MEDIA_BUCKET).getPublicUrl(key);
  if (!data?.publicUrl) throw new Error(`uploadSocialImage: no public URL for ${key}`);
  return data.publicUrl;
}
