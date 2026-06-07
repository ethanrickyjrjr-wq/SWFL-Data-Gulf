import { test, expect } from "bun:test";
import { popupPosition } from "./position";

const VP = { width: 1000, height: 800 };
const POPUP = { width: 320, height: 240 };

function within(pos: { top: number; left: number }) {
  expect(pos.left).toBeGreaterThanOrEqual(0);
  expect(pos.top).toBeGreaterThanOrEqual(0);
  expect(pos.left + POPUP.width).toBeLessThanOrEqual(VP.width);
  expect(pos.top + POPUP.height).toBeLessThanOrEqual(VP.height);
}

test("prefers the right of the anchor", () => {
  const anchor = { top: 100, left: 100, width: 80, height: 20 };
  const pos = popupPosition(anchor, POPUP, VP);
  // right edge of anchor (180) + 12 gutter = 192
  expect(pos.left).toBe(192);
  within(pos);
});

test("flips left when the anchor is near the right edge", () => {
  const anchor = { top: 100, left: 900, width: 80, height: 20 };
  const pos = popupPosition(anchor, POPUP, VP);
  // right would be 992 + 320 > 1000 → flip left: 900 - 12 - 320 = 568
  expect(pos.left).toBe(568);
  within(pos);
});

test("drops below when aligning to top would overflow the bottom", () => {
  const anchor = { top: 700, left: 100, width: 80, height: 20 };
  const pos = popupPosition(anchor, POPUP, VP);
  // 700 + 240 > 800 → below: 700 + 20 + 12 = 732, then clamped to fit
  expect(pos.top + POPUP.height).toBeLessThanOrEqual(VP.height);
  within(pos);
});

test("near top-left stays on screen", () => {
  const anchor = { top: 0, left: 0, width: 40, height: 16 };
  const pos = popupPosition(anchor, POPUP, VP);
  within(pos);
});

test("centers horizontally when neither side fits", () => {
  const narrow = { width: 360, height: 800 };
  const wide = { width: 320, height: 240 };
  const anchor = { top: 100, left: 20, width: 320, height: 20 };
  const pos = popupPosition(anchor, wide, narrow);
  // right (352+320>360) and left (20-12-320<0) both fail → centered
  expect(pos.left).toBeGreaterThanOrEqual(0);
  expect(pos.left + wide.width).toBeLessThanOrEqual(narrow.width);
});
