// Recipe routing + the zero-digit guarantee. Recipes are ADVISORY prose appended
// to authorSystem — deterministic keyword detection, never a gate (RULE C2). A
// recipe containing a digit would collide with the no-invention prose lint, so
// zero digits is test-enforced here.
import { test, expect, describe } from "bun:test";
import { detectRecipe, recipeSection, RECIPE_IDS, type RecipeId } from "./author-recipes";

describe("detectRecipe — deterministic keyword routing", () => {
  const cases: Array<[string, RecipeId | null]> = [
    // prospect welcome / agent intro
    ["Welcome new subscribers to my list", "agent-intro"],
    ["introduce me as their new agent", "agent-intro"],
    ["Meet your Cape Coral agent", "agent-intro"],
    // monthly newsletter
    ["our monthly market digest", "monthly-newsletter"],
    ["send the July newsletter", "monthly-newsletter"],
    // editorial family + sub-recipes
    ["make it fancy", "editorial-magazine"],
    ["an elegant letter to past clients", "editorial-letter"],
    ["a luxury property showcase", "editorial-showcase"],
    ["magazine issue for my sphere", "editorial-magazine"],
    ["something editorial", "editorial-magazine"],
    // precedence: welcome beats editorial keywords; monthly beats "letter"
    ["a fancy welcome email", "agent-intro"],
    ["monthly letter to clients", "monthly-newsletter"],
    // "newsletter" must NOT trip the editorial \bletter\b sub-keyword
    ["quarterly newsletter", "monthly-newsletter"],
    // agent-launch campaign prompts (registry seed + weekly follow-up)
    [
      "Build my agent-launch announcement email introducing me to my sphere — open like a personal letter",
      "agent-intro",
    ],
    [
      "Build a weekly sphere market update for Bonita Springs — one national or Florida headline number set beside my own area's number",
      "sphere-weekly",
    ],
    // weekly must not trip monthly, and an intro mentioning a weekly update stays a welcome
    ["a weekly market update for my farm", "sphere-weekly"],
    ["introduce me and mention my weekly market update", "agent-intro"],
    // year-in-review — distilled 07/05/2026 (see PROVENANCE in author-recipes.ts)
    ["Build my year-in-review email for my sphere", "year-in-review"],
    ["an annual recap of the Cape Coral market", "year-in-review"],
    // precedence: year-end/annual beats monthly's "newsletter" keyword…
    ["year-end newsletter for my farm", "year-in-review"],
    // …but welcome and sphere-weekly still win before it
    ["introduce me and mention my annual review", "agent-intro"],
    ["a weekly market update with a year-end recap teaser", "sphere-weekly"],
    // bare "review" near-miss stays generic
    ["review this contract for me", null],
    // no match → null → generic prompt unchanged
    ["price update for Cape Coral", null],
    ["", null],
  ];
  for (const [prompt, expected] of cases) {
    test(`"${prompt}" → ${expected}`, () => {
      expect(detectRecipe(prompt)).toBe(expected);
    });
  }

  test("detection is case-insensitive", () => {
    expect(detectRecipe("WELCOME ABOARD")).toBe("agent-intro");
    expect(detectRecipe("Monthly DIGEST")).toBe("monthly-newsletter");
  });
});

describe("recipeSection — advisory prose", () => {
  test("every recipe exists, is non-trivial, and starts with a RECIPE header", () => {
    for (const id of RECIPE_IDS) {
      const text = recipeSection(id);
      expect(text.length).toBeGreaterThan(200);
      expect(text.startsWith("RECIPE")).toBe(true);
    }
  });

  test("recipe text contains ZERO digits (prose-lint safety, test-enforced)", () => {
    for (const id of RECIPE_IDS) {
      expect(/\d/.test(recipeSection(id))).toBe(false);
    }
  });

  test("every recipe states that the footer always renders (CAN-SPAM)", () => {
    for (const id of RECIPE_IDS) {
      expect(recipeSection(id).toLowerCase()).toContain("footer");
    }
  });
});

describe("authorSystem wiring", () => {
  test("a recipe rides as its own section; without one the prompt is byte-identical", async () => {
    const { authorSystem } = await import("./author-doc");
    const base = {
      menu: [],
      dossier: "",
      vocabulary: ["text", "footer"],
      hasChart: false,
      hasPhoto: false,
    };
    const plain = authorSystem(base);
    const withRecipe = authorSystem({ ...base, recipe: recipeSection("agent-intro") });
    expect(withRecipe).toContain("RECIPE — AGENT LAUNCH / PROSPECT WELCOME");
    expect(withRecipe.startsWith(plain)).toBe(true); // appended, nothing else moved
    expect(authorSystem(base)).toBe(plain); // no-recipe path unchanged
  });
});
