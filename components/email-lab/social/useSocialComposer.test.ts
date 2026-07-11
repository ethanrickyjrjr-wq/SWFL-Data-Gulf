import { test, expect } from "bun:test";
import { chartLoadingElement } from "./useSocialComposer";

test("chartLoadingElement: a freshly added chart has an empty src synchronously (UI never blocks on the async build)", () => {
  const el = chartLoadingElement("blk_test");
  expect(el.type).toBe("chart");
  expect(el.id).toBe("blk_test");
  expect(el.src).toBe(""); // renders the grey placeholder immediately
  expect(el.spec).toBeNull();
  expect(el.width).toBeGreaterThan(0);
  expect(el.height).toBeGreaterThan(0);
});
