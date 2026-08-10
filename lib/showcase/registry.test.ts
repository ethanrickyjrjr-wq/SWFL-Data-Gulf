import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SHOWCASES } from "./registry";
import { NEED_LABELS, findPlaceholder } from "./recipe";

/**
 * Registry is the single source of truth for the panel showcases. A missing
 * asset must be a red test here, never a broken slide in prod.
 */
describe("showcase registry", () => {
  it("ships exactly 6 showcases with unique ids", () => {
    // 5th/6th = back-on-market + community-info (recipe-set expansion 08/03/2026).
    expect(SHOWCASES).toHaveLength(6);
    expect(new Set(SHOWCASES.map((s) => s.id)).size).toBe(6);
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

  it("1-7 content slides, non-empty captions, disclosure present", () => {
    for (const s of SHOWCASES) {
      // 1 is legitimate: back-on-market is a single-email story (08/03/2026).
      expect(s.slides.length).toBeGreaterThanOrEqual(1);
      // 7 = the full listing lifecycle (open-house + price-improved joined 08/03/2026).
      expect(s.slides.length).toBeLessThanOrEqual(7);
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

  // ── Make-this recipes (spec: 2026-07-03-email-lab-make-this-design.md) ──────
  // The flywheel-proof slide isn't a single buildable artifact — it demonstrates
  // vintage-over-vintage refresh, not a recipe to rebuild.
  const RECIPE_EXEMPT = new Set(["market-pulse/Proof It Updates"]);

  it("every email-surface slide has a recipe or an explicit exemption", () => {
    for (const s of SHOWCASES.filter((s) => s.surfaces.includes("email"))) {
      for (const sl of s.slides) {
        const key = `${s.id}/${sl.title}`;
        if (RECIPE_EXEMPT.has(key)) continue;
        expect(sl.recipe, `missing recipe: ${key}`).toBeDefined();
      }
    }
  });

  it("exempt list holds no stale keys", () => {
    const liveKeys = new Set(SHOWCASES.flatMap((s) => s.slides.map((sl) => `${s.id}/${sl.title}`)));
    for (const key of RECIPE_EXEMPT) {
      expect(liveKeys.has(key), `stale exempt key: ${key}`).toBe(true);
    }
  });

  it("every social-target slide names a known board id", () => {
    // Data-consistency guard on the socialBoard field. HISTORICAL: the
    // SocialBoard renderer was removed 08/10/2026 with every story-overlay
    // surface (operator: old emails off the website, no path to them).
    const KNOWN_BOARDS = new Set(["market-pulse", "launch-blitz"]);
    for (const s of SHOWCASES) {
      for (const sl of s.slides) {
        if (sl.recipe?.target === "social") {
          expect(sl.socialBoard, `social slide missing board: ${s.id}/${sl.title}`).toBeDefined();
        }
        if (sl.socialBoard) {
          expect(KNOWN_BOARDS.has(sl.socialBoard), `unknown board ${sl.socialBoard}`).toBe(true);
        }
      }
    }
  });

  it("recipes carry exactly one [[blank]] and real brand needs", () => {
    for (const s of SHOWCASES) {
      for (const sl of s.slides) {
        if (!sl.recipe) continue;
        const blanks = sl.recipe.prompt.match(/\[\[[^\]]+\]\]/g) ?? [];
        expect(blanks.length, `${s.id}/${sl.title} blanks`).toBe(1);
        expect(findPlaceholder(sl.recipe.prompt)).not.toBeNull();
        expect(sl.recipe.needs.length).toBeGreaterThan(0);
        for (const need of sl.recipe.needs) {
          expect(NEED_LABELS[need], `${s.id}/${sl.title} unknown need ${need}`).toBeDefined();
        }
      }
    }
  });
});
