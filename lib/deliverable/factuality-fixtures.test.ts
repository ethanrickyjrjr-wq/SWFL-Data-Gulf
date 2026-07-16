import { describe, expect, test } from "bun:test";
import { FACTUALITY_FIXTURES } from "./factuality-fixtures";

describe("factuality fixture set (structural — no API calls)", () => {
  test("has at least 12 fixtures with unique ids", () => {
    expect(FACTUALITY_FIXTURES.length).toBeGreaterThanOrEqual(12);
    const ids = FACTUALITY_FIXTURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("covers all five classes (spec D3) and both verdicts", () => {
    const classes = new Set(FACTUALITY_FIXTURES.map((f) => f.cls));
    for (const c of ["a", "b", "c", "d", "e"] as const) expect(classes.has(c)).toBe(true);
    expect(FACTUALITY_FIXTURES.some((f) => f.expectPass)).toBe(true);
    expect(FACTUALITY_FIXTURES.some((f) => !f.expectPass)).toBe(true);
  });

  test("every fixture is fully authored", () => {
    for (const f of FACTUALITY_FIXTURES) {
      expect(f.reference.length).toBeGreaterThan(20);
      expect(f.completion.length).toBeGreaterThan(10);
      expect(f.note.length).toBeGreaterThan(10);
    }
  });

  test("fail-classes b/c expect fail; pass-classes a/d/e expect pass", () => {
    for (const f of FACTUALITY_FIXTURES) {
      expect(f.expectPass).toBe(f.cls === "a" || f.cls === "d" || f.cls === "e");
    }
  });
});
