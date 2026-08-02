// lib/email/suggest-recipe.ts — suggestion chips: the model PROPOSES, never routes.
// SERVER-ONLY (imports the metered anthropic client) — the lab client never
// imports this; it renders the chip objects the API hands back.
//
// One-lane collapse (spec 2026-08-02, §C): a keyless ask lands on the default
// grid unconditionally; alongside the build, ONE cheap model call may propose up
// to two showcase recipes the ask resembles ("Looks like Just Sold — use that
// grid?"). The proposal is advisory navigation ONLY:
//   - the model returns key STRINGS; anything not in the closed RECIPE_KEYS list
//     is filtered dead (FM3 — a hallucinated key can never route anything);
//   - a chip is an <a href> to the SAME door URL every other surface uses
//     (recipeDestination → ?recipe=<prompt>&rkey=<key>) — clicking it is a door
//     arrival, not a build trigger (FM2);
//   - any failure (model down, garbage output) degrades to NO chips, never an
//     error — the build the user asked for already happened.

import { getAnthropic } from "@/refinery/agents/anthropic.mts";
import { EMAIL_MODEL_HAIKU } from "@/lib/email/model-router";
import { RECIPES, RECIPE_KEYS, isRecipeKey, type RecipeKey } from "@/lib/deliverable/recipes";
import { recipeDestination } from "@/lib/lab-entry/destination";

/** Keys a chip may propose: real showcase grids only — never the default grid
 *  the user is already on, never the social keys (a different renderer). */
const SUGGESTABLE: readonly RecipeKey[] = RECIPE_KEYS.filter(
  (k) => k !== "default-grid" && RECIPES[k].target !== "social",
);

const SUGGEST_SYSTEM =
  "You match a user's email-build request to a deliverable catalog. Reply with a " +
  "JSON array of AT MOST TWO catalog keys that STRONGLY match what the user is " +
  "asking to build, or [] when nothing clearly matches. Only strong matches — an " +
  "ordinary market-update ask matches nothing. Never invent a key. JSON array " +
  "only, no prose.\n\nTHE CATALOG:\n" +
  SUGGESTABLE.map((k) => `- ${k}: ${RECIPES[k].label} — ${RECIPES[k].prompt}`).join("\n");

/** Extract the first JSON array of strings from the model's reply. */
function parseKeys(text: string): string[] {
  const m = text.match(/\[[\s\S]*?\]/);
  if (!m) return [];
  try {
    const arr: unknown = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Up to two suggestable recipe keys the prompt resembles — possibly empty,
 *  NEVER throws. The function has no access to dispatch; it returns strings. */
export async function suggestRecipes(prompt: string): Promise<RecipeKey[]> {
  const p = (prompt ?? "").trim();
  if (!p) return [];
  try {
    const msg = await getAnthropic("email_build").messages.create({
      model: EMAIL_MODEL_HAIKU,
      max_tokens: 100,
      system: SUGGEST_SYSTEM,
      messages: [{ role: "user", content: p }],
    });
    const text = msg.content[0]?.type === "text" ? msg.content[0].text : "";
    const suggestable = new Set<string>(SUGGESTABLE);
    return [...new Set(parseKeys(text))]
      .filter(isRecipeKey)
      .filter((k) => suggestable.has(k))
      .slice(0, 2);
  } catch {
    return []; // no chips, never an error — the build already happened
  }
}

export interface RecipeChip {
  key: RecipeKey;
  label: string;
  /** The door URL (relative in-app path). A chip IS a door — navigation only. */
  href: string;
}

/** Chip objects for the API payload — the client renders these as plain <a>
 *  links and holds zero routing logic of its own (FM2). */
export function suggestionChips(keys: RecipeKey[]): RecipeChip[] {
  return keys.filter(isRecipeKey).map((key) => ({
    key,
    label: RECIPES[key].label,
    href: recipeDestination(RECIPES[key]),
  }));
}
