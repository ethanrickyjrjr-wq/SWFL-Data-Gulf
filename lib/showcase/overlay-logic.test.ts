import { describe, it, expect } from "bun:test";
import { SHOWCASES } from "./registry";
import { totalSteps, clampStep, stepLabel } from "./overlay-logic";

describe("overlay logic", () => {
  const s = SHOWCASES[0];

  it("total = content slides + the tier slide", () => {
    expect(totalSteps(s)).toBe(s.slides.length + 1);
  });

  it("clamps step into [0, total)", () => {
    expect(clampStep(-1, 6)).toBe(0);
    expect(clampStep(99, 6)).toBe(5);
    expect(clampStep(3, 6)).toBe(3);
  });

  it("labels content steps by slide title and the last step as the tier", () => {
    expect(stepLabel(s, 0)).toBe(`Step 1 of ${totalSteps(s)} · ${s.slides[0].title}`);
    expect(stepLabel(s, totalSteps(s) - 1)).toBe(
      `Step ${totalSteps(s)} of ${totalSteps(s)} · What you get`,
    );
  });
});
