// lib/lab-entry/destination.test.ts
import { describe, expect, test } from "bun:test";
import {
  openDoc,
  openSeed,
  openZipLab,
  arcStepDestination,
  signedInLabArrival,
  projectEmailLabBase,
} from "./destination";

describe("lab-entry destination builder", () => {
  test("openDoc builds the ?did= open-existing URL", () => {
    expect(openDoc("p1", "d9")).toBe("/project/p1/email-lab?did=d9");
    expect(openDoc("p1", "d9", { schedule: true })).toBe("/project/p1/email-lab?did=d9&schedule=1");
  });

  test("openSeed builds the ?seed= template URL", () => {
    expect(openSeed("p1", "skeleton-clean-white")).toBe(
      "/project/p1/email-lab?seed=skeleton-clean-white",
    );
  });

  test("openZipLab carries zip + optional addr/ref", () => {
    expect(openZipLab("33901")).toBe("/email-lab?zip=33901");
    expect(openZipLab("33901", { addr: "123 Main St", ref: "abc" })).toBe(
      "/email-lab?zip=33901&addr=123+Main+St&ref=abc",
    );
  });

  test("arcStepDestination carries step seed + recipe (+ did when present)", () => {
    const url = arcStepDestination("p1", {
      key: "coming-soon",
      seed_doc_id: "seed-x",
      recipe_prompt: "Coming soon email for [[your listing address]]",
    });
    expect(url).toContain("/project/p1/email-lab?arcStep=coming-soon");
    expect(url).toContain("seed=seed-x");
    expect(url).toContain("recipe=");
    expect(url).not.toContain("did=");
  });

  test("signedInLabArrival ALWAYS lands on /email-lab/grid — never picks a project", () => {
    expect(signedInLabArrival()).toBe("/email-lab/grid");
    expect(signedInLabArrival({ zip: "33901" })).toBe("/email-lab/grid?zip=33901");
    const withRecipe = signedInLabArrival({ recipe: "Make X", recipeNeeds: "agent_name" });
    expect(withRecipe.startsWith("/email-lab/grid?")).toBe(true);
    expect(withRecipe).toContain("recipe=Make+X");
    expect(withRecipe).toContain("recipeNeeds=agent_name");
    // The disease we're curing: no project id EVER appears.
    expect(signedInLabArrival({ recipe: "Make X" })).not.toContain("/project/");
  });

  test("projectEmailLabBase is the canonical in-project base", () => {
    expect(projectEmailLabBase("p1")).toBe("/project/p1/email-lab");
  });
});
