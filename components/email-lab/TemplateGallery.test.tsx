// components/email-lab/TemplateGallery.test.tsx
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TemplateGallery } from "./TemplateGallery";

describe("TemplateGallery", () => {
  it("renders a passed heroSlot above the template groups", () => {
    const html = renderToStaticMarkup(
      createElement(TemplateGallery, {
        onPick: () => {},
        onStartBlank: () => {},
        heroSlot: createElement("div", null, "HERO MARKER"),
      }),
    );
    expect(html).toContain("HERO MARKER");
    expect(html.indexOf("HERO MARKER")).toBeLessThan(
      html.indexOf("Every stage of a property&#x27;s story"),
    );
  });

  it("renders normally when heroSlot is omitted", () => {
    const html = renderToStaticMarkup(
      createElement(TemplateGallery, { onPick: () => {}, onStartBlank: () => {} }),
    );
    expect(html).toContain("Pick a starting point");
  });
});
