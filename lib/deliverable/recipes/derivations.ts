// lib/deliverable/recipes/derivations.ts
//
// THE IRREDUCIBLE ~20% (recipes-as-config, spec 2026-08-18, Approach B).
//
// Named, typed functions a RecipeConfig references BY KEY — the speed ladder, comps
// banding, scarcity funnels. This is the deliberate wall against the config-DSL
// failure mode: logic lives here as reviewable TypeScript, never as strings inside a
// config. Keys are namespaced "<recipe-key>/<name>" ("under-contract/speed").
//
// REGISTRATION DIRECTION IS ONE-WAY: this file imports recipe modules; a recipe
// module never imports this file. That keeps recipes free of each other and keeps
// the registry the single place a key is born.
//
// A config referencing a missing key fails derivations.test.ts at CI. At runtime a
// derivation that THROWS degrades to no blocks (RULE 0.7): the email ships quieter,
// never broken, never invented.
import { underContractSpeed, underContractSpeedSources } from "./under-contract";
import type { ChromeBlock } from "@/lib/email/lifecycle-chrome";
import type { RecipeBuildContext } from "./index";

export interface DerivationResult {
  /** Blocks for the slot (middle or tail) the config listed this key under. */
  blocks: ChromeBlock[];
  /** Values the subject-line templates may reference (e.g. { days: "9" }). */
  subjectVars?: Record<string, string>;
  /** Settled fact sentences for the narrator's claim gate (shared.ts
   *  `authorListingNarrative` opts.anchors — "a fact you want the narrator to
   *  state goes HERE, not in the framing", measured on Just Sold 08/06/2026). */
  anchors?: string[];
}

export type Derivation = (
  ctx: RecipeBuildContext,
  params: Record<string, number | string>,
) => Promise<DerivationResult>;

/** Keys land here per migration (plan 2026-08-19, Task 5+). */
export const DERIVATIONS: Record<string, Derivation> = {
  // R4 · UNDER CONTRACT — the speed ladder (middle) + its disclosed-criterion
  // sources note (tail). One live read per build (memoized in the recipe module).
  "under-contract/speed": underContractSpeed,
  "under-contract/speed-sources": underContractSpeedSources,
};

export async function runDerivations(
  keys: readonly string[],
  ctx: RecipeBuildContext,
  params: Record<string, number | string>,
): Promise<{ blocks: ChromeBlock[]; subjectVars: Record<string, string>; anchors: string[] }> {
  const blocks: ChromeBlock[] = [];
  const subjectVars: Record<string, string> = {};
  const anchors: string[] = [];
  for (const k of keys) {
    const d = DERIVATIONS[k];
    if (!d) continue;
    try {
      const r = await d(ctx, params);
      blocks.push(...r.blocks);
      Object.assign(subjectVars, r.subjectVars ?? {});
      anchors.push(...(r.anchors ?? []));
    } catch {
      // Degrade quiet — the email ships without this block, never half of one.
    }
  }
  return { blocks, subjectVars, anchors };
}
