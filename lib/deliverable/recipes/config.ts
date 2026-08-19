// lib/deliverable/recipes/config.ts
//
// THE DECLARATIVE ~80% OF A LIFECYCLE RECIPE (recipes-as-config, spec 2026-08-18).
//
// A RecipeConfig is DATA: it must survive JSON.parse(JSON.stringify(c)) identical —
// config.test.ts enforces that over every configured recipe, which is the hard wall
// against the config-creep-toward-a-DSL failure mode. Anything needing logic is a
// NAMED derivation in derivations.ts, referenced by key.
//
// CONFIGS LIVE INSIDE THE ONE REGISTRY. `Recipe` (recipes.ts) gained a `config?`
// field; there is no parallel config store and there must never be one (the 08/02
// sin, named in the spec's failure modes). CONFIGURED_RECIPES() below reads RECIPES
// and nothing else — the fleet tests iterate it, so every migrated recipe is covered
// the moment its literal lands in the registry.
import { RECIPES, RECIPE_KEYS } from "@/lib/deliverable/recipes";
import type { RecipeKey } from "@/lib/deliverable/recipes";
import type { CellKey } from "./cell-catalog";

/** Where the ONE button lands. An enum, never a URL template — §1.8's rule that the
 *  label must match the destination is enforced by the builder per destination kind.
 *    "brand-site" — the agent's own site (brandWebsiteUrl(currentDoc) ?? SWFL site).
 *    "listing"    — the subject's real listing page; unresolved → the slot stays
 *                   empty, NEVER our homepage (role "listing" semantics, 08/05). */
export type CtaDestination = "brand-site" | "listing";

export interface RecipeConfig {
  key: RecipeKey;
  /** The chrome's ribbon word — "Under Contract", "Just Sold", … */
  ribbon: string;
  /** Subject-line templates, deterministic, never model-authored. Placeholders:
   *  {street} {city} plus any derivation subjectVars. Ladder: withStreet →
   *  withCity → bare (suppressAddress skips the street rung). `bareWithDays` is
   *  the research's strongest form ("Under contract in 9 days") — used at the bare
   *  rung ONLY when a derivation resolved {days}; a template must never ship with
   *  a dissolved placeholder. */
  subject: { withStreet: string; withCity: string; bare: string; bareWithDays?: string };
  /** Photo alt template. Placeholder: {address}. */
  photoAlt: string;
  /** Ordered spec-strip cells, by catalog key. The HOA incident lived exactly here —
   *  a ruling on a cell is now a catalog/policy change, not an N-file walk. */
  specs: CellKey[];
  /** Suppress the street address everywhere (coming-soon's whole point). */
  suppressAddress?: boolean;
  /** Render the seller's remarks verbatim in the reserved descriptionSlot. */
  includeDescription: boolean;
  /** The recipe's own MIDDLE and TAIL, as derivation keys, in render order. */
  middle: string[];
  tail: string[];
  /** The ONE button. */
  ctaLabel: string;
  ctaDestination: CtaDestination;
  /** Narrator framing prose (data, not code). Absent = no narrator call — the
   *  narrative slot ships as an open slot. `common` is appended to whichever branch
   *  fires. */
  framing?: { withDescription: string; withoutDescription: string; common: string };
  /** Phrases that DROP the authored paragraph to an open slot (lowercased match) —
   *  under-contract's SOLD_LANGUAGE class. Render scripts read this same field, so
   *  the guard and its bytes-assertion can never diverge. */
  bannedNarrativePhrases?: string[];
  /** ListingFacts keys stripped from the narrator's sheet (claim-gate architecture:
   *  a fact you hand the writer is a fact it will try to use). */
  narratorStrips?: string[];
  /** Numeric/string knobs the recipe's derivations read (e.g. minMedianSample).
   *  Flat and serializable — a knob is a decision, not a magic number. */
  params?: Record<string, number | string>;
}

/** Template fill: "{street}" → vars.street ?? "". Unknown placeholder → "". */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

/**
 * THE SUBJECT LADDER — deterministic, never model-authored. street → city → bare;
 * `suppressAddress` skips the street rung (coming-soon). At the bare rung,
 * `bareWithDays` fires only when a derivation actually resolved {days} — a subject
 * always resolves and never ships a dissolved placeholder. Lives HERE (pure config
 * + facts picks) so recipe compat shims can reach it without importing the builder.
 */
export function subjectFor(
  config: RecipeConfig,
  facts: { address?: string; city?: string },
  subjectVars: Record<string, string>,
): string {
  const street =
    String(facts.address ?? "")
      .split(",")[0]
      ?.trim() ?? "";
  if (street && !config.suppressAddress) {
    return renderTemplate(config.subject.withStreet, { street, ...subjectVars });
  }
  const city = facts.city?.trim();
  if (city) return renderTemplate(config.subject.withCity, { city, ...subjectVars });
  if (subjectVars.days && config.subject.bareWithDays) {
    return renderTemplate(config.subject.bareWithDays, subjectVars);
  }
  return renderTemplate(config.subject.bare, subjectVars).trim() || config.ribbon;
}

/** Every registry entry that carries a config. The fleet tests iterate THIS. */
export function CONFIGURED_RECIPES(): { key: RecipeKey; config: RecipeConfig }[] {
  const out: { key: RecipeKey; config: RecipeConfig }[] = [];
  for (const key of RECIPE_KEYS) {
    const config = RECIPES[key].config;
    if (config) out.push({ key, config });
  }
  return out;
}
