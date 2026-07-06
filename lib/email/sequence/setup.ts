/** lib/email/sequence/setup.ts — pure setup snapshot + arm-time resolution.
 *  A setup is the agent's reusable arc (prompts + layouts) — NEVER project data
 *  (operator rule 07/05/2026). */
import { PLATFORM_ARC, SetupStepsSchema, type SequenceStep, type SetupStep } from "./types";

export function snapshotSetup(steps: SequenceStep[]): SetupStep[] {
  return steps.map(({ key, title, recipe_prompt, seed_doc_id }) => ({
    key,
    title,
    recipe_prompt,
    seed_doc_id,
  }));
}

export function resolveArmSteps(setups: { name: string; is_default: boolean; steps: unknown }[]): {
  source: string;
  steps: SetupStep[];
} {
  const def = setups.find((s) => s.is_default);
  if (def) {
    const parsed = SetupStepsSchema.safeParse(def.steps);
    if (parsed.success && parsed.data.length > 0) return { source: def.name, steps: parsed.data };
  }
  return { source: "platform", steps: PLATFORM_ARC };
}
