// lib/social/chart-image.ts
//
// Social's chart-PNG hosting. The Konva canvas LOADS this PNG (crossOrigin
// "anonymous") and must keep stage.toDataURL() untainted on export — so the chart
// is hosted in `email-media`, the SAME public bucket the composer already loads
// listing + library photos from (deriveListingPhoto / the project email-media
// route). That bucket's round-trip through the canvas is already exercised in
// production by every photo-bearing post; the finished-post OUTPUT bucket
// (`social-media`) is a write-only sink never loaded back into Konva, so it is the
// wrong home for a canvas-loaded asset. One line, but the bucket choice is the
// whole point (spec §7) — do not "upgrade" this to social-media.
import { hostEmailPng } from "@/lib/email/chart-image";

export async function hostSocialChartPng(key: string, png: Buffer): Promise<string> {
  return hostEmailPng(key, png);
}
