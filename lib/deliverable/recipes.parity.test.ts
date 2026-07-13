// lib/deliverable/recipes.parity.test.ts
//
// THE ACCEPTANCE ORACLE for the operator's requirement (07/13/2026):
//
//   "MAKE SURE EACH BUTTON EACH TOUCHES CREATES THE SAME EXACT THING FOR THE SAME
//    BUTTONS / SHOWCASE CARD / EMAIL LAB CHOICE"
//
// "The same exact thing" means the same STRUCTURE for a given resolved subject —
// the same skeleton, the same subject spine, the same chart policy, the same
// framing. NOT byte-identity: the user's own address and brand ride through it, so
// two builds of one recipe SHOULD differ in content. What must never differ is
// which deliverable you got.
//
// The bug this pins: identity used to be the PROMPT STRING. The agent-launch
// follow-up and the "Headlines vs Here" slide carried the same deliverable as two
// strings differing by one trailing sentence, so the builder treated them as two
// recipes. Any surface re-typing a prompt could silently fork a deliverable. Now a
// surface may only POINT at a key, and this file fails the suite if one doesn't.

import { describe, expect, it } from "bun:test";
import { RECIPES, RECIPE_KEYS, isRecipeKey, recipeByKey, recipeFromPrompt } from "./recipes";
import { SHOWCASES } from "@/lib/showcase/registry";
import { HERO_CAMPAIGNS, heroDestination } from "@/lib/campaigns";
import { recipeDestination, findPlaceholder, inputKindForRecipe } from "@/lib/showcase/recipe";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";
import { RECIPE_IDS } from "@/lib/email/author-recipes";

/** Every recipe object reachable from a user-facing surface, tagged with the door
 *  it came from — so a failure names the button that drifted. */
function everySurfaceRecipe(): { door: string; recipe: { key?: string; prompt: string } }[] {
  const out: { door: string; recipe: { key?: string; prompt: string } }[] = [];
  for (const s of SHOWCASES) {
    if (s.campaign?.seedRecipe) {
      out.push({ door: `campaign:${s.campaign.key}`, recipe: s.campaign.seedRecipe });
    }
    if (s.campaign?.followUp) {
      out.push({ door: `campaign:${s.campaign.key}:followUp`, recipe: s.campaign.followUp.recipe });
    }
    for (const slide of s.slides) {
      if (slide.recipe) out.push({ door: `slide:${s.id}:${slide.title}`, recipe: slide.recipe });
    }
  }
  for (const h of HERO_CAMPAIGNS) {
    out.push({ door: `hero:${h.key}`, recipe: h.recipe });
  }
  return out;
}

