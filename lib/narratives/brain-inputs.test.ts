import { describe, expect, it } from "bun:test";
import { listBrainSurfaceKeys, assembleBrainBakeInputs } from "./brain-inputs";

describe("listBrainSurfaceKeys", () => {
  it("lists published brain slugs, excluding the dev fixture", async () => {
    const keys = await listBrainSurfaceKeys();
    expect(keys).toContain("housing-swfl");
    expect(keys).toContain("master");
    expect(keys).not.toContain("test-alpha");
  });
});

describe("assembleBrainBakeInputs", () => {
  it("assembles facts + context from the display layer (shape only, never values)", async () => {
    const inputs = await assembleBrainBakeInputs("housing-swfl");
    expect(inputs).not.toBeNull();
    expect(inputs!.surface).toBe("brain");
    expect(inputs!.key).toBe("housing-swfl");
    expect(inputs!.facts.length).toBeGreaterThan(0);
    for (const f of inputs!.facts) {
      expect(f.label.length).toBeGreaterThan(0);
      expect(f.display.length).toBeGreaterThan(0);
      expect(f.source.length).toBeGreaterThan(0);
    }
    expect(inputs!.context.length).toBeGreaterThan(0);
  });
  it("carries the display layer's MM/DD/YYYY as-of date (07/19 postmortem: double asOfFromToken → always null)", async () => {
    const inputs = await assembleBrainBakeInputs("housing-swfl");
    expect(inputs!.asOf).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
  it("returns null for a missing brain", async () => {
    expect(await assembleBrainBakeInputs("no-such-brain")).toBeNull();
  });
});
