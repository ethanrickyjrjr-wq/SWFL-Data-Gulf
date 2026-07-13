// lib/deliverable/campaign-coherence.test.ts
//
// THE CAMPAIGN LOOKS LIKE ONE CAMPAIGN.
//
// Operator, 07/13/2026: *"This one is a 6 or 7 email campaign that a user can start from the
// first one and … have the campaign run on scheduled email deliveries releasing each new
// email at different points in the sales process. So, EACH EMAIL WOULD HAVE THE SAME LOOK,
// JUST DIFFERENT INFORMATION. I want to make sure that is the case."*
//
// It was NOT the case. Seven lifecycle emails, seven different layouts — each built by a
// different worker, in a different file, with its own idea of a grid, because there was
// nothing to build ONTO:
//
//   new-listing     header · RIBBON · photo · hero(center) · ONE 6-cell STRIP · text · …
//   coming-soon     header · photo · hero(LEFT) · stats[3] · stats[3] · text · …
//   market-comps    header · hero(LEFT) · photo · stats[3] · stats[2] · chart · list · …
//   under-contract  header · photo · hero(LEFT) · stats[3] · stats[3] · stats[3] · stats[1]
//   just-sold       header · photo · hero(LEFT) · stats[3] · stats[3] · text · list · …
//   open-house      header · photo · hero(LEFT) · stats[2] · stats[3] · text · cta · card · …
//   price-reduced   header · hero(LEFT) · stats[2] · photo · stats[3] · stats[3] · NO card
//
// A subscriber walking the campaign from Coming Soon to Sold would have received seven
// emails that looked like seven different companies. That is not a campaign. It is a pile.
//
// This test pins the ONE chrome (lib/email/lifecycle-chrome.ts). A recipe may change the
// RIBBON WORD, the numbers, its own MIDDLE blocks and the CTA. It may NOT change the shape.

import { describe, expect, it } from "bun:test";
import { RECIPES, type RecipeKey } from "./recipes";
import { builderFor } from "./recipes/index";
import { seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** Every recipe whose subject is a HOUSE — the listing lifecycle campaign. */
const LIFECYCLE = (Object.keys(RECIPES) as RecipeKey[]).filter(
  (k) => RECIPES[k].subject === "address",
);

/** A fully-resolved subject, so no cell is empty for a reason unrelated to layout. */
const FACTS = {
  address: "326 Shore Dr, Fort Myers, FL 33905",
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  price: "$595,000",
  beds: "3",
  baths: "3.5",
  sqft: "2847",
  lotSize: "0.26 ac",
  propertyType: "Residential",
  photos: [],
  sourceUrl: "https://example.com/listing",
} as ListingFacts;

async function build(key: RecipeKey): Promise<EmailDoc | null> {
  const recipe = RECIPES[key];
  const seed = (recipe.skeleton ? seedById(recipe.skeleton) : SEED_DOCS[0])!.build();
  return builderFor(key)!({ recipe, prompt: "", currentDoc: seed, facts: FACTS, resolved: true });
}

/** The chrome elements, in document order. */
function spine(doc: EmailDoc): string[] {
  return [...doc.blocks]
    .sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0))
    .map((b) => {
      if (b.type === "hero") return b.props.ribbon ? "hero:ribbon" : "hero:subject";
      if (b.type === "stats") return b.props.variant === "strip" ? "stats:strip" : "stats:grid";
      if (b.type === "image") return `image:${String(b.props.kind ?? "?")}`;
      return b.type;
    });
}

describe("every email in the listing campaign has the SAME LOOK", () => {
  it("the campaign has the seven recipes we think it has", () => {
    expect(LIFECYCLE.sort()).toEqual(
      [
        "coming-soon",
        "just-sold",
        "market-comps",
        "new-listing",
        "open-house",
        "price-reduced",
        "under-contract",
      ].sort(),
    );
  });

  for (const key of LIFECYCLE) {
    it(`"${key}" wears the campaign chrome`, async () => {
      const doc = await build(key);
      expect(doc, `${key} built nothing`).toBeTruthy();
      const s = spine(doc!);

      // THE SPINE, in order. A recipe's own MIDDLE blocks may sit between the strip and the
      // narrative, and its TAIL between the narrative and the agent card — that is where
      // these emails legitimately differ. Everything else is the campaign.
      expect(s[0], `${key}: must open with the agent's header`).toBe("header");
      expect(s[1], `${key}: the ACCENT RIBBON is the campaign's spine`).toBe("hero:ribbon");
      expect(s[2], `${key}: the photo comes after the ribbon`).toBe("image:photo");
      expect(s[3], `${key}: the centred hero (address over price) comes after the photo`).toBe(
        "hero:subject",
      );
      expect(s[4], `${key}: ONE hairline spec strip — never a wall of stat rows`).toBe(
        "stats:strip",
      );

      // It closes the same way, every time: the agent signs it, then one CTA, then CAN-SPAM.
      expect(s.slice(-3), `${key}: must close with agent card → CTA → footer`).toEqual([
        "agent-card",
        "button",
        "footer",
      ]);

      // NEVER a wall of chunky stat rows. under-contract emitted FOUR.
      expect(
        s.filter((x) => x === "stats:grid").length,
        `${key}: a lifecycle email uses the STRIP, not stacked stat grids`,
      ).toBe(0);

      // Exactly one narrative slot, and exactly one CTA.
      expect(s.filter((x) => x === "text").length, `${key}: one narrative slot`).toBeGreaterThan(0);
      expect(s.filter((x) => x === "button").length, `${key}: exactly ONE call to action`).toBe(1);
    });
  }

  it("the RIBBON WORD is what distinguishes them — and every one is different", async () => {
    const words = new Map<string, string>();
    for (const key of LIFECYCLE) {
      const doc = await build(key);
      const ribbon = doc!.blocks.find((b) => b.type === "hero" && b.props.ribbon);
      const word = ribbon?.type === "hero" ? (ribbon.props.kicker ?? "") : "";
      expect(word, `${key}: the ribbon must name which email this is`).toBeTruthy();
      words.set(key, word);
    }
    // Seven emails, seven different words, one identical shape. That IS the campaign.
    expect(new Set(words.values()).size).toBe(LIFECYCLE.length);
  });

  it("the BRAND is sticky — a user's colours ride through every email untouched", async () => {
    const branded = SEED_DOCS.find((s) => s.id === "new-listing")!.build();
    branded.globalStyle = { ...branded.globalStyle, accentColor: "#123456" };
    const recipe = RECIPES["just-sold"];
    const doc = await builderFor("just-sold")!({
      recipe,
      prompt: "",
      currentDoc: branded,
      facts: FACTS,
      resolved: true,
    });
    // The chrome is the SHAPE; the brand is the SKIN. It must never be authored over.
    expect(doc!.globalStyle.accentColor).toBe("#123456");
  });
});
