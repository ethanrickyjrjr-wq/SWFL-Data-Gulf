import { describe, it, expect } from "vitest";
import { GEOGRAPHY_GAZETTEER } from "./geography-gazetteer.mts";
import { allPockets } from "./pockets.mts";

describe("geography gazetteer", () => {
  it("covers every pocket with non-empty places", () => {
    expect(GEOGRAPHY_GAZETTEER.pockets.length).toBe(allPockets().length);
    for (const p of GEOGRAPHY_GAZETTEER.pockets) {
      expect(p.places.length).toBeGreaterThan(0);
      expect(p.places.every((s) => s.trim().length > 0)).toBe(true);
    }
  });

  it("carries the never-reject instruction", () => {
    expect(GEOGRAPHY_GAZETTEER.note).toContain("not in our system");
    expect(GEOGRAPHY_GAZETTEER.note.toLowerCase()).toContain("lee");
    expect(GEOGRAPHY_GAZETTEER.note.toLowerCase()).toContain("collier");
  });

  it("uses plain display names, not road-suffix labels", () => {
    const all = GEOGRAPHY_GAZETTEER.pockets.flatMap((p) => p.places);
    expect(all).toContain("Vanderbilt");
    expect(all.some((s) => s.includes("Beach Rd / Mercato"))).toBe(false);
  });

  it("places North Naples and Bonita Springs in the right county", () => {
    const byName = new Map(
      GEOGRAPHY_GAZETTEER.pockets.map((p) => [p.pocket, p]),
    );
    expect(byName.get("North Naples")?.county).toBe("collier");
    expect(byName.get("Bonita Springs")?.county).toBe("lee");
    expect(byName.get("Bonita Springs")?.places).toContain("Bonita Beach");
  });
});
