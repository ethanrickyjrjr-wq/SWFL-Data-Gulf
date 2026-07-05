// lib/social-pulse/terms.test.ts
import { test, expect } from "bun:test";
import { PULSE_TERMS, AREA_LABELS } from "./terms";

test("term set is within the spec budget (12-16) and every area bucket is covered", () => {
  expect(PULSE_TERMS.length).toBeGreaterThanOrEqual(12);
  expect(PULSE_TERMS.length).toBeLessThanOrEqual(16);
  const areas = new Set(PULSE_TERMS.map((t) => t.area));
  for (const area of Object.keys(AREA_LABELS)) expect(areas.has(area as never)).toBe(true);
});

test("hashtag terms carry no # prefix (the API takes bare names) and terms are unique", () => {
  for (const t of PULSE_TERMS) expect(t.term.startsWith("#")).toBe(false);
  expect(new Set(PULSE_TERMS.map((t) => t.term)).size).toBe(PULSE_TERMS.length);
});
