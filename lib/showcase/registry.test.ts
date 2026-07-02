import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SHOWCASES } from "./registry";

/**
 * Registry is the single source of truth for the panel showcases. A missing
 * asset must be a red test here, never a broken slide in prod.
 */
describe("showcase registry", () => {
  it("ships exactly 3 showcases with unique ids", () => {
    expect(SHOWCASES).toHaveLength(3);
    expect(new Set(SHOWCASES.map((s) => s.id)).size).toBe(3);
  });

  it("every asset path exists under public/", () => {
    for (const s of SHOWCASES) {
      expect(existsSync(join(process.cwd(), "public", s.thumb))).toBe(true);
      for (const sl of s.slides) {
        expect(existsSync(join(process.cwd(), "public", sl.image))).toBe(true);
        if (sl.liveHref) {
          expect(existsSync(join(process.cwd(), "public", sl.liveHref))).toBe(true);
        }
      }
    }
  });

  it("2-6 content slides, non-empty captions, disclosure present", () => {
    for (const s of SHOWCASES) {
      expect(s.slides.length).toBeGreaterThanOrEqual(2);
      expect(s.slides.length).toBeLessThanOrEqual(6);
      expect(s.disclosure.length).toBeGreaterThan(20);
      for (const sl of s.slides) {
        expect(sl.title.length).toBeGreaterThan(0);
        expect(sl.whatsHappening.length).toBeGreaterThan(0);
        expect(sl.howAiHandled.length).toBeGreaterThan(0);
      }
    }
  });

  it("captions carry no system nouns", () => {
    const banned = /\bmaster\b|\bbrain[- ]?id\b|§|pack[- ]id/i;
    for (const s of SHOWCASES) {
      for (const sl of s.slides) {
        expect(banned.test(sl.whatsHappening + " " + sl.howAiHandled)).toBe(false);
      }
    }
  });
});
