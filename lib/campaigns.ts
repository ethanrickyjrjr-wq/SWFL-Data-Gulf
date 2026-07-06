// lib/campaigns.ts
//
// ONE selector for the quick-start campaigns — a thin read over the showcase
// registry, NOT a parallel registry (that would duplicate and drift). A campaign
// IS a `campaign` field on a Showcase (lib/showcase/registry.ts); this module
// filters them for a button row and holds the "coming soon" tiles that have no
// showcase yet (the only campaign data not derivable from SHOWCASES).
import { SHOWCASES, type Showcase, type ShowcaseCampaign } from "@/lib/showcase/registry";
import { findPlaceholder, type ShowcaseRecipe } from "@/lib/showcase/recipe";

export type CampaignSurface = "email" | "social" | "all";

/** A live campaign resolved to its backing showcase — what the button renders. */
export interface CampaignEntry {
  showcase: Showcase;
  campaign: ShowcaseCampaign;
}

/**
 * Live campaigns for one quick-start row. `surface` filters on the CAMPAIGN's
 * own surface (which button row), NOT `Showcase.surfaces` — market-pulse and
 * launch-blitz are both email+social showcases but each is exactly one button.
 * "all" (the Projects hub) returns every live campaign in registry order.
 */
export function liveCampaigns(surface: CampaignSurface): CampaignEntry[] {
  return SHOWCASES.flatMap((s) =>
    s.campaign?.status === "live" && (surface === "all" || s.campaign.surface === surface)
      ? [{ showcase: s, campaign: s.campaign }]
      : [],
  );
}

/** The follow-up step for a Build-box seed that came from a campaign button —
 *  matched by the seed PROMPT (stable: seed prompts live only in the registry,
 *  and the lab captures the match at seed time, before the user edits the
 *  [[blank]]). Null for organic prompts and campaigns without a second step. */
export function campaignFollowUpForPrompt(
  prompt: string,
): { key: string; label: string; recipe: ShowcaseRecipe } | null {
  for (const { campaign } of liveCampaigns("email")) {
    if (campaign.seedRecipe?.prompt === prompt && campaign.followUp) {
      return { key: campaign.key, ...campaign.followUp };
    }
  }
  return null;
}

/** Campaign provenance for a Build-box seed — matches ANY live email campaign's
 *  seed OR follow-up recipe prompt (both live only in the registry), so BOTH
 *  campaign artifacts (announcement + weekly) save with the same
 *  `deliverables.campaign_key`. Null for organic prompts. Blast sends turn this
 *  into the `campaign` Resend tag (operator-ratified full thread, 07/05/2026). */
export function campaignKeyForPrompt(prompt: string): string | null {
  for (const { campaign } of liveCampaigns("email")) {
    if (campaign.seedRecipe?.prompt === prompt) return campaign.key;
    if (campaign.followUp?.recipe.prompt === prompt) return campaign.key;
  }
  return null;
}

/** The four homepage hero chips (spec 2026-07-05-agent-first-homepage-design).
 *  Still a thin read over SHOWCASES — a showcase carries at most ONE `campaign`,
 *  so Just Sold / Coming to Market surface their listing-to-close SLIDE recipes
 *  (looked up by slide title; campaigns.test.ts pins existence). */
export type HeroCampaignKey = "new-listing" | "just-sold" | "coming-to-market" | "market-update";

export interface HeroCampaignEntry {
  key: HeroCampaignKey;
  label: string;
  /** Which placeholder the hero bar shows: a listing address or an area. */
  input: "address" | "area";
  recipe: ShowcaseRecipe;
}

function showcaseSeed(showcaseId: string): ShowcaseRecipe {
  const recipe = SHOWCASES.find((s) => s.id === showcaseId)?.campaign?.seedRecipe;
  if (!recipe) throw new Error(`hero campaign: no seedRecipe on showcase "${showcaseId}"`);
  return recipe;
}

function slideRecipe(showcaseId: string, slideTitle: string): ShowcaseRecipe {
  const recipe = SHOWCASES.find((s) => s.id === showcaseId)?.slides.find(
    (sl) => sl.title === slideTitle,
  )?.recipe;
  if (!recipe)
    throw new Error(`hero campaign: no recipe on slide "${slideTitle}" of "${showcaseId}"`);
  return recipe;
}

export const HERO_CAMPAIGNS: HeroCampaignEntry[] = [
  {
    key: "new-listing",
    label: "New Listing",
    input: "address",
    recipe: showcaseSeed("listing-to-close"),
  },
  {
    key: "just-sold",
    label: "Just Sold",
    input: "address",
    recipe: slideRecipe("listing-to-close", "Sold"),
  },
  {
    key: "coming-to-market",
    label: "Coming to Market",
    input: "address",
    recipe: slideRecipe("listing-to-close", "Coming Soon"),
  },
  {
    key: "market-update",
    label: "Market Update",
    input: "area",
    recipe: showcaseSeed("market-pulse"),
  },
];

/** Hero → grid-lab URL: fill the recipe's [[blank]] with the picked text and
 *  carry zip (when known) + recipeNeeds — the same params the lab already reads
 *  (lib/project/lab-redirect.ts threads them through the signed-in redirect). */
export function heroDestination(
  entry: HeroCampaignEntry,
  opts: { filled: string; zip?: string | null },
): string {
  const filled = opts.filled.trim();
  const ph = findPlaceholder(entry.recipe.prompt);
  // An EMPTY fill must NOT collapse the [[blank]] to nothing: a placeless prompt
  // ("...for my farm area  —") slips past the arrival's recipeHasBlank guard and
  // auto-builds an unscoped, generic email — the exact "nothing about the place I
  // asked for" bug (07/06/2026). Keep the placeholder when there's nothing to
  // fill it with, so the lab's address popup asks for the area instead.
  const prompt =
    ph && filled
      ? entry.recipe.prompt.slice(0, ph.start) + filled + entry.recipe.prompt.slice(ph.end)
      : entry.recipe.prompt;
  const params = new URLSearchParams({ recipe: prompt });
  if (entry.recipe.needs.length > 0) params.set("recipeNeeds", entry.recipe.needs.join(","));
  if (opts.zip) params.set("zip", opts.zip);
  // Address spine (build 2): listing chips carry the subject address so the lab
  // scope can pull the listing's own nearby sold comps into the figure feed. Only
  // when there's a real address — an empty addr param answers no popup.
  if (entry.input === "address" && filled) params.set("addr", filled);
  return `/email-lab/grid?${params.toString()}`;
}

/** A not-yet-built campaign — greyed chip, no wiring. Promote by adding a
 *  Showcase with `campaign.status:"live"` + `seedRecipe` and capturing its
 *  slide assets (scripts/capture-showcase.mjs). */
export interface ComingTile {
  label: string;
  blurb: string;
}

export const COMING_TILES: ComingTile[] = [
  { label: "Open House", blurb: "Before / day-of / after touches across email, social, and text." },
  { label: "Buyer Nurture", blurb: "An eight-touch drip from first hello to pre-approval." },
  { label: "Seller / Home Value", blurb: "A home-value drip that earns the listing appointment." },
  {
    label: "Past-Client Seasonal",
    blurb: "House-iversary and seasonal check-ins that keep the sphere warm.",
  },
  { label: "Re-engagement", blurb: "Win back cold leads with a fresh-data reason to reply." },
];
