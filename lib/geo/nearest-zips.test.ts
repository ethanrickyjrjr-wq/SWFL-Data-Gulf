import { describe, test, expect } from "bun:test";
import { nearestZips } from "./nearest-zips";

describe("nearestZips", () => {
  test("returns the requested count and never includes the origin ZIP", () => {
    const out = nearestZips("33901", 5);
    expect(out).toHaveLength(5);
    expect(out.map((n) => n.zip)).not.toContain("33901");
  });

  test("is deterministic across calls", () => {
    expect(nearestZips("33957", 5)).toEqual(nearestZips("33957", 5));
  });

  test("results are sorted nearest-first", () => {
    const out = nearestZips("34110", 5);
    for (let i = 1; i < out.length; i++) {
      expect(out[i].distanceMi).toBeGreaterThanOrEqual(out[i - 1].distanceMi);
    }
  });

  test("crosses county lines — Englewood-area Sarasota ZIP pulls Charlotte neighbors", () => {
    // 34224 (Sarasota) sits on the Charlotte line; 339xx ZIPs are its true neighbors.
    const out = nearestZips("34224", 5);
    expect(out.some((n) => n.zip.startsWith("339"))).toBe(true);
  });

  test("equidistant ZIPs tie-break by ZIP ascending", () => {
    // 34101 and 34102 share an identical centroid, so from any other origin
    // their distances are equal and 34101 must sort first.
    const out = nearestZips("34103", 20);
    const i101 = out.findIndex((n) => n.zip === "34101");
    const i102 = out.findIndex((n) => n.zip === "34102");
    expect(i101).toBeGreaterThanOrEqual(0);
    expect(i102).toBeGreaterThanOrEqual(0);
    expect(i101).toBeLessThan(i102);
  });

  test("place is a resolved name or null — never an invented string", () => {
    for (const n of nearestZips("33931", 10)) {
      if (n.place !== null) {
        expect(typeof n.place).toBe("string");
        expect(n.place.length).toBeGreaterThan(0);
        expect(n.place).not.toMatch(/^ZIP\s/);
      }
    }
  });

  test("unknown or out-of-scope origin returns empty", () => {
    expect(nearestZips("33101")).toEqual([]); // Miami
    expect(nearestZips("abcde")).toEqual([]);
  });
});
