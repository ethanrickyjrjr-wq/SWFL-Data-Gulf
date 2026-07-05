import { describe, it, expect } from "vitest";
import {
  COMMUNITY_ALIASES,
  communityForSubdivision,
  normalizeSubdivisionName,
} from "./subdivision-aliases.mts";

describe("subdivision-aliases", () => {
  it("rolls a platted 'UNIT n' name up to its marketed community", () => {
    expect(communityForSubdivision("HERITAGE BAY UNIT 12")).toBe("heritage-bay");
    expect(communityForSubdivision("Heritage Bay Unit Two")).toBe("heritage-bay");
  });
  it("normalizes away plat qualifiers and punctuation", () => {
    expect(normalizeSubdivisionName("HERITAGE BAY UNIT 12, PHASE 1")).toBe("HERITAGE BAY");
  });
  it("returns null for an unknown subdivision (a coverage hole, not a guess)", () => {
    expect(communityForSubdivision("SOME UNPLATTED TRACT 00")).toBeNull();
  });
  it("has no empty pattern and no duplicate pattern across two communities (discipline)", () => {
    const seen = new Map<string, string>();
    for (const [slug, { patterns }] of Object.entries(COMMUNITY_ALIASES)) {
      expect(patterns.length).toBeGreaterThan(0);
      for (const p of patterns) {
        expect(p).toBe(normalizeSubdivisionName(p)); // patterns are pre-normalized
        expect(seen.has(p)).toBe(false); // no two communities claim the same pattern
        seen.set(p, slug);
      }
    }
  });
});
