// lib/campaigns.ts
//
// ONE selector for the quick-start campaigns — a thin read over the showcase
// registry, NOT a parallel registry (that would duplicate and drift). A campaign
// IS a `campaign` field on a Showcase (lib/showcase/registry.ts); this module
// filters them for a button row and holds the "coming soon" tiles that have no
// showcase yet (the only campaign data not derivable from SHOWCASES).
import { SHOWCASES, type Showcase, type ShowcaseCampaign } from "@/lib/showcase/registry";
import type { ShowcaseRecipe } from "@/lib/showcase/recipe";

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
