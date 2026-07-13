// lib/deliverable/seed-recipe-parity.test.ts
//
// THE COLLISION TEST.
//
// Four seed templates share a NAME with a recipe button: new-listing, just-sold,
// open-house, price-reduced. A user can reach the same deliverable two ways —
//
//   the SEED CARD    (template gallery)  → the layout, empty, to fill by hand
//   the RECIPE BUTTON (pill / showcase / campaign / lab) → the same layout, filled
//                                          from the resolved subject
//
// — and they must be THE SAME LAYOUT. They were not. The `new-listing` seed shipped
// ONE three-cell spec row and no agent card, while the button (buildListingFlyer)
// shipped SEVEN spec slots and an agent card. Same name, different email, no shared
// authority. That is exactly the drift the recipe key exists to kill.
//
// "The same thing" = the same STRUCTURE. The seed's values are empty and the built
// one's are sourced — that difference is the whole point. What must match is the
// block sequence: same blocks, same order, same widths.
//
// This test is generic on purpose. As each recipe's builder lands, its seed is
// checked automatically — so a worker cannot quietly ship a builder whose shape
// disagrees with the seed card users are already being shown.

import { describe, expect, it } from "bun:test";
import { RECIPE_KEYS, RECIPES } from "./recipes";
import { builderFor } from "./recipes/index";
import { seedById } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** The structural fingerprint: what blocks, in what order, how wide. Values are
 *  deliberately NOT compared — a filled build differs from an empty seed by design. */
function shape(doc: EmailDoc): string[] {
  return [...doc.blocks]
    .sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0))
    .map((b) => {
      const kind = b.type === "image" ? `image:${String(b.props.kind ?? "?")}` : b.type;
      const w = b.layout?.w ?? 12;
      // A stats row's CELL COUNT is structural — three spec slots is a different
      // deliverable from seven, and that was the actual new-listing divergence.
      const cells =
        b.type === "stats" ? `[${(b.props.stats as unknown[] | undefined)?.length ?? 0}]` : "";
      return `${kind}${cells}@${w}`;
    });
}

/** An unresolved subject: the vendor missed, so every cell is an open slot. This is
 *  precisely the state a seed card is in — which is why it is the fair comparison. */
const EMPTY_FACTS: ListingFacts = {
  address: "",
  photos: [],
  sourceUrl: "",
} as ListingFacts;

describe("a seed card and its recipe button are the same deliverable", () => {
  // Only the keys that have BOTH a committed skeleton AND a built builder. A recipe
  // whose worker hasn't landed yet is simply not checked — it is not a failure.
  const collisions = RECIPE_KEYS.filter(
    (k) => RECIPES[k].skeleton !== null && builderFor(k) !== null,
  );

  it("there is at least one name collision to check (the test hasn't gone vacuous)", () => {
    expect(collisions.length).toBeGreaterThan(0);
  });

  for (const key of collisions) {
    const recipe = RECIPES[key];

    it(`"${key}": the seed card's layout matches what the button builds`, async () => {
      const seed = seedById(recipe.skeleton!);
      expect(
        seed,
        `recipe "${key}" names skeleton "${recipe.skeleton}", which is missing`,
      ).toBeTruthy();

      const seedDoc = seed!.build();
      const built = await builderFor(key)!({
        recipe,
        prompt: "",
        currentDoc: seedDoc,
        // The vendor missed → the builder must still land the full grid, with every
        // unsourced cell an OPEN SLOT. Never refuse, never invent (RULE 0.7).
        facts: recipe.subject === "address" ? EMPTY_FACTS : null,
        resolved: false,
      });

      // A builder that returns null on an unresolved subject falls through to the
      // generic author — legitimate, and nothing to compare.
      if (!built) return;

      expect(shape(built), `the "${key}" seed card and its button build different emails`).toEqual(
        shape(seedDoc),
      );
    });
  }
});

describe("dropping a chart closes the hole it leaves", () => {
  it("blocks below a removed chart rise to fill the gap", async () => {
    // Blocks carry ABSOLUTE grid positions, so filtering a positioned block is not the
    // same as removing it. New Listing drops its chart by design — so before this was
    // fixed, the one deliverable we had shipped carried a five-row void between the
    // description and the agent card.
    const { dropEmptyChartSlot } = await import("./recipes/shared");
    const doc: EmailDoc = {
      globalStyle: {} as EmailDoc["globalStyle"],
      blocks: [
        { id: "a", type: "text", props: { body: "x" }, layout: { x: 0, y: 0, w: 12, h: 4 } },
        {
          id: "chart",
          type: "image",
          props: { url: "", kind: "chart" },
          layout: { x: 0, y: 4, w: 12, h: 5 },
        },
        { id: "b", type: "button", props: {}, layout: { x: 0, y: 9, w: 12, h: 2 } },
      ] as unknown as EmailDoc["blocks"],
    };
    const out = dropEmptyChartSlot(doc);
    expect(out.blocks.map((b) => b.id)).toEqual(["a", "b"]);
    // The button was at y:9 under a 5-row chart starting at y:4 → it rises to y:4.
    expect(out.blocks.find((b) => b.id === "b")?.layout?.y).toBe(4);
    // The block ABOVE the chart never moves.
    expect(out.blocks.find((b) => b.id === "a")?.layout?.y).toBe(0);
  });

  it("a chart WITH a url is never dropped", async () => {
    const { dropEmptyChartSlot } = await import("./recipes/shared");
    const doc: EmailDoc = {
      globalStyle: {} as EmailDoc["globalStyle"],
      blocks: [
        {
          id: "chart",
          type: "image",
          props: { url: "https://example.com/c.png", kind: "chart" },
          layout: { x: 0, y: 0, w: 12, h: 5 },
        },
      ] as unknown as EmailDoc["blocks"],
    };
    expect(dropEmptyChartSlot(doc).blocks).toHaveLength(1);
  });
});
