"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SHOWCASES } from "@/lib/showcase/registry";
import { recipeDestination, type ShowcaseRecipe } from "@/lib/showcase/recipe";
import { ShowcaseCard } from "@/components/showcase/ShowcaseCard";
import { ShowcaseOverlay } from "@/components/showcase/ShowcaseOverlay";

/** One-line explainer per campaign, shown above its card on the /showcase page. */
const SECTION_INTRO: Record<string, string> = {
  "listing-to-close":
    "Every stage a listing goes through, end to end — five emails, one property, real data at every step.",
  "launch-blitz":
    "One listing launch, cut for email and every social format at once — same real numbers everywhere.",
  "market-pulse":
    "Set it up once — the monthly brief and its socials rebuild themselves from fresh data every month.",
};

/**
 * The /showcase page's lead section — every campaign we can build, grouped by
 * what it demonstrates (operator directive 07/03/2026: "put all the examples
 * in showcase, one click to email lab ready to build"). Reuses ShowcaseCard +
 * ShowcaseOverlay UNCHANGED — same click-to-expand thumbnail the AI chat pill
 * already uses (components/briefcase/BriefcasePanel.tsx), so a visitor who's
 * seen it there sees the identical interaction here.
 *
 * "Make this →" (inside the overlay) has no Build box on this page to inject
 * into, so it carries the recipe to one via `recipeDestination` — THE root
 * for this handoff (lib/showcase/recipe.ts) — which picks the email lab or
 * the social composer by the recipe's own `target`, anonymous-usable path
 * since this page has no project context. Any other host (the AI-chat pill,
 * a future example surface) should call the same function rather than
 * re-deriving the `/email-lab/grid` vs `/social-lab` routing itself.
 */
export function CampaignExamples() {
  const router = useRouter();
  const [openShowcase, setOpenShowcase] = useState<string | null>(null);

  function handleUseRecipe(recipe: ShowcaseRecipe) {
    router.push(recipeDestination(recipe));
  }

  return (
    <div className="flex flex-col gap-10">
      {SHOWCASES.map((s) => (
        <section key={s.id}>
          <h2 className="text-xl font-semibold tracking-tight text-text-primary">{s.title}</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-text-secondary">{SECTION_INTRO[s.id]}</p>
          <div className="mt-4 max-w-sm">
            <ShowcaseCard showcase={s} onOpen={setOpenShowcase} />
          </div>
        </section>
      ))}

      {openShowcase && (
        <ShowcaseOverlay
          showcase={SHOWCASES.find((s) => s.id === openShowcase)!}
          onClose={() => setOpenShowcase(null)}
          onUseRecipe={handleUseRecipe}
          onAuthedCta={() => router.push("/email-lab/grid")}
        />
      )}
    </div>
  );
}
