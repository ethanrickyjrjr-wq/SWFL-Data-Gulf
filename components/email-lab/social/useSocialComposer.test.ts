import { test, expect } from "bun:test";
import { chartLoadingElement, isExportStale } from "./useSocialComposer";
import { newDesign } from "@/lib/social/design/serialize";

test("chartLoadingElement: a freshly added chart has an empty src synchronously (UI never blocks on the async build)", () => {
  const el = chartLoadingElement("blk_test");
  expect(el.type).toBe("chart");
  expect(el.id).toBe("blk_test");
  expect(el.src).toBe(""); // renders the grey placeholder immediately
  expect(el.spec).toBeNull();
  expect(el.width).toBeGreaterThan(0);
  expect(el.height).toBeGreaterThan(0);
});

// openSchedule must not reuse a PNG exported before the canvas was edited — every
// mutator (updateElement/addElement/deleteSelected/addChart/applyPhotoUrl/fill/
// setFormat/…) replaces `design` with a new object, so reference inequality is the
// signal openSchedule uses to force a fresh export instead of scheduling stale art.
test("isExportStale: unedited design since export is NOT stale (cache reused, no redundant re-export)", () => {
  const design = newDesign("portrait");
  expect(isExportStale(design, design)).toBe(false);
});

test("isExportStale: any edit after export IS stale (openSchedule must re-export, not ship the old PNG)", () => {
  const original = newDesign("portrait");
  const edited = { ...original, elements: [...original.elements] }; // what every mutator does
  expect(isExportStale(original, edited)).toBe(true);
});

test("isExportStale: never exported yet (mediaUrl null) IS stale — forces the first export", () => {
  const design = newDesign("portrait");
  expect(isExportStale(null, design)).toBe(true);
});
