/**
 * lib/social/post-now-validate.ts
 *
 * Validation for the "Post to Bluesky" (post-now) flow — the API route
 * (server) and the client composer UI both import this module directly, so
 * it is deliberately DEPENDENCY-FREE: Web APIs only (Intl.Segmenter, atob,
 * crypto.subtle). No `Buffer`, no Node-only APIs — the same file has to run
 * unmodified in a browser bundle and in the Bun/Node API route.
 *
 * Caps — verified in-session (RULE 0.4) against the live AT Protocol lexicons,
 * not memory or the plan doc:
 *   - MAX_CAPTION_GRAPHEMES = 300 ← `text.maxGraphemes` in
 *     app.bsky.feed.post (github.com/bluesky-social/atproto,
 *     lexicons/app/bsky/feed/post.json). Measured in grapheme clusters, not
 *     UTF-16 code units or JS string .length — an emoji family like
 *     "👨‍👩‍👧‍👦" is one grapheme but many code units.
 *   - MAX_IMAGE_BYTES = 2_000_000 ← `images[].image.maxSize` in
 *     app.bsky.embed.images (same repo,
 *     lexicons/app/bsky/embed/images.json): "May be up to 2 MB, formerly
 *     limited to 1 MB."
 */

export const MAX_CAPTION_GRAPHEMES = 300;
export const MAX_IMAGE_BYTES = 2_000_000;

// Constructed once at module load — Task 5's live composer counter calls
// graphemeCount() on every keystroke; a per-call Segmenter would rebuild
// this on each one.
const GRAPHEME_SEGMENTER = new Intl.Segmenter("en", { granularity: "grapheme" });

export type PostNowInvalid = { ok: false; status: 400 | 413; error: string };
export type PostNowValid = { ok: true; bytes: Uint8Array | null; mime: string | null };

/**
 * Count grapheme clusters (user-perceived characters) in a string.
 * Uses Intl.Segmenter so multi-codepoint sequences (ZWJ emoji families,
 * combining marks, etc.) count as ONE character, matching how Bluesky
 * itself measures post length.
 */
export function graphemeCount(s: string): number {
  let count = 0;
  for (const _ of GRAPHEME_SEGMENTER.segment(s)) count++;
  return count;
}

const DATA_URL_RE = /^data:([^;,]+);base64,([\s\S]*)$/;

/**
 * Decode a `data:<mime>;base64,<payload>` URL into raw bytes + mime type.
 * Returns null for anything malformed OR whose mime is not `image/*` —
 * both cases the caller treats identically (reject the upload).
 */
export function decodeDataUrl(d: string): { bytes: Uint8Array; mime: string } | null {
  const match = DATA_URL_RE.exec(d);
  if (!match) return null;

  const mime = match[1];
  const base64 = match[2];
  if (!mime.startsWith("image/")) return null;

  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return null;
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, mime };
}

/**
 * sha256 hex digest of caption + image bytes (if any) — used as a dedupe /
 * idempotency key so the same post-now submission isn't published twice.
 */
export async function contentHash(caption: string, bytes: Uint8Array | null): Promise<string> {
  const encoder = new TextEncoder();
  const captionBytes = encoder.encode(caption);
  const imageBytes = bytes ?? new Uint8Array(0);

  const combined = new Uint8Array(captionBytes.length + 1 + imageBytes.length);
  combined.set(captionBytes, 0);
  // Separator byte between caption and image bytes so e.g. caption "ab" + no
  // image can never collide with caption "a" + image bytes starting with "b".
  combined[captionBytes.length] = 0;
  combined.set(imageBytes, captionBytes.length + 1);

  const digest = await crypto.subtle.digest("SHA-256", combined);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validate a post-now submission. Caption grapheme cap → 400. Image byte
 * cap or malformed/non-image data URL → 400/413 as noted below. Both error
 * messages name the actual measured count, per the spec.
 */
export function validatePostNow(input: {
  caption: string;
  imageDataUrl?: string;
}): PostNowInvalid | PostNowValid {
  const count = graphemeCount(input.caption);
  if (count > MAX_CAPTION_GRAPHEMES) {
    return {
      ok: false,
      status: 400,
      error: `Caption is ${count} characters, over the ${MAX_CAPTION_GRAPHEMES} limit.`,
    };
  }

  if (!input.imageDataUrl) {
    return { ok: true, bytes: null, mime: null };
  }

  const decoded = decodeDataUrl(input.imageDataUrl);
  if (!decoded) {
    return {
      ok: false,
      status: 400,
      error: "Image must be a valid image/* data URL.",
    };
  }

  if (decoded.bytes.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `Image is ${decoded.bytes.length} bytes, over the ${MAX_IMAGE_BYTES} limit.`,
    };
  }

  return { ok: true, bytes: decoded.bytes, mime: decoded.mime };
}
