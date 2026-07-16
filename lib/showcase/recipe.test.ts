import { describe, it, expect } from "bun:test";
import {
  NEED_LABELS,
  brandGaps,
  findPlaceholder,
  recipeDestination,
  typableGaps,
  type BrandNeed,
} from "./recipe";
import { SHOWCASES } from "./registry";
import { profileFieldSpec } from "@/lib/brand/profile-ledger";

describe("findPlaceholder", () => {
  it("returns the exact span of the [[blank]] including brackets", () => {
    const prompt = "Build an email for [[your listing address]] with real comps.";
    const ph = findPlaceholder(prompt);
    expect(ph).not.toBeNull();
    expect(prompt.slice(ph!.start, ph!.end)).toBe("[[your listing address]]");
    expect(ph!.hint).toBe("your listing address");
  });

  it("returns null when there is no blank", () => {
    expect(findPlaceholder("Build a market email for Cape Coral.")).toBeNull();
  });

  it("finds a blank at the start of the prompt (index 0 is not falsy-dropped)", () => {
    const ph = findPlaceholder("[[your city or ZIP]] monthly pulse");
    expect(ph).not.toBeNull();
    expect(ph!.start).toBe(0);
    expect(ph!.end).toBe("[[your city or ZIP]]".length);
  });
});

describe("brandGaps", () => {
  const needs: readonly BrandNeed[] = ["agent_name", "photo_url", "brokerage"];

  it("returns only the missing keys, preserving order", () => {
    expect(brandGaps(needs, { agent_name: "Dani Vero" })).toEqual(["photo_url", "brokerage"]);
  });

  it("treats whitespace-only values as missing", () => {
    expect(brandGaps(needs, { agent_name: "  ", photo_url: "x", brokerage: "y" })).toEqual([
      "agent_name",
    ]);
  });

  it("returns [] when every need is filled", () => {
    expect(brandGaps(needs, { agent_name: "a", photo_url: "b", brokerage: "c" })).toEqual([]);
  });
});

describe("recipeDestination", () => {
  it("routes a social-target recipe to /social-lab when there is no project", () => {
    const dest = recipeDestination({
      prompt: "Build a social post for [[your city or ZIP]]",
      needs: ["agent_name"],
      target: "social",
    });
    expect(dest.startsWith("/social-lab?")).toBe(true);
  });

  it("routes a social-target recipe to /project/<id>/social inside a project", () => {
    const dest = recipeDestination(
      {
        prompt: "Build a social post for [[your city or ZIP]]",
        needs: ["agent_name"],
        target: "social",
      },
      { projectId: "proj-123" },
    );
    expect(dest.startsWith("/project/proj-123/social?")).toBe(true);
  });

  it("routes an email-target (default) recipe to /email-lab/grid, not social", () => {
    const dest = recipeDestination({
      prompt: "Build an email for [[your listing address]]",
      needs: ["agent_name"],
    });
    expect(dest.startsWith("/email-lab/grid?")).toBe(true);
  });

  it("every social-target recipe in the live registry routes through recipeDestination to a social builder", () => {
    const socialRecipes = SHOWCASES.flatMap((s) => s.slides)
      .map((sl) => sl.recipe)
      .filter((r): r is NonNullable<typeof r> => !!r && r.target === "social");
    expect(socialRecipes.length).toBeGreaterThan(0);
    for (const recipe of socialRecipes) {
      expect(recipeDestination(recipe)).toBe(
        "/social-lab?" +
          new URLSearchParams({
            recipe: recipe.prompt,
            // The recipe KEY rides with the seed text now — it is the identity the
            // builder dispatches on, so every destination carries it.
            ...(recipe.key ? { rkey: recipe.key } : {}),
            ...(recipe.needs.length > 0 ? { recipeNeeds: recipe.needs.join(",") } : {}),
          }).toString(),
      );
    }
  });
});

describe("NEED_LABELS", () => {
  it("has a plain-words label for every need key", () => {
    for (const label of Object.values(NEED_LABELS)) {
      expect(label.length).toBeGreaterThan(3);
      // Plain words for end users — no snake_case leaking into UI copy.
      expect(label.includes("_")).toBe(false);
    }
  });
});

describe("recipe brand needs delegate to the profile ledger", () => {
  it("NEED_LABELS phrasing comes verbatim from the ledger", () => {
    for (const [key, label] of Object.entries(NEED_LABELS)) {
      expect(label).toBe(profileFieldSpec(key)?.label as string);
    }
    // The exact strings the popups already show — pinned so the delegation
    // refactor cannot silently change user-facing copy.
    expect(NEED_LABELS.agent_name).toBe("your name");
    expect(NEED_LABELS.photo_url).toBe("your headshot");
    expect(NEED_LABELS.brokerage).toBe("your brokerage");
    expect(NEED_LABELS.business_address).toBe("your business address");
  });

  it("brandGaps/typableGaps behavior is unchanged", () => {
    const needs = ["agent_name", "photo_url", "brokerage"] as const;
    const branding = { agent_name: "Marisol Vega" };
    expect(brandGaps(needs, branding)).toEqual(["photo_url", "brokerage"]);
    expect(typableGaps(needs, branding)).toEqual(["brokerage"]);
  });
});
