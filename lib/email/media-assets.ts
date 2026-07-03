// lib/email/media-assets.ts — the Email Lab media library's pure core.
//
// Upload derivative targets come from the author-layout-recipes research pass
// (Scalero image mechanics, 07/02/2026): ≤1200px wide = 2x retina for the 600px
// email canvas, JPEG-compressed toward ~100KB. Rows live in email_media_assets
// (RLS per user); Pexels picks hotlink the Pexels CDN and carry attribution —
// "Photo by X on Pexels" rides the image caption, matching citation culture.
//
// SERVER-ONLY (sharp is a native dep): never import from client components —
// the lab panel consumes the route's JSON, not this module.
import sharp from "sharp";

/** 2x retina for the 600px canvas. */
export const MEDIA_MAX_WIDTH = 1200;
/** Tuned toward the ≤~100KB per-image research target for typical photos. */
export const MEDIA_JPEG_QUALITY = 78;

/** Storage key for a lab upload's derivative (email-media bucket). */
export function labMediaKey(userId: string, uuid: string): string {
  return `${userId}/lab/${uuid}.jpg`;
}

export interface MediaDerivative {
  buf: Buffer;
  width: number;
  height: number;
}

/** Resize to ≤MEDIA_MAX_WIDTH (EXIF-honoring), JPEG-compress. Throws on
 *  unreadable input — the route answers 400, never stores junk. */
export async function deriveMediaUpload(input: Buffer): Promise<MediaDerivative> {
  const img = sharp(input).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height) throw new Error("unreadable image");
  const pipeline = meta.width > MEDIA_MAX_WIDTH ? img.resize({ width: MEDIA_MAX_WIDTH }) : img;
  const buf = await pipeline.jpeg({ quality: MEDIA_JPEG_QUALITY, mozjpeg: true }).toBuffer();
  const outMeta = await sharp(buf).metadata();
  return { buf, width: outMeta.width ?? 0, height: outMeta.height ?? 0 };
}

export interface PexelsAttribution {
  photographer: string;
  photographer_url?: string;
  pexels_url?: string;
}

/** The email_media_assets row shape the routes read/write. */
export interface MediaAssetRow {
  id: string;
  url: string;
  kind: string;
  label: string;
  width: number | null;
  height: number | null;
  attribution: PexelsAttribution | null;
  created_at: string;
}

export interface MediaPanelItem {
  id: string;
  url: string;
  kind: string;
  label: string;
  width?: number;
  height?: number;
  /** Ready-made attribution caption (Pexels picks) — rides the image caption. */
  caption?: string;
}

/** Pexels license asks for credit; unlimited free tier requires it. ONE root. */
export function attributionCaption(a: PexelsAttribution): string {
  return `Photo by ${a.photographer} on Pexels`;
}

/** Row → what the lab panel renders. Pure. */
export function toPanelItem(row: MediaAssetRow): MediaPanelItem {
  return {
    id: row.id,
    url: row.url,
    kind: row.kind,
    label: row.label,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    caption: row.attribution?.photographer ? attributionCaption(row.attribution) : undefined,
  };
}

const PUBLIC_PREFIX = "/storage/v1/object/public/email-media/";

/** Extract our bucket key from an email-media public URL — null for anything
 *  else (Pexels CDN, other buckets), so DELETE can never touch a foreign object. */
export function storageKeyFromPublicUrl(url: string): string | null {
  const i = url.indexOf(PUBLIC_PREFIX);
  if (i === -1) return null;
  const key = url.slice(i + PUBLIC_PREFIX.length);
  return key.length > 0 ? key : null;
}
