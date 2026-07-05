"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { liveCampaigns, COMING_TILES, type CampaignSurface } from "@/lib/campaigns";
import { recipeDestination, type ShowcaseRecipe } from "@/lib/showcase/recipe";

/**
 * "Start a campaign" row — one-click quick-start buttons for the live campaigns
 * on a surface, plus greyed "coming" chips. Rides existing seams; NO new send
 * plumbing. Three deliberately-separate click behaviors (a `target` switch would
 * misroute the social one — it is not a recipe hand-off):
 *
 *   - email campaign, `onUseRecipe` given (already inside the lab) → seed the
 *     Build box in place via the host's handleUseRecipe.
 *   - email campaign, no handler (the hub) → navigate with recipeDestination.
 *   - social campaign, already in a project (scope exists) → deep-link its
 *     social cockpit with ?campaign= so it auto-generates the launch week.
 *   - social campaign, on the hub (no project yet) → collect the listing area
 *     FIRST (a launch week about "your listing" needs a real scope; an empty
 *     project would otherwise generate a region-wide week about an arbitrary
 *     home), create a listing project anchored to it, then deep-link.
 */
export function CampaignQuickStart({
  surface,
  projectId,
  onUseRecipe,
  variant = "panel",
}: {
  surface: CampaignSurface;
  projectId?: string;
  /** Present only when a Build box is on screen (the email lab) — seeds it in
   *  place instead of navigating. */
  onUseRecipe?: (recipe: ShowcaseRecipe) => void;
  /** "panel" (default) = the AI-aside section chrome (border-b + padding, used in
   *  the email lab and social cockpit); "bare" = no chrome, for the hub grid. */
  variant?: "panel" | "bare";
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // The hub social button expands an address form before creating the project.
  const [formKey, setFormKey] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const campaigns = liveCampaigns(surface);
  if (campaigns.length === 0 && COMING_TILES.length === 0) return null;

  function onSocialClick(campaignKey: string) {
    // Already scoped to a project → deep-link its social cockpit directly.
    if (projectId) {
      router.push(`/project/${projectId}/social?campaign=${campaignKey}`);
      return;
    }
    // Hub → open the listing-area form (created + generated on submit).
    setFormKey((k) => (k === campaignKey ? null : campaignKey));
  }

  async function createSocialProject(campaignKey: string) {
    setBusyKey(campaignKey);
    try {
      const subject = address.trim();
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: subject || "New listing",
          kind: "listing",
          ...(subject ? { subject_address: subject } : {}),
        }),
      });
      if (res.ok) {
        const { id } = (await res.json()) as { id?: string };
        if (id) router.push(`/project/${id}/social?campaign=${campaignKey}`);
      }
    } finally {
      setBusyKey(null);
    }
  }

  function startEmail(seedRecipe: ShowcaseRecipe | undefined) {
    if (!seedRecipe) return;
    if (onUseRecipe) onUseRecipe(seedRecipe);
    else router.push(recipeDestination(seedRecipe, { projectId }));
  }

  return (
    <section className={variant === "panel" ? "border-b border-white/8 px-4 pb-4 pt-4" : "mb-6"}>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-gulf-teal">
        Start a campaign
      </p>
      <div className="flex flex-col gap-2">
        {campaigns.map(({ showcase, campaign }) => {
          const isSocial = campaign.surface === "social";
          const busy = busyKey === campaign.key;
          const formOpen = isSocial && !projectId && formKey === campaign.key;
          return (
            <div key={campaign.key}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  isSocial ? onSocialClick(campaign.key) : startEmail(campaign.seedRecipe)
                }
                className="group w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:border-white/25 hover:bg-white/[0.06] disabled:opacity-50"
                style={{ borderLeft: `3px solid ${showcase.accent}` }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white/90">{campaign.label}</span>
                  <span
                    className="shrink-0 text-xs font-semibold opacity-70 transition-opacity group-hover:opacity-100"
                    style={{ color: showcase.accent }}
                  >
                    {busy ? "Starting…" : formOpen ? "Cancel" : "Start →"}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-white/45">
                  {campaign.blurb}
                </span>
              </button>
              {formOpen && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!busy) void createSocialProject(campaign.key);
                  }}
                  className="mt-1.5 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Listing address, city, or ZIP"
                    aria-label="Listing address, city, or ZIP"
                    autoFocus
                    className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/85 placeholder:text-white/35 focus:border-gulf-teal focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={busy}
                    className="shrink-0 rounded-lg bg-gulf-teal px-3 py-2 text-xs font-semibold text-[#04121b] transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {busy ? "Creating…" : "Create"}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      {COMING_TILES.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {COMING_TILES.map((t) => (
            <span
              key={t.label}
              title={`${t.blurb} (coming soon)`}
              className="cursor-default rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] text-white/30"
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
