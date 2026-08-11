// lib/email/doc/blank-canvas.test.ts
// Each test is named after the failure mode it stops (RULE 3.5 TDD).
import { describe, expect, test } from "bun:test";
import { blankCanvasDoc, seatForBuild } from "./blank-canvas";
import { seedById } from "./default-docs";

describe("blankCanvasDoc", () => {
  test("FAILURE MODE prefilled-canvas-on-first-land: the landing doc has NO blocks", () => {
    expect(blankCanvasDoc().blocks).toEqual([]);
  });

  test("FAILURE MODE wrong-style-into-the-build: it carries the skeleton's globalStyle verbatim", () => {
    // build-doc.ts takes globalStyle off the canvas doc — an empty doc with a bare
    // style would ship the wrong backdrop/type into every arrival build.
    const skeleton = seedById("skeleton-clean-white")!.build();
    expect(blankCanvasDoc().globalStyle).toEqual(skeleton.globalStyle);
  });

  test("FAILURE MODE emptying-the-shared-seat: skeleton-clean-white itself still has its blocks", () => {
    // It is still the server-side build seat, the default-grid recipe's declared
    // skeleton, and a gallery template. Blanking the LANDING must not blank those.
    expect(seedById("skeleton-clean-white")!.build().blocks.length).toBeGreaterThan(0);
  });
});

describe("seatForBuild", () => {
  test("FAILURE MODE unbranded-build-off-an-empty-canvas: an empty canvas is seated with the skeleton", () => {
    // Builders lift brand off canvas header/footer (keep(currentDoc,"footer"),
    // brandWebsiteUrl(currentDoc)); an empty payload would drop the agent's site
    // and reply-to to the house fallbacks.
    const seated = seatForBuild(blankCanvasDoc());
    expect(seated.blocks.length).toBeGreaterThan(0);
    expect(seated.blocks.some((b) => b.type === "footer")).toBe(true);
    expect(seated.blocks.some((b) => b.type === "header")).toBe(true);
  });

  test("FAILURE MODE clobbering-the-users-work: a canvas with blocks is passed through untouched", () => {
    const doc = seedById("skeleton-dark-pro")!.build();
    expect(seatForBuild(doc)).toBe(doc);
  });

  test("the seat carries the CANVAS globalStyle, not the skeleton's", () => {
    const doc = {
      ...blankCanvasDoc(),
      globalStyle: { ...blankCanvasDoc().globalStyle, accentColor: "#ff0000" },
    };
    expect(seatForBuild(doc).globalStyle.accentColor).toBe("#ff0000");
  });
});
