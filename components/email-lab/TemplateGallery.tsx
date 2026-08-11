"use client";
// components/email-lab/TemplateGallery.tsx — Lane E first-run picker.
//
// THE OLD SEED GALLERY IS GONE — operator decree 08/10/2026: "we need the old
// emails out — everything is only the new emails." This picker surfaces the
// SAME registry emails /showcase shows (lib/email/new-email-captures.ts, the
// re-baked public/new-emails/*.html captures) — one registry, one look. Never
// re-add SEED_DOCS / seed-previews cards here; that gallery was the last
// user-visible surface of the purged-era email designs.
//
// Picking hands the RECIPE KEY to the host, which navigates through
// recipeDestination (the ONE nav root) into the recipe build lane. Nothing
// here seeds a doc or builds — pure UI.
import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import { RECIPES, type RecipeKey } from "@/lib/deliverable/recipes";
import type { SeedDoc } from "@/lib/email/doc/default-docs";
import { recipeDestination } from "@/lib/showcase/recipe";
import { NEW_EMAIL_CATEGORIES, NEW_EMAIL_FILE_FOR_KEY } from "@/lib/email/new-email-captures";

function RecipeCard({
  recipeKey,
  onPick,
}: {
  recipeKey: RecipeKey;
  onPick: (k: RecipeKey) => void;
}) {
  const label = RECIPES[recipeKey].label;
  const src = NEW_EMAIL_FILE_FOR_KEY[recipeKey];
  return (
    <button
      type="button"
      onClick={() => onPick(recipeKey)}
      className="group w-64 shrink-0 snap-start overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] text-left transition-all hover:border-gulf-teal/60 hover:bg-gulf-teal/[0.06] focus:outline-none focus:ring-2 focus:ring-gulf-teal/40"
    >
      {src ? (
        <div className="relative h-48 w-full overflow-hidden bg-white">
          {/* scrolling="no" is load-bearing: without it, content taller than the
              iframe grows a scrollbar that steals ~17px of the 600px canvas and
              re-wraps the spec strips (which fit 600 EXACTLY). The thumbnail
              must be the sent email, not a squeezed variant (operator, 08/09/2026). */}
          <iframe
            src={src}
            title={label}
            tabIndex={-1}
            scrolling="no"
            style={{
              width: "600px",
              height: "1600px",
              transform: "scale(0.4267)",
              transformOrigin: "top left",
              pointerEvents: "none",
              border: "none",
              overflow: "hidden",
            }}
          />
        </div>
      ) : (
        // No rendered capture yet — the recipe is real and builds (RECIPE_BUILDERS
        // has all 17); a labelled holder, never a fabricated preview.
        <div className="flex h-48 w-full flex-col items-center justify-center bg-white/[0.03] px-3 text-center">
          <span className="text-[10px] uppercase tracking-[0.15em] text-white/30">
            Preview coming
          </span>
        </div>
      )}
      <div className="border-t border-white/10 px-3 py-2.5">
        <p className="text-sm font-medium leading-tight text-white/85 group-hover:text-white">
          {label}
        </p>
      </div>
    </button>
  );
}

export function TemplateGallery({
  onPickRecipe,
  onStartBlank,
  heroSlot,
}: {
  /** The host navigates via recipeDestination(RECIPES[key], …) — full page
   *  load, so the arrival plan re-runs with the recipe (same reason the
   *  standalone lab uses window.location.assign). When omitted, the gallery
   *  self-navigates using the /project/[id] route param (interim: both hosts
   *  were claimed by live parallel sessions at rewrite time, 08/10/2026). */
  onPickRecipe?: (key: RecipeKey) => void;
  onStartBlank: () => void;
  /** DEPRECATED, ignored — the old seed-gallery pick. Accepted only so the
   *  claimed hosts keep compiling until their invocations are updated. */
  onPick?: (seed: SeedDoc) => void;
  /** Rendered between the page header and the email rows — the Listing Campaign
   *  hero (spec 2026-07-15-gallery-listing-hero-design.md) uses this; the
   *  gallery itself stays decoupled from listing specifics. */
  heroSlot?: ReactNode;
}) {
  // Fallback pick lane while hosts still pass the deprecated onPick: navigate
  // through the ONE nav root, scoped to the project when the route carries one.
  const params = useParams<{ id?: string }>();
  const pick =
    onPickRecipe ??
    ((key: RecipeKey) => {
      window.location.assign(recipeDestination(RECIPES[key], { projectId: params?.id ?? null }));
    });
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Pick a starting point</h1>
          <p className="mt-1 text-sm text-white/50">
            Every email we build, shown as it actually sends — pick one and the AI builds it with
            your listing&rsquo;s real figures.
          </p>
        </div>
        <button
          type="button"
          onClick={onStartBlank}
          className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/70 transition-colors hover:border-gulf-teal/50 hover:text-gulf-teal"
        >
          Start blank
        </button>
      </div>

      {heroSlot}

      {NEW_EMAIL_CATEGORIES.map((cat) => (
        <section key={cat.id} className="mt-10 first-of-type:mt-6">
          <h2 className="text-sm font-semibold text-white/85">
            {cat.title}
            <span className="ml-2 text-xs font-normal text-white/40">
              {cat.keys.length} {cat.keys.length === 1 ? "email" : "emails"}
            </span>
          </h2>
          <div className="mt-3 flex flex-wrap gap-4">
            {cat.keys.map((key) => (
              <RecipeCard key={key} recipeKey={key} onPick={pick} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
