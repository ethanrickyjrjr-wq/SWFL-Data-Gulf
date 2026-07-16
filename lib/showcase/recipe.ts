// lib/showcase/recipe.ts
//
// Pure helpers for showcase recipes — the "Make this →" flow (spec:
// docs/superpowers/specs/2026-07-03-email-lab-make-this-design.md). A recipe is
// the one-line author prompt that rebuilds an example for the user's own
// listing/farm, plus the brand fields the artifact leans on. Client-safe: no
// fs, no server imports (rides in the browser bundle with the registry).

import { RECIPES, type RecipeKey } from "@/lib/deliverable/recipes";
import {
  profileFieldSpec,
  typableProfileGaps,
  profileGaps as ledgerGaps,
} from "@/lib/brand/profile-ledger";

/** Brand-profile keys a recipe leans on. Keys live in the profile ledger (the
 *  one authority — lib/brand/profile-ledger.ts); this union just narrows which
 *  of them a RECIPE may declare. */
export type BrandNeed = "agent_name" | "photo_url" | "brokerage" | "business_address";

export interface ShowcaseRecipe {
  /** THE IDENTITY (lib/deliverable/recipes.ts). Every door carries it, and the
   *  builder dispatches on it — this is what makes the hero pill, the showcase
   *  card, the campaign button and the lab pick produce the SAME thing. The
   *  prompt below is seed TEXT, never identity: a user typing over the [[blank]]
   *  changes the prompt but must never change which deliverable gets built.
   *  Optional only so the legacy prompt-carrying paths still type-check; a recipe
   *  reaching the builder without one falls back to `recipeFromPrompt`. */
  key?: RecipeKey;
  /** One-line author prompt; carries exactly one [[blank]] the UI pre-selects. */
  prompt: string;
  /** Brand fields the built artifact uses — gaps trigger the add-info yes/no. */
  needs: readonly BrandNeed[];
  /** Which builder this recipe seeds — "email" (default, omitted on existing
   *  recipes) opens the email lab's Build box; "social" opens the social
   *  composer's Build-with-AI box instead. Read by `recipeDestination` below. */
  target?: "email" | "social";
}

/** Plain-words labels for the gap prompt — read from the ledger so popup copy
 *  and Brand-panel copy can never drift apart. */
export const NEED_LABELS: Record<BrandNeed, string> = Object.fromEntries(
  (["agent_name", "photo_url", "brokerage", "business_address"] as const).map((k) => [
    k,
    profileFieldSpec(k)?.label ?? k,
  ]),
) as Record<BrandNeed, string>;

const PLACEHOLDER_RE = /\[\[([^\]]+)\]\]/;

/** The [[blank]] span in a prompt — selection range (brackets included, so
 *  typing replaces the whole token) + the human hint inside the brackets. */
export function findPlaceholder(
  prompt: string,
): { start: number; end: number; hint: string } | null {
  const m = PLACEHOLDER_RE.exec(prompt);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length, hint: m[1] };
}

/** The recipe needs the brand blob doesn't fill (empty/whitespace = missing).
 *  Thin delegate over the ledger — kept for its narrower BrandNeed[] shape. */
export function brandGaps(
  needs: readonly BrandNeed[],
  branding: Record<string, string>,
): BrandNeed[] {
  return ledgerGaps(branding, needs).map((s) => s.key as BrandNeed);
}

/** A headshot is an upload the Brand panel owns — it can't be typed into a popup,
 *  so the ask-before-build boxes leave it out rather than dead-ending on it. */
export function typableGaps(
  needs: readonly BrandNeed[],
  branding: Record<string, string>,
): BrandNeed[] {
  return typableProfileGaps(branding, needs).map((s) => s.key as BrandNeed);
}

/**
 * What the ask-before-build popup should ask for, when a prompt is ALL we hold —
 * read from the [[blank]]'s own hint, never assumed. The arrival door used to
 * hardcode "address", so a farm/area recipe ("...about [[your city or ZIP]]")
 * demanded a street address. null = no blank, so there's nothing to ask for.
 *
 * This is the LEGACY BRIDGE. Prefer `inputKindForRecipe` — a recipe that carries
 * its key has already DECLARED its subject spine, and a declared fact always beats
 * a fact re-derived from prose. Keep this only for the paths that hold a bare
 * prompt string (an old link, a stored arc step, an organic typed ask).
 */
export function inputKindForPrompt(prompt: string): "address" | "area" | null {
  const hint = findPlaceholder(prompt)?.hint.toLowerCase();
  if (!hint) return null;
  return /area|farm|zip|city|neighborhood|market|region/.test(hint) ? "area" : "address";
}

/**
 * What the ask-before-build popup should ask for — THE ONE AUTHORITY.
 *
 * A recipe's subject spine is declared once, on its key (lib/deliverable/recipes.ts),
 * because it is a property of the DELIVERABLE, not of the sentence that seeds it. An
 * "agent" recipe asks for an area too: the agent is who signs it, but the place is
 * what the reader wants ("...about [[your city or ZIP]]").
 *
 * Falls back to the prompt hint when the recipe carries no key, so legacy links keep
 * working instead of dead-ending.
 */
export function inputKindForRecipe(recipe: ShowcaseRecipe): "address" | "area" | null {
  const declared = recipe.key ? RECIPES[recipe.key]?.subject : undefined;
  if (declared) return declared === "address" ? "address" : "area";
  return inputKindForPrompt(recipe.prompt);
}

/**
 * THE ROOT for "Make this →" navigation — every host that carries a recipe to
 * a builder (the /showcase page, the AI-chat pill's BriefcasePanel, and any
 * future example surface) should call this instead of re-deriving the path +
 * query string itself. One place to fix if the URL scheme or a target route
 * ever changes.
 *
 * `?recipe=<prompt>&recipeNeeds=<comma needs>` is the established carry (see
 * lib/project/lab-redirect.ts, which threads the SAME two params through the
 * signed-in email-lab redirect). Picks the builder by `recipe.target`
 * ("email", the default, or "social") and by whether the caller is already
 * inside a project:
 *   - email, no project  → /email-lab/grid   (anonymous-usable today)
 *   - email, in project  → /project/<id>/email-lab
 *   - social, no project → /social-lab       (login-gated: no anonymous
 *     social composer exists yet — see app/social-lab/page.tsx)
 *   - social, in project → /project/<id>/social
 */
export function recipeDestination(
  recipe: ShowcaseRecipe,
  opts: { projectId?: string | null } = {},
): string {
  const params = new URLSearchParams({ recipe: recipe.prompt });
  // THE IDENTITY rides beside the prompt, never inside it. `recipe` stays the seed
  // TEXT (the build box shows it, the user types over the [[blank]]); `rkey` is what
  // the builder dispatches on. Carrying both keeps every old link working while making
  // the build immune to prompt edits — the bug that let one deliverable become two.
  if (recipe.key) params.set("rkey", recipe.key);
  if (recipe.needs.length > 0) params.set("recipeNeeds", recipe.needs.join(","));
  const isSocial = recipe.target === "social";
  const base = opts.projectId
    ? `/project/${opts.projectId}/${isSocial ? "social" : "email-lab"}`
    : isSocial
      ? "/social-lab"
      : "/email-lab/grid";
  return `${base}?${params.toString()}`;
}
