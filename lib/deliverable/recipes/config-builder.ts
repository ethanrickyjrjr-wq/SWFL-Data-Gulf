// lib/deliverable/recipes/config-builder.ts
//
// THE ONE CONFIG BUILDER (recipes-as-config, spec 2026-08-18, Approach B).
//
// Consumes a RecipeConfig + the derivations it names and hands `buildLifecycleEmail`
// its chrome — exactly what every hand-coded lifecycle builder did, generically.
// This file is the only place a configured recipe's control flow lives; a recipe
// file that still contains control flow after migration is an unfinished migration.
//
// Behaviors carried over from the hand-coded builders, each one a walked lesson:
//   • THE ADDRESS GATE is street-or-city, never addressLineOf-non-empty — a subject
//     carrying only `state: "FL"` once built an email whose hero read "FL" over the
//     price (under-contract, 08/06/2026).
//   • A missing photo is a DROPZONE, a missing cell an OPEN SLOT, a missing
//     narrative an instruction (RULE 0.7) — never a zero, never a refusal.
//   • The narrator is the ONLY thing the model writes, it runs only on honest
//     material (lane-2 remarks or our own community layers), and a paragraph that
//     uses a banned phrase is DROPPED to an open slot, never rewritten.
//   • A "listing" CTA with no real link means NO destination — never a homepage
//     (lib/listings/listing-url.ts owns that rule).
import { buildLifecycleEmail } from "@/lib/email/lifecycle-chrome";
import { addressLineOf, listingDescription, specFootnote } from "@/lib/email/listing-flyer";
import { brandWebsiteUrl } from "@/lib/email/inject-photo";
import { listingButtonUrl } from "@/lib/listings/listing-url";
import { renderTemplate, subjectFor } from "./config";
import { resolveCells } from "./cell-catalog";
import { runDerivations, runFinishers } from "./derivations";
import { authorListingNarrative, clearNarrativeSlots, fillNarrative } from "./shared";
import type { CtaDestination, RecipeConfig } from "./config";
import type { RecipeBuildContext } from "./index";
import type { LifecycleChrome } from "@/lib/email/lifecycle-chrome";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** The citation/fallback root — who the data is attributed to, never where a
 *  listing button lands (see resolveCtaUrl). Same constant the hand-coded builders
 *  carried; env would ship "http://localhost:3000" into locally-built docs. */
const SITE = "https://www.swfldatagulf.com";

// The subject ladder lives in config.ts (pure over config + facts picks), so recipe
// compat shims can reach it without importing this builder. Re-exported for callers
// that think of it as the builder's seam.
export { subjectFor } from "./config";

/** Banned phrase → the paragraph is DROPPED, never rewritten. A missing paragraph
 *  is honest; a confident false one is not. */
export function cleanNarrative(raw: string | null, config: RecipeConfig): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const banned = (config.bannedNarrativePhrases ?? []).some((p) => lower.includes(p));
  return banned ? null : raw;
}

/** The ONE button's destination, by declared kind. */
export function resolveCtaUrl(
  dest: CtaDestination,
  currentDoc: EmailDoc,
  facts: ListingFacts | null,
): string | undefined {
  if (dest === "listing") {
    return facts ? (listingButtonUrl(facts) ?? undefined) : undefined;
  }
  return brandWebsiteUrl(currentDoc) ?? SITE;
}

export async function buildFromConfig(
  ctx: RecipeBuildContext,
  config: RecipeConfig,
): Promise<EmailDoc | null> {
  const { facts, currentDoc } = ctx;
  if (!facts) return null;

  // THE ADDRESS GATE — street-or-city, not addressLineOf-non-empty (the "FL" hero).
  // Returning null hands the build to the terminal author, which stamps
  // recipe_key = default-grid — the LOUD failure provenance reads as "go look".
  if (!facts.address?.trim() && !facts.city?.trim()) return null;
  const address = addressLineOf(facts);
  if (!address.trim()) return null;

  const params = config.params ?? {};
  const middle = await runDerivations(config.middle, ctx, params);
  const tail = await runDerivations(config.tail, ctx, params);
  const subjectVars = { ...middle.subjectVars, ...tail.subjectVars };
  const ctaUrl = resolveCtaUrl(config.ctaDestination, currentDoc, facts);

  // THE TEMPLATE VAR PACK. On a suppressed-address recipe the address var is
  // STRUCTURALLY EMPTY — a config template that mistakenly says {address} renders
  // nothing rather than leaking the street. {place} = the city, else the region
  // param — the widest honest scope name (coming-soon's photo alt).
  const city = facts.city?.trim() ?? "";
  const region = String(params.regionLabel ?? "");
  const templateVars: Record<string, string> = {
    address: config.suppressAddress ? "" : address,
    city,
    state: facts.state?.trim() || "FL",
    region,
    place: city || region,
  };

  const heroLabel = config.suppressAddress
    ? config.heroLabel
      ? city
        ? renderTemplate(config.heroLabel.withCity, templateVars)
        : renderTemplate(config.heroLabel.fallback, templateVars)
      : city
    : address;

  const chrome: LifecycleChrome = {
    ribbon: config.ribbon,
    photo: facts.photos[0]
      ? {
          url: facts.photos[0],
          alt: renderTemplate(config.photoAlt, templateVars),
          ...(ctaUrl ? { linkUrl: ctaUrl } : {}),
        }
      : null,
    heroValue: facts.price ?? "",
    heroLabel,
    specs: resolveCells(config.specs, facts),
    specFootnote: specFootnote(facts),
    description: config.includeDescription ? listingDescription(facts.remarks) : undefined,
    narrative: "",
    middle: middle.blocks,
    tail: tail.blocks,
    ctaLabel: config.ctaLabel,
    ...(ctaUrl ? { ctaUrl } : {}),
  };

  let doc: EmailDoc = {
    ...buildLifecycleEmail(currentDoc, chrome),
    subjectVariants: [subjectFor(config, facts, subjectVars)],
  };

  // ── The narrator — the ONLY thing the AI writes ────────────────────────────
  if (config.framing) {
    // The strip list is config data; a fact you hand the writer is a fact it will
    // try to use, so stripping IS the guard (claim-gate architecture).
    const narratorFacts = { ...facts } as Record<string, unknown>;
    for (const k of config.narratorStrips ?? []) narratorFacts[k] = undefined;

    const hasDescription = Boolean(facts.remarks) && config.includeDescription;
    const hasCommunityMaterial = Boolean(
      facts.community || facts.insideTheGate || facts.communityStats || facts.neighborhood,
    );

    const raw =
      hasDescription || hasCommunityMaterial
        ? await authorListingNarrative(narratorFacts as unknown as ListingFacts, {
            descriptionRendered: hasDescription,
            ...(middle.anchors.length + tail.anchors.length > 0
              ? { anchors: [...middle.anchors, ...tail.anchors] }
              : {}),
            framing:
              (hasDescription
                ? config.framing.withDescription
                : config.framing.withoutDescription) + config.framing.common,
          }).catch(() => null)
        : null;

    const clean = cleanNarrative(raw, config);
    // LANDMINE (inherited): fillNarrative SKIPS a text block that already has content;
    // clearNarrativeSlots keeps the slot empty even if a sticky block arrives
    // pre-filled, and neither touches the reserved descriptionSlot.
    if (clean) doc = fillNarrative(clearNarrativeSlots(doc), clean);
  }

  // FINISHERS — the structural narrators and other doc-level passes (coming-soon's
  // de-identified teaser writer). Run LAST so they see the laid-out doc.
  doc = await runFinishers(config.finish ?? [], ctx, doc, params);

  return doc;
}
