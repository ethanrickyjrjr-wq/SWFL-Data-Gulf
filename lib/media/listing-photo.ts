// lib/media/listing-photo.ts — THE one root for listing artifact photos.
// fetch the payload-carried photo_url VERBATIM (never edit CDN params — handoff
// §2.3/§5.4) → sharp trims the bottom watermark band → JPEG q80 → upsert to the
// public email-media bucket keyed by listing id + crop version. Email <img> and
// social card <image href> both reference the SAME derived file, so the crop is
// identical on both surfaces by construction. Failure → null; the caller keeps
// the ORIGINAL photo (degraded = watermark visible, never a broken artifact).
//
// SERVER-ONLY (sharp is a native dep): never import this from client-reachable
// code. lib/listings/select.ts takes deriveListingPhoto via a param and imports
// only the type.
//
// sharp is loaded LAZILY inside cropWatermarkBand, never at module top level: a
// top-level import means a native-binding load failure (07/03/2026 prod outage —
// libvips .so missing from the traced bundle) 500s EVERY route that transitively
// imports this module, including ones that never touch a photo. Lazy keeps the
// designed degradation: photo derivation fails → null → original photo kept.
import { hostEmailMedia } from "@/lib/email/chart-image";

/** Crop tuning. bottomFraction was tuned against the Latitude 26 fixture photos
 *  (bottom-corner feed watermark). Retuning bumps `version` — a NEW storage key —
 *  so rebuilds upsert fresh derivatives and stale ones are inert. Operator policy
 *  (07/02/2026, recorded in the spec): crop applies to ALL listing photos. */
export const WATERMARK_CROP = { bottomFraction: 0.08, version: 1 } as const;

export function listingPhotoKey(
  listingId: string,
  version: number = WATERMARK_CROP.version,
): string {
  const safe = listingId.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `listing-photos/${safe}-v${version}.jpg`;
}

/** Pure transform: bytes in → cropped JPEG bytes out. Throws on unreadable input. */
export async function cropWatermarkBand(input: Buffer): Promise<Buffer> {
  const { default: sharp } = await import("sharp");
  const img = sharp(input);
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("unreadable image");
  const height = Math.max(1, Math.round(meta.height * (1 - WATERMARK_CROP.bottomFraction)));
  return img
    .extract({ left: 0, top: 0, width: meta.width, height })
    .jpeg({ quality: 80 })
    .toBuffer();
}

export interface DerivePhotoDeps {
  /** Returns raw image bytes, or null on any miss (non-200, non-image, network). */
  fetchImage?: (url: string) => Promise<Buffer | null>;
  /** Uploads and returns the durable public URL. */
  upload?: (key: string, buf: Buffer) => Promise<string>;
}

async function defaultFetchImage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function deriveListingPhoto(
  args: { listingId: string; photoUrl: string },
  deps: DerivePhotoDeps = {},
): Promise<string | null> {
  const fetchImage = deps.fetchImage ?? defaultFetchImage;
  const upload = deps.upload ?? ((k: string, b: Buffer) => hostEmailMedia(k, b, "image/jpeg"));
  const raw = await fetchImage(args.photoUrl);
  if (!raw) return null;
  try {
    const jpeg = await cropWatermarkBand(raw);
    return await upload(listingPhotoKey(args.listingId), jpeg);
  } catch {
    return null;
  }
}

export type DeriveListingPhoto = typeof deriveListingPhoto;
