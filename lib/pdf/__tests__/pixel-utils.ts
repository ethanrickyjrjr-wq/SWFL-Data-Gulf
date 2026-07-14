// lib/pdf/__tests__/pixel-utils.ts — PURE. Pixel-buffer primitives shared by the
// PDF/HTML visual-parity suite. No I/O, no rendering — just RGBA buffer math,
// so these are tested with hand-built synthetic PNGs, not real renders.
import { PNG } from "pngjs";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function maxChannelDistance(r: number, g: number, b: number, c: Rgb): number {
  return Math.max(Math.abs(r - c.r), Math.abs(g - c.g), Math.abs(b - c.b));
}

function scanBoundingBox(
  png: PNG,
  matches: (r: number, g: number, b: number) => boolean,
): BoundingBox | null {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2;
      if (matches(png.data[idx], png.data[idx + 1], png.data[idx + 2])) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Bounding box of pixels DIFFERING from `background` by more than `threshold`
 *  (max-channel distance, 0-255). Only meaningful when the raster has ONE
 *  uniform background color surrounding the content of interest — use
 *  `findMarkerBoundingBox` when that doesn't hold (e.g. a dark band on a
 *  light page). */
export function findContentBoundingBox(
  png: PNG,
  background: Rgb,
  threshold = 32,
): BoundingBox | null {
  return scanBoundingBox(png, (r, g, b) => maxChannelDistance(r, g, b, background) > threshold);
}

/** Bounding box of pixels MATCHING any of `markers` within `threshold`. Robust
 *  regardless of what surrounds the marked content, since it looks for the
 *  marker color itself rather than "isn't the background." */
export function findMarkerBoundingBox(
  png: PNG,
  markers: Rgb[],
  threshold = 32,
): BoundingBox | null {
  return scanBoundingBox(png, (r, g, b) =>
    markers.some((m) => maxChannelDistance(r, g, b, m) <= threshold),
  );
}

export function boundingBoxRatio(box: BoundingBox): number {
  return box.width / box.height;
}

/** Nearest-neighbor resize — no new image-processing dependency. Only used to
 *  bring two differently-sized rasters (a PDF page vs. an HTML screenshot) to
 *  a common size before pixelmatch, which requires identical dimensions. */
export function resizeNearestNeighbor(png: PNG, width: number, height: number): PNG {
  const out = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    const srcY = Math.min(png.height - 1, Math.floor((y * png.height) / height));
    for (let x = 0; x < width; x++) {
      const srcX = Math.min(png.width - 1, Math.floor((x * png.width) / width));
      const srcIdx = (png.width * srcY + srcX) << 2;
      const dstIdx = (width * y + x) << 2;
      out.data[dstIdx] = png.data[srcIdx];
      out.data[dstIdx + 1] = png.data[srcIdx + 1];
      out.data[dstIdx + 2] = png.data[srcIdx + 2];
      out.data[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  return out;
}
