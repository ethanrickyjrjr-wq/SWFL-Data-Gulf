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
