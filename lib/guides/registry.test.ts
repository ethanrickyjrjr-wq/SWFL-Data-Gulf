import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GUIDES, guideBySlug } from "./registry";

/**
 * The registry is the single source of truth for /guides. These tests are the
 * mechanical form of the spec's copy + sourcing rules: a guide that references
 * a missing asset, an undated figure, an unknown deep link, or an internal
 * noun must be a red test here, never a broken page in prod.
 */

const AS_OF = /^\d{2}\/\d{2}\/\d{4}$/;
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Known public route prefixes a tryIt CTA may point at.
const TRY_IT_ROUTES = ["/email-lab", "/showcase", "/ask", "/charts"];
// Spec §4: internal nouns never reach user-facing copy.
const FORBIDDEN_NOUNS = /\b(fence|pack|brain|master|lane|data lake|zip-level)\b/i;

describe("guides registry", () => {
  it("holds at least one guide, slugs unique and kebab-case", () => {
    expect(GUIDES.length).toBeGreaterThan(0);
    const slugs = GUIDES.map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(KEBAB);
  });

  it("guideBySlug resolves every slug and rejects unknowns", () => {
    for (const g of GUIDES) expect(guideBySlug(g.slug)).toBe(g);
    expect(guideBySlug("nope")).toBeUndefined();
  });

  it("section ids are unique within each guide (every TOC anchor resolves)", () => {
    for (const g of GUIDES) {
      const ids = g.sections.map((s) => s.id);
      expect(new Set(ids).size, `duplicate section id in "${g.slug}"`).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(KEBAB);
    }
  });

  it("every figure src and cardImage exists under public/", () => {
    const assertExists = (src: string, where: string) => {
      expect(src.startsWith("/"), `${where}: src must start with /`).toBe(true);
      expect(
        existsSync(join(process.cwd(), "public", src)),
        `missing asset: ${src} (${where})`,
      ).toBe(true);
    };
    for (const g of GUIDES) {
      assertExists(g.cardImage, `${g.slug} cardImage`);
      for (const s of g.sections) {
        if (s.figure) assertExists(s.figure.src, `${g.slug}#${s.id}`);
      }
    }
  });

  it("every figure carries provenance and an MM/DD/YYYY as-of date", () => {
    for (const g of GUIDES) {
      for (const s of g.sections) {
        if (!s.figure) continue;
        expect(s.figure.provenance.length, `${g.slug}#${s.id}`).toBeGreaterThan(0);
        expect(s.figure.asOf, `${g.slug}#${s.id}`).toMatch(AS_OF);
      }
    }
  });

  it("every tryIt href points at a known public route", () => {
    const check = (href: string, where: string) =>
      expect(
        TRY_IT_ROUTES.some(
          (r) => href === r || href.startsWith(r + "/") || href.startsWith(r + "?"),
        ),
        `unknown tryIt route ${href} (${where})`,
      ).toBe(true);
    for (const g of GUIDES) {
      check(g.tryIt.href, g.slug);
      for (const s of g.sections) {
        if (s.tryIt) check(s.tryIt.href, `${g.slug}#${s.id}`);
      }
    }
  });

  it("copy carries no internal nouns (spec §4)", () => {
    for (const g of GUIDES) {
      expect(JSON.stringify(g), `internal noun leaked in "${g.slug}"`).not.toMatch(FORBIDDEN_NOUNS);
    }
  });

  it('kind "guide" pieces carry expect bullets and a hook', () => {
    for (const g of GUIDES) {
      expect(g.hook.length).toBeGreaterThan(0);
      expect(g.description.length).toBeGreaterThan(0);
      if (g.kind === "guide") expect(g.expect.length).toBeGreaterThan(0);
    }
  });
});
