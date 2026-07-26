// components/email-lab/social/bluesky-post-bar-logic.ts
//
// Pure, DOM-free helpers for BlueskyPostBar (Task 5 of
// .superpowers/sdd/2026-07-26-bluesky-post-now/) — kept out of the component
// so they're unit-testable without mounting Konva/React. Two jobs:
//
//   1. captionState(caption) — the live "n/300" counter + over-limit flag
//      driving the red counter + disabled button. Reads MAX_CAPTION_GRAPHEMES
//      from lib/social/post-now-validate.ts (the ONE root the server's
//      validatePostNow also enforces) — never re-declared here.
//
//   2. shrinkToCap(exportImage) — the re-encode ladder (spec failure-mode 4).
//      Bluesky's app.bsky.embed.images caps an image at MAX_IMAGE_BYTES
//      (2 MB) DECODED. A full-resolution PNG export routinely blows past
//      that, so this re-exports the stage at decreasing pixelRatio/format/
//      quality until one fits, or reports failure — it never silently ships
//      an oversized image for the server to 413 on.
import {
  decodeDataUrl,
  graphemeCount,
  MAX_CAPTION_GRAPHEMES,
  MAX_IMAGE_BYTES,
} from "@/lib/social/post-now-validate";
import type { SocialElement } from "@/lib/social/design/types";

/** Mirrors the composer's existing stage-export shape
 *  (useSocialComposer.ts's exportPng → stage.toDataURL({ pixelRatio, mimeType })) —
 *  Konva's toDataURL also accepts a JPEG `quality`. Returns null on export
 *  failure (no stage mounted, or a CORS-blocked image on the canvas) — the
 *  ladder treats that rung as a miss and tries the next one, same as an
 *  oversized result. */
export type ExportImageFn = (opts: {
  pixelRatio: number;
  mimeType: string;
  quality?: number;
}) => string | null;

export interface ShrinkRung {
  pixelRatio: number;
  mimeType: string;
  quality?: number;
}

/** Highest quality first (2x PNG), then progressively cheaper JPEG
 *  re-encodes. ORDER IS LOAD-BEARING — the first rung whose decoded bytes
 *  fit wins, so reordering this changes which quality actually ships. Exact
 *  ladder pinned by the plan
 *  (.superpowers/sdd/2026-07-26-bluesky-post-now/task-5-brief.md). */
export const SHRINK_LADDER: readonly ShrinkRung[] = [
  { pixelRatio: 2, mimeType: "image/png" },
  { pixelRatio: 2, mimeType: "image/jpeg", quality: 0.9 },
  { pixelRatio: 1.5, mimeType: "image/jpeg", quality: 0.85 },
  { pixelRatio: 1, mimeType: "image/jpeg", quality: 0.8 },
];

export type ShrinkResult = { dataUrl: string } | { error: string };

/** Tries SHRINK_LADDER in order; returns the first data URL whose DECODED
 *  bytes are within MAX_IMAGE_BYTES. exportImage() returning null (stage not
 *  mounted / export blocked) or a malformed data URL both count as a miss on
 *  that rung, not a hard stop — the next rung still gets tried. All rungs
 *  missing (oversized or unavailable) is the one real failure. */
export function shrinkToCap(exportImage: ExportImageFn): ShrinkResult {
  for (const rung of SHRINK_LADDER) {
    const dataUrl = exportImage(rung);
    if (!dataUrl) continue;
    const decoded = decodeDataUrl(dataUrl);
    if (!decoded) continue;
    if (decoded.bytes.length <= MAX_IMAGE_BYTES) return { dataUrl };
  }
  return {
    error:
      `Couldn't shrink this card under Bluesky's ${MAX_IMAGE_BYTES.toLocaleString()}-byte image ` +
      "limit — try a simpler card (fewer/smaller photos on the canvas).",
  };
}

/** Live caption counter feeding the "n/300" display — red + button disabled
 *  past MAX_CAPTION_GRAPHEMES, the same cap the server enforces via
 *  validatePostNow (ONE root, not re-derived here). */
export function captionState(caption: string): { count: number; overLimit: boolean } {
  const count = graphemeCount(caption);
  return { count, overLimit: count > MAX_CAPTION_GRAPHEMES };
}

/** The server's own fallback (app/api/social/post-now/route.ts DEFAULT_ALT) —
 *  kept identical here so the client-side prefill and the server's
 *  last-resort default never drift apart. */
export const DEFAULT_ALT = "SWFL Data Gulf market card";

/** Card headline text if the composer model has one, else DEFAULT_ALT.
 *  templates.ts mints the headline text element with the deterministic id
 *  "headline" (its LOAD-BEARING comment: every template element carries a
 *  fixed, readable id, never a minted one) — so this is a stable lookup, not
 *  a heuristic over minted ids. */
export function deriveAltDefault(elements: readonly SocialElement[]): string {
  const headline = elements.find((e) => e.id === "headline" && e.type === "text");
  const text = headline && headline.type === "text" ? headline.text : undefined;
  return text && text.trim() ? text : DEFAULT_ALT;
}
