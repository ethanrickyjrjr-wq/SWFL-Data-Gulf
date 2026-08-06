"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CAMPAIGN_CATEGORIES, type CampaignRowEmail } from "@/lib/showcase/campaign-order";
import { RECIPES } from "@/lib/deliverable/recipes";
import { SHOWCASES } from "@/lib/showcase/registry";
import {
  recipeDestination,
  signedInLabArrival,
  type ShowcaseRecipe,
} from "@/lib/lab-entry/destination";
import { ShowcaseCard } from "@/components/showcase/ShowcaseCard";
import { ShowcaseOverlay } from "@/components/showcase/ShowcaseOverlay";

/**
 * The /showcase page's lead section, REBUILT 08/06/2026 — operator ruling,
 * verbatim: *"Campaigns-flat-at top with new emails-full pop up explainer last
 * card-left to right scroll like Netflix each section (listing lifecycle on
 * top)."* Replaces `CampaignExamples.tsx` (retired), which nested every new
 * recipe-built email three-deep inside a multi-step story overlay — a visitor
 * never saw "Coming Soon," "New Listing," "Open House"... as individual cards
 * without opening "Listing → Close" and clicking through all seven steps.
 *
 * One horizontal-scroll row per category (`lib/showcase/campaign-order.ts`,
 * Listing Lifecycle first), each in real send order starting with Coming Soon.
 * The LAST card in every row is the SAME multi-step walkthrough this page has
 * always used — `ShowcaseCard` + `ShowcaseOverlay`, UNCHANGED — so "see the
 * whole campaign" is one click away without duplicating that interaction.
 *
 * Every card's "Make this →" resolves through `recipeDestination`, THE ONE
 * root for this handoff — never a second, hand-rolled URL.
 */
export function CampaignRows() {
  const router = useRouter();
  const [openShowcase, setOpenShowcase] = useState<string | null>(null);

  function handleUseRecipe(recipe: ShowcaseRecipe) {
    router.push(recipeDestination(recipe));
  }

  return (
    <div className="flex flex-col gap-12">
      {CAMPAIGN_CATEGORIES.map((cat) => {
        const story = SHOWCASES.find((s) => s.id === cat.story);
        return (
          <section key={cat.id}>
            <h2 className="text-xl font-semibold tracking-tight text-text-primary">{cat.title}</h2>
            <p className="mt-1.5 max-w-2xl text-sm text-text-secondary">{cat.pitch}</p>
            <div className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
              {cat.emails.map((email) => (
                <CampaignEmailCard key={email.key} email={email} />
              ))}
              {story && (
                <div className="w-64 shrink-0 snap-start">
                  <ShowcaseCard showcase={story} onOpen={setOpenShowcase} />
                  <p className="mt-1.5 px-0.5 text-[10px] leading-snug text-text-secondary">
                    See the whole campaign, step by step →
                  </p>
                </div>
              )}
            </div>
          </section>
        );
      })}

      {openShowcase && (
        <ShowcaseOverlay
          showcase={SHOWCASES.find((s) => s.id === openShowcase)!}
          onClose={() => setOpenShowcase(null)}
          onUseRecipe={handleUseRecipe}
          onAuthedCta={() => router.push(signedInLabArrival())}
        />
      )}
    </div>
  );
}

/** One flat, buildable email — the direct "Make this →" click, no overlay
 *  detour (the overlay is reserved for the row's last, multi-step card). Every
 *  key resolves through `RECIPES` (never a stale/old builder), per the
 *  operator's "make sure all buttons build the new emails, not the old ones." */
function CampaignEmailCard({ email }: { email: CampaignRowEmail }) {
  const recipe = RECIPES[email.key];
  const href = recipeDestination(recipe);
  return (
    <Link
      href={href}
      className="group block w-64 shrink-0 snap-start overflow-hidden rounded-lg border border-white/10 bg-[#0f1d24] text-left transition-colors hover:border-white/30"
    >
      {email.image ? (
        // eslint-disable-next-line @next/next/no-img-element -- committed static capture, top crop
        <img
          src={email.image}
          alt=""
          className="h-36 w-full object-cover object-top"
          loading="lazy"
        />
      ) : (
        // No capture yet (lib/showcase/campaign-order.ts header) — the recipe is
        // real and builds; this is NOT the "not made yet" placeholder.
        <div className="flex h-36 w-full items-center justify-center bg-gradient-to-br from-[#132832] to-[#0b161c]">
          <span className="text-[10px] uppercase tracking-[0.15em] text-white/30">
            Preview soon
          </span>
        </div>
      )}
      <span className="block px-3 py-2.5">
        <span className="block text-xs font-semibold text-[#f0ede6]">{email.title}</span>
        <span className="mt-0.5 block text-[10px] leading-snug text-gray-400">{email.blurb}</span>
      </span>
      <span className="block px-3 pb-2.5 text-[10px] font-bold text-gulf-teal opacity-0 transition-opacity group-hover:opacity-100">
        Make this →
      </span>
    </Link>
  );
}
