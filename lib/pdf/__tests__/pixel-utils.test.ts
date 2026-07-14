// lib/pdf/__tests__/pixel-utils.test.ts
import { describe, expect, it } from "bun:test";
import { PNG } from "pngjs";
import {
  findContentBoundingBox,
  findMarkerBoundingBox,
  boundingBoxRatio,
  resizeNearestNeighbor,
  type Rgb,
} from "./pixel-utils";

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const MAGENTA: Rgb = { r: 255, g: 0, b: 255 };
const YELLOW: Rgb = { r: 255, g: 255, b: 0 };

/** A white png with a solid rectangle of `color` painted at [x0,x1) x [y0,y1). */
function pngWithRect(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: Rgb,
): PNG {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const inRect = x >= x0 && x < x1 && y >= y0 && y < y1;
      png.data[idx] = inRect ? color.r : 255;
      png.data[idx + 1] = inRect ? color.g : 255;
      png.data[idx + 2] = inRect ? color.b : 255;
      png.data[idx + 3] = 255;
    }
  }
  return png;
}

describe("findContentBoundingBox", () => {
  it("finds the box of a rectangle differing from a white background", () => {
    const png = pngWithRect(100, 100, 10, 20, 50, 70, MAGENTA);
    expect(findContentBoundingBox(png, WHITE)).toEqual({ x: 10, y: 20, width: 40, height: 50 });
  });

  it("returns null for an all-background image", () => {
    const png = pngWithRect(50, 50, 0, 0, 0, 0, MAGENTA);
    expect(findContentBoundingBox(png, WHITE)).toBeNull();
  });
});

describe("findMarkerBoundingBox", () => {
  it("finds the box spanning two different marker colors", () => {
    const png = new PNG({ width: 100, height: 40 });
    // left half magenta, right half yellow, rest of a taller canvas stays white
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 100; x++) {
        const idx = (100 * y + x) << 2;
        const inBand = y >= 5 && y < 35;
        const color = x < 50 ? MAGENTA : YELLOW;
        png.data[idx] = inBand ? color.r : 255;
        png.data[idx + 1] = inBand ? color.g : 255;
        png.data[idx + 2] = inBand ? color.b : 255;
        png.data[idx + 3] = 255;
      }
    }
    expect(findMarkerBoundingBox(png, [MAGENTA, YELLOW])).toEqual({
      x: 0,
      y: 5,
      width: 100,
      height: 30,
    });
  });

  it("returns null when no pixel matches any marker", () => {
    const png = pngWithRect(20, 20, 0, 0, 0, 0, MAGENTA);
    expect(findMarkerBoundingBox(png, [MAGENTA, YELLOW])).toBeNull();
  });

  it("ignores a background that differs from white (the case findContentBoundingBox can't handle)", () => {
    // whole canvas is navy EXCEPT a magenta rectangle — a single "background" color
    // reference would have to know it's navy, not white; findMarkerBoundingBox doesn't care.
    const NAVY: Rgb = { r: 15, g: 29, b: 36 };
    const png = new PNG({ width: 60, height: 60 });
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) {
        const idx = (60 * y + x) << 2;
        const inRect = x >= 20 && x < 40 && y >= 10 && y < 30;
        const c = inRect ? MAGENTA : NAVY;
        png.data[idx] = c.r;
        png.data[idx + 1] = c.g;
        png.data[idx + 2] = c.b;
        png.data[idx + 3] = 255;
      }
    }
    expect(findMarkerBoundingBox(png, [MAGENTA, YELLOW])).toEqual({
      x: 20,
      y: 10,
      width: 20,
      height: 20,
    });
  });
});

describe("boundingBoxRatio", () => {
  it("is width / height", () => {
    expect(boundingBoxRatio({ x: 0, y: 0, width: 400, height: 100 })).toBe(4);
  });
});

describe("resizeNearestNeighbor", () => {
  it("preserves a solid color when downsizing", () => {
    const png = pngWithRect(100, 100, 0, 0, 100, 100, MAGENTA);
    const resized = resizeNearestNeighbor(png, 10, 10);
    expect(resized.width).toBe(10);
    expect(resized.height).toBe(10);
    expect([resized.data[0], resized.data[1], resized.data[2]]).toEqual([255, 0, 255]);
  });

  it("preserves a 2x2 checkerboard's corner colors when upsizing", () => {
    const png = new PNG({ width: 2, height: 2 });
    const colors = [MAGENTA, YELLOW, YELLOW, MAGENTA]; // TL, TR, BL, BR
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const idx = (2 * y + x) << 2;
        const c = colors[y * 2 + x];
        png.data[idx] = c.r;
        png.data[idx + 1] = c.g;
        png.data[idx + 2] = c.b;
        png.data[idx + 3] = 255;
      }
    }
    const big = resizeNearestNeighbor(png, 40, 40);
    const at = (x: number, y: number) => {
      const idx = (40 * y + x) << 2;
      return [big.data[idx], big.data[idx + 1], big.data[idx + 2]];
    };
    expect(at(0, 0)).toEqual([255, 0, 255]); // TL magenta
    expect(at(39, 0)).toEqual([255, 255, 0]); // TR yellow
  });
});
