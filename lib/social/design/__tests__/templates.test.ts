// lib/social/design/__tests__/templates.test.ts
import { test, expect } from "bun:test";
import {
  SOCIAL_TEMPLATES,
  getTemplate,
  offerableTemplates,
  type TemplateTokens,
} from "@/lib/social/design/templates";
import { designToSkeleton, applyDesignPatch } from "@/lib/social/design/serialize";
import { SOCIAL_FORMATS } from "@/lib/social/formats";

const TOKENS: TemplateTokens = {
  primary: "#0f1d24",
  accent: "#0ea5b7",
  text: "#ffffff",
  logoUrl: "https://example.com/logo.png",
};
const NO_LOGO: TemplateTokens = { ...TOKENS, logoUrl: undefined };

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test("every template instantiates within canvas bounds for each declared format", () => {
  for (const t of SOCIAL_TEMPLATES) {
    for (const fmt of t.formats) {
      const { width: W, height: H } = SOCIAL_FORMATS[fmt];
      const d = t.build(TOKENS, fmt);
      expect(d.format).toBe(fmt);
      expect(d.elements.length).toBeGreaterThan(0);
      for (const el of d.elements) {
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
        expect(el.x + el.width).toBeLessThanOrEqual(W);
        expect(el.y + el.height).toBeLessThanOrEqual(H);
      }
    }
  }
});

test("no element overlaps the logo slot", () => {
  for (const t of SOCIAL_TEMPLATES) {
    for (const fmt of t.formats) {
      const d = t.build(TOKENS, fmt);
      const logo = d.elements.find((e) => e.type === "logo");
      if (!logo) continue;
      for (const el of d.elements) {
        if (el.id === logo.id) continue;
        expect(overlaps(el, logo)).toBe(false);
      }
    }
  }
});

test("element ids are deterministic across builds (the patch contract)", () => {
  for (const t of SOCIAL_TEMPLATES) {
    const a = t.build(TOKENS, t.formats[0]).elements.map((e) => e.id);
    const b = t.build(TOKENS, t.formats[0]).elements.map((e) => e.id);
    expect(a).toEqual(b);
    // ids must be stable, readable constants — never minted
    for (const id of a) expect(id).toMatch(/^[a-z0-9]+$/);
  }
});

test("HAPPY PATH: a patch keyed by the skeleton ids actually changes text on a fresh build", () => {
  for (const t of SOCIAL_TEMPLATES) {
    const fmt = t.formats[0];
    // 1) ids the author would see
    const skeleton = designToSkeleton(t.build(TOKENS, fmt));
    const ids = Object.keys(skeleton);
    expect(ids.length).toBeGreaterThan(0);
    // 2) a patch the model would return, keyed by those ids
    const patch: Record<string, Record<string, string>> = {};
    for (const id of ids) {
      const fields = skeleton[id];
      const next: Record<string, string> = {};
      if ("text" in fields) next.text = `AUTHORED ${id}`;
      if ("value" in fields) next.value = `$${id}`;
      if ("label" in fields) next.label = `label ${id}`;
      patch[id] = next;
    }
    // 3) apply to a SEPARATELY-built design — the load-bearing assertion: ids match
    const filled = applyDesignPatch(t.build(TOKENS, fmt), patch);
    const filledSkeleton = designToSkeleton(filled);
    for (const id of ids) {
      const f = filledSkeleton[id];
      if ("text" in skeleton[id]) expect(f.text).toBe(`AUTHORED ${id}`);
      if ("value" in skeleton[id]) expect(f.value).toBe(`$${id}`);
      if ("label" in skeleton[id]) expect(f.label).toBe(`label ${id}`);
    }
  }
});

test("logo is included only when a logo URL is present", () => {
  for (const t of SOCIAL_TEMPLATES) {
    const withLogo = t.build(TOKENS, t.formats[0]);
    const withoutLogo = t.build(NO_LOGO, t.formats[0]);
    const hasLogoEl = (d: typeof withLogo) => d.elements.some((e) => e.type === "logo");
    // listing-feature/three-stat may or may not carry a logo by design; assert the
    // invariant that holds for all: no logo element ever appears without a URL.
    expect(hasLogoEl(withoutLogo)).toBe(false);
    if (hasLogoEl(withLogo)) {
      const logo = withLogo.elements.find((e) => e.type === "logo")!;
      expect(logo.type === "logo" && logo.src).toBe(TOKENS.logoUrl);
    }
  }
});

test("offerableTemplates hides listing-feature unless a listing exists", () => {
  expect(offerableTemplates().some((t) => t.id === "listing-feature")).toBe(false);
  expect(offerableTemplates({ hasListing: true }).some((t) => t.id === "listing-feature")).toBe(
    true,
  );
  // the other three are always offered
  expect(offerableTemplates().map((t) => t.id)).toEqual([
    "stat-hero",
    "headline-cta",
    "three-stat",
  ]);
});

test("getTemplate returns undefined for an unknown id (author drops it)", () => {
  expect(getTemplate("nope")).toBeUndefined();
  expect(getTemplate("stat-hero")?.id).toBe("stat-hero");
});
