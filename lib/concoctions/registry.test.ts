import { describe, it, expect } from "bun:test";
import { CONCOCTIONS, getConcoction, concoctionIndex } from "./registry";

describe("registry", () => {
  it("holds the 4 starter defs with unique ids", () => {
    const ids = CONCOCTIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "corridor-profiles",
        "zip-listing-activity",
        "nfip-storm-years",
        "asking-price-trend",
      ]),
    );
  });
  it("getConcoction resolves and misses safely", () => {
    expect(getConcoction("corridor-profiles")?.label).toBe("Commercial rents & vacancy");
    expect(getConcoction("nope")).toBeUndefined();
  });
  it("index is picker/AI-safe: no digits in descriptions (no smuggled figures), params listed", () => {
    for (const e of concoctionIndex()) {
      expect(e.description).not.toMatch(/\d/);
      expect(Array.isArray(e.paramKeys)).toBe(true);
    }
  });
  it("index copy carries no system nouns", () => {
    for (const e of concoctionIndex()) {
      expect(`${e.label} ${e.description}`).not.toMatch(/concoction|registry|binding|lane|brain/i);
    }
  });
  it("param metadata carries enum options + required flags (zod introspection pin)", () => {
    const idx = concoctionIndex();
    const asking = idx.find((e) => e.id === "asking-price-trend")!;
    expect(asking.params).toEqual([
      { key: "area", required: true, options: ["cape_coral", "fort_myers", "naples"] },
    ]);
    const zip = idx.find((e) => e.id === "zip-listing-activity")!;
    expect(zip.params).toEqual([
      { key: "county", required: false, options: ["Lee", "Collier", "Hendry"] },
    ]);
    const corridors = idx.find((e) => e.id === "corridor-profiles")!;
    expect(corridors.params).toEqual([]);
  });
  it("every defaultLayout slice references declared columns (all defs)", () => {
    for (const def of CONCOCTIONS) {
      const keys = new Set(def.columns.map((c) => c.key));
      for (const spec of def.defaultLayout) {
        for (const m of spec.slice.measures) expect(keys.has(m)).toBe(true);
        if (spec.slice.dimension) expect(keys.has(spec.slice.dimension)).toBe(true);
      }
    }
  });
});