describe("the registry is internally sound", () => {
  it("every key's skeleton, when assigned, is a real committed grid", () => {
    const seedIds = new Set(SEED_DOCS.map((s) => s.id));
    for (const key of RECIPE_KEYS) {
      const { skeleton } = RECIPES[key];
      // null is legitimate: the recipe's worker has not yet assigned one. What is
      // NOT legitimate is naming a skeleton that does not exist — that ships a
      // recipe pointing at nothing and silently falls back to a blank page.
      if (skeleton !== null) {
        expect(
          seedIds.has(skeleton),
          `recipe "${key}" names a skeleton that does not exist: "${skeleton}"`,
        ).toBe(true);
      }
    }
  });

  it("every key's prose recipe, when assigned, is a real author recipe", () => {
    const proseIds = new Set<string>(RECIPE_IDS);
    for (const key of RECIPE_KEYS) {
      const { prose } = RECIPES[key];
      if (prose !== null) {
        expect(
          proseIds.has(prose),
          `recipe "${key}" names a prose recipe that does not exist: "${prose}"`,
        ).toBe(true);
      }
    }
  });

  it("every key's own `key` field matches the map it is filed under", () => {
    for (const key of RECIPE_KEYS) {
      expect(RECIPES[key].key).toBe(key);
    }
  });

  it("every prompt carries exactly one [[blank]] — the thing we ask the user for", () => {
    for (const key of RECIPE_KEYS) {
      const prompt = RECIPES[key].prompt;
      expect(findPlaceholder(prompt), `recipe "${key}" has no [[blank]] to fill`).not.toBeNull();
      // Two blanks means the popup fills one and leaves the other in the prompt —
      // which then reaches the builder as literal "[[...]]" text.
      expect(prompt.match(/\[\[/g)?.length, `recipe "${key}" has more than one [[blank]]`).toBe(1);
    }
  });

  it("a NEW LISTING promises no chart — a prompt must never promise what the build won't ship", () => {
    // The old registry prompt asked for "a chart of the ZIP's home-value trend" while
    // the builder (correctly) ships no chart on a listing. The email then silently
    // lacked the thing the user was told they'd get.
    for (const key of RECIPE_KEYS) {
      const { prompt, chart } = RECIPES[key];
      if (chart === "none") {
        expect(
          /\bchart\b/i.test(prompt),
          `recipe "${key}" ships no chart but its prompt promises one`,
        ).toBe(false);
      }
    }
  });
});

describe("PARITY — the same recipe builds the same thing from every door", () => {
  it("every surface points at a key; none re-types a prompt", () => {
    for (const { door, recipe } of everySurfaceRecipe()) {
      expect(
        isRecipeKey(recipe.key),
        `${door} carries no recipe key — it cannot be routed by identity`,
      ).toBe(true);
    }
  });

  it("two doors offering the SAME key agree on skeleton, subject, chart and prompt", () => {
    const byKey = new Map<string, { door: string; recipe: { key?: string; prompt: string } }[]>();
    for (const entry of everySurfaceRecipe()) {
      const k = entry.recipe.key!;
      byKey.set(k, [...(byKey.get(k) ?? []), entry]);
    }
    for (const [key, entries] of byKey) {
      const canonical = recipeByKey(key)!;
      for (const { door, recipe } of entries) {
        // Identity is the object itself: a surface POINTS at the registry entry, so
        // a re-typed literal (however similar) fails here rather than in production.
        expect(recipe, `${door} does not point at the canonical "${key}" recipe`).toBe(canonical);
      }
    }
  });

  it("the hero pill and the showcase slide for one deliverable are the SAME recipe", () => {
    // The four pills are the only door with no example to look at. If a pill and its
    // showcase card disagree, the user is shown one thing and handed another.
    const slideRecipeKeys = new Set(
      SHOWCASES.flatMap((s) => s.slides.map((sl) => sl.recipe?.key)).filter(Boolean),
    );
    const seedRecipeKeys = new Set(
      SHOWCASES.map((s) => s.campaign?.seedRecipe?.key).filter(Boolean),
    );
    for (const hero of HERO_CAMPAIGNS) {
      const key = hero.recipe.key;
      expect(
        slideRecipeKeys.has(key) || seedRecipeKeys.has(key),
        `hero pill "${hero.key}" offers recipe "${key}", which no showcase demonstrates`,
      ).toBe(true);
    }
  });

  it("the pill's address/area input matches the recipe's declared subject spine", () => {
    // A pill that asks for a street address and then builds an area deliverable (or
    // vice-versa) resolves the wrong subject. `input` is the UI's promise; `subject`
    // is the builder's contract — they must not disagree.
    for (const hero of HERO_CAMPAIGNS) {
      expect(inputKindForRecipe(hero.recipe), `hero pill "${hero.key}"`).toBe(hero.input);
    }
  });
});

describe("the key survives the trip through every door's URL", () => {
  it("recipeDestination carries rkey (showcase card, examples accordion, AI pill)", () => {
    for (const key of RECIPE_KEYS) {
      const url = recipeDestination(RECIPES[key]);
      expect(
        new URLSearchParams(url.split("?")[1]).get("rkey"),
        `recipeDestination lost the key for "${key}"`,
      ).toBe(key);
    }
  });

  it("heroDestination carries rkey, filled address and all", () => {
    for (const hero of HERO_CAMPAIGNS) {
      const url = heroDestination(hero, { filled: "326 Shore Dr, Fort Myers, FL 33905" });
      const params = new URLSearchParams(url.split("?")[1]);
      expect(params.get("rkey"), `hero pill "${hero.key}" lost its key`).toBe(hero.recipe.key!);
    }
  });

  it("an EDITED prompt still routes to the right recipe — the bug that started this", () => {
    // The user types their own address over the [[blank]]. Under string identity that
    // produced a prompt no exact match could find. The key is immune; and even the
    // legacy prompt bridge must survive the edit.
    const filled = RECIPES["just-sold"].prompt.replace(
      /\[\[[^\]]+\]\]/,
      "326 Shore Dr, Fort Myers, FL 33905",
    );
    expect(recipeFromPrompt(filled)?.key).toBe("just-sold");
  });

  it("an organic typed prompt matches nothing and falls through to the generic author", () => {
    expect(recipeFromPrompt("write me something nice about the market")).toBeNull();
    expect(recipeFromPrompt("")).toBeNull();
  });

  it("a stale key from an old link degrades instead of throwing", () => {
    expect(recipeByKey("no-such-recipe")).toBeNull();
    expect(recipeByKey(null)).toBeNull();
  });
});
