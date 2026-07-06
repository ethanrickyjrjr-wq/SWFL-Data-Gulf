import { describe, expect, test } from "bun:test";
import {
  PLATFORM_ARC,
  SequenceStepsSchema,
  STEP_KEYS,
  stepSectionLabels,
} from "@/lib/email/sequence/types";
import { seedById } from "@/lib/email/doc/default-docs";

describe("PLATFORM_ARC", () => {
  test("five steps, in lifecycle order", () => {
    expect(PLATFORM_ARC.map((s) => s.key)).toEqual([
      "coming-soon",
      "new-listing",
      "market-comps",
      "under-contract",
      "sold",
    ]);
    expect(STEP_KEYS.length).toBe(5);
  });
  test("every step's seed doc exists and prompt carries the address blank", () => {
    for (const s of PLATFORM_ARC) {
      expect(seedById(s.seed_doc_id)).toBeDefined();
      expect(s.recipe_prompt).toContain("[[your listing address]]");
    }
  });
  test("steps jsonb round-trips through the zod schema", () => {
    const steps = PLATFORM_ARC.map((s) => ({ ...s, state: "pending" as const }));
    const parsed = SequenceStepsSchema.safeParse(JSON.parse(JSON.stringify(steps)));
    expect(parsed.success).toBe(true);
  });
  test("stepSectionLabels returns a non-empty section list for each step", () => {
    for (const s of PLATFORM_ARC) {
      expect(stepSectionLabels(s.seed_doc_id).length).toBeGreaterThan(0);
    }
  });
});
