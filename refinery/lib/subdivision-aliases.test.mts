import { describe, it, expect } from "vitest";
import {
  COMMUNITY_ALIASES,
  communityForSubdivision,
  normalizeSubdivisionName,
} from "./subdivision-aliases.mts";

describe("subdivision-aliases", () => {
  it("rolls a platted 'UNIT n' name up to its marketed community", () => {
    expect(communityForSubdivision("HERITAGE BAY UNIT 12")).toBe("heritage-bay");
    expect(communityForSubdivision("Heritage Bay Unit Two")).toBe("heritage-bay");
  });
  it("normalizes away plat qualifiers and punctuation", () => {
    expect(normalizeSubdivisionName("HERITAGE BAY UNIT 12, PHASE 1")).toBe("HERITAGE BAY");
  });

  // Regression: check `neighborhood_stats_per_lot_subdivision_fragments`. The stem dropped
  // UNIT/PHASE/… but not LOT, so the lot number rode along and every lot became its own
  // one-home "community" — 11,198 fragment names across 12,127 parcels (measured 07/20/2026).
  it("drops a trailing LOT n so lots roll into their real community", () => {
    expect(normalizeSubdivisionName("MAGNOLIA AT VERANDAH LOT 88")).toBe("MAGNOLIA AT VERANDAH");
    expect(normalizeSubdivisionName("GREENWOOD VILLAS LOT 13 THROUGH 17")).toBe("GREENWOOD VILLAS");
    expect(normalizeSubdivisionName("NAPLES MOTORCOACH RESORT LOT")).toBe(
      "NAPLES MOTORCOACH RESORT",
    );
    // punctuation before LOT: the ',' is consumed by the capture, cleaned by the punctuation pass
    expect(normalizeSubdivisionName("VERANDAH, LOT 88")).toBe("VERANDAH");
  });

  // THE GUARD. A naive /\bLOT\b.*$/ would erase these to "" — 56 live names, some carrying a
  // REAL community after the lot number. Losing the name is worse than leaving the fragment.
  it("never erases a name that STARTS with its lot number", () => {
    expect(normalizeSubdivisionName("LOT 8 SOUTHWIND EST")).toBe("LOT 8 SOUTHWIND EST");
    expect(normalizeSubdivisionName("LOT 30 SPYGLASS ISLAND")).toBe("LOT 30 SPYGLASS ISLAND");
    expect(normalizeSubdivisionName("LOT 76")).toBe("LOT 76");
    expect(normalizeSubdivisionName("LOT 101")).toBe("LOT 101");
  });

  // Word-boundary safety: LOT inside a word is not a plat qualifier.
  it("does not truncate words that merely contain 'lot'", () => {
    expect(normalizeSubdivisionName("CAMELOT ESTATES")).toBe("CAMELOT ESTATES");
    expect(normalizeSubdivisionName("PILOT POINTE")).toBe("PILOT POINTE");
    expect(normalizeSubdivisionName("LOTUS BAY")).toBe("LOTUS BAY");
  });

  // The stem is duplicated in SQL (migrations/20260720_parcel_subdivision_v_lot_stem.sql).
  // Nothing can execute Postgres here, so pin the ORDER both sides must share — if someone
  // edits one regex and not the other, the intent at least fails loudly here.
  it("keeps the documented rule ORDER: qualifiers, then LOT, then punctuation", () => {
    // qualifier wins when it comes first — LOT after UNIT is already gone
    expect(normalizeSubdivisionName("PALM ISLE UNIT 2 LOT 5")).toBe("PALM ISLE");
    // LOT wins when IT comes first
    expect(normalizeSubdivisionName("PALM ISLE LOT 5 UNIT 2")).toBe("PALM ISLE");
  });
  it("returns null for an unknown subdivision (a coverage hole, not a guess)", () => {
    expect(communityForSubdivision("SOME UNPLATTED TRACT 00")).toBeNull();
  });
  it("has no empty pattern and no duplicate pattern across two communities (discipline)", () => {
    const seen = new Map<string, string>();
    for (const [slug, { patterns }] of Object.entries(COMMUNITY_ALIASES)) {
      expect(patterns.length).toBeGreaterThan(0);
      for (const p of patterns) {
        expect(p).toBe(normalizeSubdivisionName(p)); // patterns are pre-normalized
        expect(seen.has(p)).toBe(false); // no two communities claim the same pattern
        seen.set(p, slug);
      }
    }
  });
});
