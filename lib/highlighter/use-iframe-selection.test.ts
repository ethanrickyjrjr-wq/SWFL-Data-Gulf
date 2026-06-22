import { test, expect } from "bun:test";
import { translateRect } from "./use-iframe-selection";

test("translateRect: offsets selection rect by iframe position", () => {
  const result = translateRect(
    { top: 100, left: 50 },
    { top: 20, left: 30, width: 80, height: 16 },
  );
  expect(result).toEqual({ top: 120, left: 80, width: 80, height: 16 });
});

test("translateRect: iframe at origin passes rect through unchanged", () => {
  const result = translateRect({ top: 0, left: 0 }, { top: 5, left: 10, width: 200, height: 24 });
  expect(result).toEqual({ top: 5, left: 10, width: 200, height: 24 });
});

test("translateRect: preserves width and height unchanged", () => {
  const result = translateRect(
    { top: 50, left: 50 },
    { top: 10, left: 10, width: 300, height: 32 },
  );
  expect(result.width).toBe(300);
  expect(result.height).toBe(32);
});
