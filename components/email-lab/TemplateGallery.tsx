"use client";
// components/email-lab/TemplateGallery.tsx — Lane E first-run empty state.
//
// Full-pane pick-a-template gallery shown by ProjectEmailLabClient when the
// Email tool opens with no doc and no built deliverable. Cards are the SAME
// committed filled-preview captures /showcase browses (SEED_PREVIEWS manifest,
// job-grouped) — a new-project user sees what each template BECOMES, then
// picking commits the honest slot-rule skeleton via onPick → seed.build().
// Drift is guarded mechanically: seed-previews.test.ts fails when a template
// edit ships without a re-capture. Pure UI state — nothing is persisted; once
// a deliverable exists the client never shows this again.
import type { ReactNode } from "react";
import { SEED_DOCS, type SeedDoc } from "@/lib/email/doc/default-docs";
import { SEED_PREVIEW_GROUPS, seedPreviewsFor } from "@/lib/email/doc/seed-previews";

function SeedCard({
  seed,
  image,
  onPick,
}: {
  seed: SeedDoc;
  image: string;
  onPick: (seed: SeedDoc) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(seed)}
      className="group w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] text-left transition-all hover:border-gulf-teal/60 hover:bg-gulf-teal/[0.06] focus:outline-none focus:ring-2 focus:ring-gulf-teal/40"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- committed static capture, top crop */}
      <img src={image} alt="" className="h-52 w-full object-cover object-top" loading="lazy" />
      <div className="border-t border-white/10 px-3 py-2.5">
        <p className="text-sm font-medium leading-tight text-white/85 group-hover:text-white">
          {seed.name}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-white/40">{seed.description}</p>
      </div>
    </button>
  );
}

export function TemplateGallery({
  onPick,
  onStartBlank,
  heroSlot,
}: {
  onPick: (seed: SeedDoc) => void;
  onStartBlank: () => void;
  /** Rendered between the page header and the template groups — the Listing Campaign hero
   *  (spec 2026-07-15-gallery-listing-hero-design.md) uses this; the gallery itself stays
   *  decoupled from listing specifics. */
  heroSlot?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Pick a starting point</h1>
          <p className="mt-1 text-sm text-white/50">
            Shown filled with live Southwest Florida data — you start from the clean layout and the
            AI fills it with your area&rsquo;s real figures.
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

      {SEED_PREVIEW_GROUPS.map((g) => {
        const previews = seedPreviewsFor(g.key);
        if (previews.length === 0) return null;
        return (
          <section key={g.key} className="mt-10 first-of-type:mt-6">
            <h2 className="text-sm font-semibold text-white/85">
              {g.title}
              <span className="ml-2 text-xs font-normal text-white/40">
                {previews.length} {previews.length === 1 ? "layout" : "layouts"}
              </span>
            </h2>
            <p className="mt-0.5 text-xs text-white/40">{g.pitch}</p>
            <div className="mt-3 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {previews.map((p) => {
                const seed = SEED_DOCS.find((s) => s.id === p.id);
                if (!seed) return null;
                return <SeedCard key={p.id} seed={seed} image={p.image} onPick={onPick} />;
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
