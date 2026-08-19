// lib/deliverable/recipes/config.test.ts
//
// THE FLEET GUARDS for recipes-as-config (spec 2026-08-18, failure mode 1: "config
// creep toward a DSL"). A RecipeConfig is DATA — it survives a JSON round-trip
// identical, or it fails here. And configs live INSIDE the one registry (failure
// mode 2: "a second registry") — CONFIGURED_RECIPES reads RECIPES, nothing else.
import { describe, expect, test } from "bun:test";
import { RECIPES } from "@/lib/deliverable/recipes";
import { CONFIGURED_RECIPES, renderTemplate } from "./config";

describe("RecipeConfig fleet", () => {
  test("every config survives a JSON round-trip identical (no functions, no Dates)", () => {
    for (const { key, config } of CONFIGURED_RECIPES()) {
      expect(JSON.parse(JSON.stringify(config))).toEqual(config as unknown as object);
      expect(key).toBe(config.key);
    }
  });

  test("configs live INSIDE the one registry — CONFIGURED_RECIPES reads RECIPES", () => {
    for (const { key, config } of CONFIGURED_RECIPES()) {
      expect(RECIPES[key].config).toBe(config);
    }
  });
});

describe("renderTemplate", () => {
  test("fills {placeholders} and leaves unknown ones empty", () => {
    expect(renderTemplate("Under contract: {street}", { street: "326 Shore Dr" })).toBe(
      "Under contract: 326 Shore Dr",
    );
    expect(renderTemplate("Hi {nobody}", {})).toBe("Hi ");
  });

  test("a template with no placeholders is returned verbatim", () => {
    expect(renderTemplate("Under contract", { street: "x" })).toBe("Under contract");
  });
});
