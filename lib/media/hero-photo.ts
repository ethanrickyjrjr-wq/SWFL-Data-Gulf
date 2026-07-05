// lib/media/hero-photo.ts — THE one root for mirroring hero images into our storage.
// Hero photos arrive from og:image resolution and listing-page scrapes — third-party
// CDNs (ap.rdcpix.com etc.) whose objects can die after a closing, turning a scheduled
// occurrence re-send into red X's. Mirror the resolved image VERBATIM (bytes untouched —
// og:image provenance is unknown; an agent's own site hero must never be watermark-cropped,
// that treatment stays scoped to listing-feed photos in lib/media/listing-photo.ts) into
// the public email-media bucket, keyed by a hash of the SOURCE URL so occurrence rebuilds
// upsert the same object. Failure → null; the caller keeps the ORIGINAL remote URL
// (degraded = hotlink risk stays, never a blocked build).
//
// Unlike listing-photo.ts this module needs no sharp, so a plain top-level import is safe
// from any server code. Never import from client-reachable code (service-role upload).
import { createHash } from "node:crypto";
import { hostEmailMedia } from "@/lib/email/chart-image";

/** Hero images are email-sized; anything past this is a misresolved asset, not a hero. */
export const HERO_MAX_BYTES = 10 * 1024 * 1024;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function heroPhotoKey(sourceUrl: string, contentType: string): string | null {
  const ext = EXT_BY_TYPE[contentType.split(";")[0].trim().toLowerCase()];
  if (!ext) return null;
  const hash = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 24);
  return `hero-photos/${hash}.${ext}`;
}

export interface FetchedImage {
  buf: Buffer;
  contentType: string;
}

export interface MirrorHeroDeps {
  /** Returns image bytes + content-type, or null on any miss (non-200, network). */
  fetchImage?: (url: string) => Promise<FetchedImage | null>;
  /** Uploads and returns the durable public URL. */
  upload?: (key: string, buf: Buffer, contentType: string) => Promise<string>;
}

async function defaultFetchImage(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;
    return { buf: Buffer.from(await res.arrayBuffer()), contentType };
  } catch {
    return null;
  }
}

/** Mirror a remote hero image into email-media; null on any failure so the
 *  caller keeps the original URL. Verbatim bytes — no crop, no re-encode. */
export async function mirrorHeroPhoto(
  sourceUrl: string,
  deps: MirrorHeroDeps = {},
): Promise<string | null> {
  const fetchImage = deps.fetchImage ?? defaultFetchImage;
  const upload = deps.upload ?? ((k: string, b: Buffer, ct: string) => hostEmailMedia(k, b, ct));
  const fetched = await fetchImage(sourceUrl);
  if (!fetched || fetched.buf.length === 0 || fetched.buf.length > HERO_MAX_BYTES) return null;
  const key = heroPhotoKey(sourceUrl, fetched.contentType);
  if (!key) return null;
  try {
    return await upload(key, fetched.buf, fetched.contentType.split(";")[0].trim().toLowerCase());
  } catch {
    return null;
  }
}

export type MirrorHeroPhoto = typeof mirrorHeroPhoto;
