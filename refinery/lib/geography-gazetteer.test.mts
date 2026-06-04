import { describe, it, expect } from "vitest";
import {
  GEOGRAPHY_GAZETTEER,
  PLACE_ZIP_CROSSWALK,
  resolvePlaceZip,
} from "./geography-gazetteer.mts";
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

describe("place -> ZIP crosswalk", () => {
  it("resolves Gateway to 33913 and Fort Myers Beach to 33931", () => {
    expect(resolvePlaceZip("Gateway")?.zip).toBe("33913");
    expect(resolvePlaceZip("Fort Myers Beach")?.zip).toBe("33931");
    // alias resolves to the same entry
    expect(resolvePlaceZip("FMB")?.zip).toBe("33931");
  });

  it("rides in the geography block with a sourced vintage", () => {
    expect(GEOGRAPHY_GAZETTEER.place_zip_crosswalk).toBe(PLACE_ZIP_CROSSWALK);
    expect(PLACE_ZIP_CROSSWALK.crosswalk_vintage).toBe("2024");
  });

  it("every entry carries provenance — a source, or needs_verification", () => {
    for (const e of PLACE_ZIP_CROSSWALK.entries) {
      expect(/^\d{5}$/.test(e.zip)).toBe(true);
      // either a real source is cited, or the entry is flagged for follow-up
      expect(e.source.trim().length > 0 || e.needs_verification).toBe(true);
    }
  });

  it("returns undefined for a place not in the crosswalk (no invented ZIP)", () => {
    expect(resolvePlaceZip("Miami")).toBeUndefined();
  });
});
