import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CAMPAIGN_CATEGORIES } from "./campaign-order";
import { RECIPES } from "@/lib/deliverable/recipes";
import { SHOWCASES } from "./registry";

/** A missing asset or a dangling recipe key must be a red test here, never a
 *  broken card in prod — same discipline as registry.test.ts. */
describe("campaign-order", () => {
  it("every email points at a real RECIPES key", () => {
    for (const cat of CAMPAIGN_CATEGORIES) {
      for (const e of cat.emails) {
        expect(RECIPES[e.key], `${cat.id}/${e.key} has no RECIPES entry`).toBeDefined();
      }
    }
  });

  it("every non-null image exists under public/", () => {
    for (const cat of CAMPAIGN_CATEGORIES) {
      for (const e of cat.emails) {
        if (e.image === null) continue;
        expect(
          existsSync(join(process.cwd(), "public", e.image)),
          `${cat.id}/${e.key} missing capture: ${e.image}`,
        ).toBe(true);
      }
    }
  });

  it("every row's story points at a real SHOWCASES entry", () => {
    const ids = new Set(SHOWCASES.map((s) => s.id));
    for (const cat of CAMPAIGN_CATEGORIES) {
      expect(ids.has(cat.story), `${cat.id} story "${cat.story}" not in SHOWCASES`).toBe(true);
    }
  });

  it("no duplicate recipe key within a single row", () => {
    for (const cat of CAMPAIGN_CATEGORIES) {
      const keys = cat.emails.map((e) => e.key);
      expect(new Set(keys).size, `${cat.id} has a duplicate email key`).toBe(keys.length);
    }
  });

  it("listing lifecycle leads with Coming Soon", () => {
    const listing = CAMPAIGN_CATEGORIES.find((c) => c.id === "listing-lifecycle");
    expect(listing?.emails[0]?.key).toBe("coming-soon");
  });
});
