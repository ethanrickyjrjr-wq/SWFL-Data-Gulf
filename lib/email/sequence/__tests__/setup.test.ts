import { describe, expect, test } from "bun:test";
import { PLATFORM_ARC } from "@/lib/email/sequence/types";
import { applySetup, markBuilt, markScheduled } from "@/lib/email/sequence/state";
import { resolveArmSteps, snapshotSetup } from "@/lib/email/sequence/setup";

describe("setups", () => {
  test("snapshotSetup strips runtime state, keeps the recipe", () => {
    let s = markBuilt(applySetup(PLATFORM_ARC), "sold", "d-1");
    s = markScheduled(s, "sold", 5, "2026-07-08T13:00:00Z");
    const snap = snapshotSetup(s);
    expect(snap).toHaveLength(5);
    for (const step of snap) {
      expect(step).not.toHaveProperty("state");
      expect(step).not.toHaveProperty("deliverable_id");
      expect(step).not.toHaveProperty("schedule_id");
      expect(step.recipe_prompt.length).toBeGreaterThan(0);
    }
  });
  test("resolveArmSteps prefers the user default", () => {
    const mine = PLATFORM_ARC.map((s) => ({
      ...s,
      recipe_prompt: s.recipe_prompt + " In my voice.",
    }));
    const r = resolveArmSteps([{ name: "Luxury arc", is_default: true, steps: mine }]);
    expect(r.source).toBe("Luxury arc");
    expect(r.steps[0].recipe_prompt).toContain("In my voice.");
  });
  test("no default → platform arc", () => {
    const r = resolveArmSteps([{ name: "Spare", is_default: false, steps: PLATFORM_ARC }]);
    expect(r.source).toBe("platform");
    expect(r.steps).toEqual(PLATFORM_ARC);
  });
  test("corrupt saved default falls back to platform, never throws", () => {
    const r = resolveArmSteps([{ name: "Broken", is_default: true, steps: { not: "an array" } }]);
    expect(r.source).toBe("platform");
  });
});
