// Rail order (spec 2026-07-16): campaign-start templates lead; lifecycle tails
// (Just Sold) never open the rail. RAIL_ORDER ids must stay real SEED_DOCS ids,
// and no template silently vanishes from the rail when one is added.
import { describe, expect, it } from "bun:test";
import { RAIL_ORDER } from "./TemplateRail";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";

describe("TemplateRail order", () => {
  it("leads with campaign-start templates, not lifecycle tails", () => {
    expect(RAIL_ORDER.indexOf("new-listing")).toBeLessThan(RAIL_ORDER.indexOf("just-sold"));
    expect(RAIL_ORDER.indexOf("listing-feature")).toBeLessThan(RAIL_ORDER.indexOf("just-sold"));
    expect(RAIL_ORDER.indexOf("just-sold")).toBeGreaterThan(4);
  });

  it("every railed id is a real template", () => {
    for (const id of RAIL_ORDER) {
      expect(
        SEED_DOCS.some((s) => s.id === id),
        id,
      ).toBe(true);
    }
  });

  it("every template is railed — nothing vanishes when SEED_DOCS grows", () => {
    for (const s of SEED_DOCS) {
      expect(RAIL_ORDER.includes(s.id), s.id).toBe(true);
    }
  });
});
