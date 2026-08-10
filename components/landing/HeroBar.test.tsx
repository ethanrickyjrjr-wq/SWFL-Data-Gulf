// components/landing/HeroBar.test.tsx
//
// Markup pins for the one-bar hero. renderToStaticMarkup = initial render only
// (no effects, no interaction), which is exactly what these pins need:
// the ONE-INPUT invariant and the default-mode surface.
import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import HeroBar from "./HeroBar";

describe("HeroBar", () => {
  const html = renderToStaticMarkup(createElement(HeroBar));

  it("renders EXACTLY ONE text input — the page-level invariant", () => {
    expect(html.split("<input").length - 1).toBe(1);
  });

  it("renders the three mode tabs with Campaign selected by default", () => {
    expect(html).toContain(">Campaign<");
    expect(html).toContain(">Market Report<");
    expect(html).toContain(">Ask the Data<");
    // aria-selected pins the NN/g one-selected-by-default rule.
    expect(html.match(/aria-selected="true"/g)?.length).toBe(1);
  });

  it("default mode is Campaign: address placeholder, Build it button, campaign chips", () => {
    expect(html).toContain("Type your next listing");
    expect(html).toContain("Build it");
    expect(html).toContain("New Listing");
    expect(html).toContain("Market Update");
  });

  it("headline passes the descriptive litmus and never says AI", () => {
    // 08/10/2026 operator decree: lead with the product (emails), not the input.
    expect(html).toContain("Emails your competition can’t send.");
    expect(html).toContain("Type an address.");
    expect(html.toLowerCase()).not.toContain(">ai<");
  });
});
