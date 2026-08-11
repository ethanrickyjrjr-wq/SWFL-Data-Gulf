// components/email-lab/TemplateGallery.test.tsx
//
// The first-run picker shows ONLY the new-email registry (operator decree
// 08/10/2026: "old emails out — everything is only the new emails"). These
// tests pin that: every category key renders a card, and nothing from the
// old seed gallery (SEED_DOCS names / seed-previews captures) appears.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TemplateGallery } from "./TemplateGallery";
import { RECIPES } from "@/lib/deliverable/recipes";
import { NEW_EMAIL_CATEGORIES, NEW_EMAIL_FILE_FOR_KEY } from "@/lib/email/new-email-captures";

function render(heroSlot?: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(
    createElement(TemplateGallery, {
      onPickRecipe: () => {},
      onStartBlank: () => {},
      heroSlot,
    }),
    // Un-escape entities so labels like "Agent & Community" match verbatim.
  ).replace(/&amp;/g, "&");
}

describe("TemplateGallery", () => {
  it("renders every registry email in the category list, and only those", () => {
    const html = render();
    for (const cat of NEW_EMAIL_CATEGORIES) {
      expect(html).toContain(cat.title);
      for (const key of cat.keys) {
        expect(html).toContain(RECIPES[key].label);
      }
    }
  });

  it("thumbnails are the re-baked new-email captures — no seed-preview imagery", () => {
    const html = render();
    for (const src of Object.values(NEW_EMAIL_FILE_FOR_KEY)) {
      expect(html).toContain(src!);
    }
    // The old gallery's capture path must never come back.
    expect(html).not.toContain("seed-previews");
    expect(html).not.toContain("/showcase/");
  });

  it("does not render the old seed-gallery groups", () => {
    const html = render();
    // Old SEED_PREVIEW_GROUPS titles/pitches — the surface the decree removed.
    expect(html).not.toContain("Every stage of a property");
    expect(html).not.toContain("Blank canvases");
    expect(html).not.toContain("layouts");
  });

  it("renders a passed heroSlot above the email rows", () => {
    const html = render(createElement("div", null, "HERO MARKER"));
    expect(html).toContain("HERO MARKER");
    expect(html.indexOf("HERO MARKER")).toBeLessThan(html.indexOf("Listing Lifecycle"));
  });

  it("renders normally when heroSlot is omitted", () => {
    const html = render();
    expect(html).toContain("Pick a starting point");
    expect(html).toContain("Start blank");
  });
});
