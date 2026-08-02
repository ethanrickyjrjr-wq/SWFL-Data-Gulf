// lib/email/suggest-recipe.test.ts
//
// The suggestion chips' contract (one-lane collapse, spec 2026-08-02, FM2+FM3):
// the model PROPOSES from the closed key list and NEVER routes. A hallucinated
// key dies at the isRecipeKey filter (FM3); a model failure degrades to no chips,
// never an error; and a chip is a NAVIGATION URL — the same door every other
// surface uses — with no way to trigger a build (FM2).

import { describe, expect, mock, test, afterAll } from "bun:test";
import * as anthropicModule from "@/refinery/agents/anthropic.mts";

// Same process-global mock.module snapshot/restore pattern as build-doc.test.ts.
const anthropicOrig = { ...anthropicModule };
afterAll(() => {
  mock.module("@/refinery/agents/anthropic.mts", () => anthropicOrig);
});

let modelReply: () => string = () => "[]";
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...anthropicOrig,
  getAnthropic: () => ({
    messages: {
      create: async () => ({ content: [{ type: "text", text: modelReply() }] }),
    },
  }),
}));

const { suggestRecipes, suggestionChips } = await import("./suggest-recipe");

describe("suggestRecipes — proposes from the closed list, never routes", () => {
  test("FM3: a hallucinated key is filtered to nothing", async () => {
    modelReply = () => JSON.stringify(["just-sold", "definitely-not-a-key"]);
    expect(await suggestRecipes("just sold 123 Main St")).toEqual(["just-sold"]);
  });

  test("model failure degrades to no chips, never an error", async () => {
    modelReply = () => {
      throw new Error("model down");
    };
    expect(await suggestRecipes("anything at all")).toEqual([]);
  });

  test("unparseable model output degrades to no chips", async () => {
    modelReply = () => "I think this looks like a just-sold email!";
    expect(await suggestRecipes("anything")).toEqual([]);
  });

  test("never more than two", async () => {
    modelReply = () => JSON.stringify(["just-sold", "open-house", "market-pulse", "new-listing"]);
    expect(await suggestRecipes("busy prompt")).toHaveLength(2);
  });

  test("default-grid and social keys are never suggested (chips propose SHOWCASE grids)", async () => {
    modelReply = () => JSON.stringify(["default-grid", "social-pack", "open-house"]);
    expect(await suggestRecipes("something")).toEqual(["open-house"]);
  });

  test("an empty prompt asks the model nothing", async () => {
    modelReply = () => {
      throw new Error("should not be called");
    };
    expect(await suggestRecipes("   ")).toEqual([]);
  });
});

describe("FM2: a chip is a door, not a build trigger", () => {
  test("chips are navigation URLs carrying the recipe identity (rkey), nothing else", () => {
    const chips = suggestionChips(["just-sold"]);
    expect(chips).toHaveLength(1);
    expect(chips[0].label.length).toBeGreaterThan(0);
    // The SAME door URL every other surface uses — identity rides as rkey.
    expect(chips[0].href).toContain("rkey=just-sold");
    // A relative in-app path — never a handler, never an API call.
    expect(chips[0].href.startsWith("/")).toBe(true);
    expect(chips[0].href).not.toContain("/api/");
  });
});
