import { describe, expect, test } from "bun:test";
import { DEFAULT_GLOBAL_STYLE, seedById } from "./default-docs";

// ── THE BLANK CANVAS WEARS THE HOUSE DEFAULT. NOTHING ELSE. ──────────────────
//
// `skeleton-clean-white` is not just a gallery template: it is THE canvas every
// recipe arrival opens on (/go, campaign buttons, the project email tab, the
// fallback seat in build-doc.ts), and the build engine keeps the canvas doc's
// globalStyle by doctrine ("the brand on the doc is the brand that renders",
// lifecycle-chrome.ts). So any style override on THIS seed ships in every recipe
// email built on a blank canvas.
//
// That is not hypothetical. Until 08/10/2026 this seed carried
// `displayFontFamily: "PLAYFAIR_SERIF"` and `primaryColor: "#111827"`, and every
// /go build came out with a serif masthead in an off-house dark — the editorial
// look the playbook deleted by name (§2.1.6 defect 1), resurrected through a
// seed no guard was watching. Operator, same day: "I SAW THE OLD STYLE EMAILS."
//
// Gallery templates that DECLARE a look (luxury-market-report's serif masthead)
// are legitimate and not covered here. The blank canvas declares nothing.
describe("skeleton-clean-white — the blank canvas every recipe arrival lands on", () => {
  const seed = seedById("skeleton-clean-white");

  test("the seed exists (build-doc's fallback seat and both lab clients dereference it)", () => {
    expect(seed).toBeDefined();
  });

  const gs = seed!.build().globalStyle;

  test("no font overrides — a font set here rides into every recipe-built email", () => {
    expect(gs.fontFamily).toBe(DEFAULT_GLOBAL_STYLE.fontFamily);
    expect(gs.displayFontFamily).toBeUndefined();
  });

  test("house palette — white backdrop is its one identity, everything else default", () => {
    expect(gs.primaryColor).toBe(DEFAULT_GLOBAL_STYLE.primaryColor);
    expect(gs.accentColor).toBe(DEFAULT_GLOBAL_STYLE.accentColor);
    expect(gs.textColor).toBe(DEFAULT_GLOBAL_STYLE.textColor);
    expect(gs.backdropColor).toBe("#ffffff");
  });
});
