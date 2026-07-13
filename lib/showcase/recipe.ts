// lib/showcase/recipe.ts
//
// Pure helpers for showcase recipes — the "Make this →" flow (spec:
// docs/superpowers/specs/2026-07-03-email-lab-make-this-design.md). A recipe is
// the one-line author prompt that rebuilds an example for the user's own
// listing/farm, plus the brand fields the artifact leans on. Client-safe: no
// fs, no server imports (rides in the browser bundle with the registry).

/** Brand-profile keys a recipe leans on — MUST match the Brand panel's field
 *  keys (components/brand/BrandingBlock.tsx). */
export type BrandNeed = "agent_name" | "photo_url" | "brokerage" | "business_address";

export interface ShowcaseRecipe {
  /** One-line author prompt; carries exactly one [[blank]] the UI pre-selects. */
  prompt: string;
  /** Brand fields the built artifact uses — gaps trigger the add-info yes/no. */
  needs: readonly BrandNeed[];
  /** Which builder this recipe seeds — "email" (default, omitted on existing
   *  recipes) opens the email lab's Build box; "social" opens the social
   *  composer's Build-with-AI box instead. Read by `recipeDestination` below. */
  target?: "email" | "social";
}

/** Plain-words labels for the gap prompt ("your name, your headshot"). */
export const NEED_LABELS: Record<BrandNeed, string> = {
  agent_name: "your name",
  photo_url: "your headshot",
  brokerage: "your brokerage",
  business_address: "your business address",
};

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

/** The recipe needs the brand blob doesn't fill (empty/whitespace = missing). */
export function brandGaps(
  needs: readonly BrandNeed[],
  branding: Record<string, string>,
): BrandNeed[] {
  return needs.filter((k) => !(branding[k] ?? "").trim());
}

/** A headshot is an upload the Brand panel owns — it can't be typed into a popup,
 *  so the ask-before-build boxes leave it out rather than dead-ending on it. */
export function typableGaps(
  needs: readonly BrandNeed[],
  branding: Record<string, string>,
): BrandNeed[] {
  return brandGaps(needs, branding).filter((k) => k !== "photo_url");
}

/**
 * What the ask-before-build popup should ask for — read from the [[blank]]'s own
 * hint, never assumed. The arrival door used to hardcode "address", so a farm/area
 * recipe ("...about [[your city or ZIP]]") demanded a street address. The hint is
 * the only honest signal, and BOTH doors read it here so they can't drift apart.
 * null = the prompt carries no blank, so there's no place to ask for.
 */
export function inputKindForPrompt(prompt: string): "address" | "area" | null {
  const hint = findPlaceholder(prompt)?.hint.toLowerCase();
  if (!hint) return null;
  return /area|farm|zip|city|neighborhood|market|region/.test(hint) ? "area" : "address";
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
  if (recipe.needs.length > 0) params.set("recipeNeeds", recipe.needs.join(","));
  const isSocial = recipe.target === "social";
  const base = opts.projectId
    ? `/project/${opts.projectId}/${isSocial ? "social" : "email-lab"}`
    : isSocial
      ? "/social-lab"
      : "/email-lab/grid";
  return `${base}?${params.toString()}`;
}
