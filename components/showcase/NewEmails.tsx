"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { RECIPES, type RecipeKey } from "@/lib/deliverable/recipes";
import { recipeDestination } from "@/lib/lab-entry/destination";

/** A real rendered HTML file, or null when this recipe has no capture yet
 *  (the recipe still builds — see the placeholder card below). */
const FILE_FOR_KEY: Partial<Record<RecipeKey, string>> = {
  "coming-soon": "/new-emails/coming-soon-email.html",
  "new-listing": "/new-emails/new-listing-email.html",
  "open-house": "/new-emails/open-house-email.html",
  "market-comps": "/new-emails/market-comps-email.html",
  "under-contract": "/new-emails/under-contract-email.html",
  "just-sold": "/new-emails/just-sold-email.html",
  "back-on-market": "/new-emails/back-on-market-email.html",
  "agent-brand-intro": "/new-emails/agent-brand-intro-email.html",
  "market-pulse": "/new-emails/market-pulse-email.html",
};

/** Same three groups, same order, as the lifecycle CampaignRows already uses
 *  (`lib/showcase/campaign-order.ts`) — lifecycle first, every key a real
 *  `RECIPES` entry. Keys with no file yet render as a labelled blank holder. */
const NEW_EMAIL_CATEGORIES: { id: string; title: string; keys: RecipeKey[] }[] = [
  {
    id: "listing-lifecycle",
    title: "Listing Lifecycle",
    keys: [
      "coming-soon",
      "new-listing",
      "open-house",
      "market-comps",
      "price-reduced",
      "under-contract",
      "just-sold",
      "back-on-market",
    ],
  },
  {
    id: "agent-community",
    title: "Agent & Community",
    keys: [
      "agent-brand-intro",
      "agent-launch",
      "sphere-weekly",
      "review-reply",
      "community-info",
      "listings-showcase",
      "listings-digest",
    ],
  },
  {
    id: "recurring",
    title: "Recurring",
    keys: ["market-pulse"],
  },
];

/** Real rendered emails, in send-order rows, left-to-right scroll per category
 *  (lifecycle first). Click a card → full preview + a Build button. A key with
 *  no rendered file yet is a labelled blank holder, not skipped. */
export function NewEmails() {
  const [open, setOpen] = useState<RecipeKey | null>(null);

  return (
    <section className="mb-14">
      <span className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-gulf-teal">
        New
      </span>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
        Newest emails
      </h2>
      <p className="mt-3 max-w-2xl text-text-secondary">
        Every email built this week, real data, in send order.
      </p>

      <div className="mt-6 flex flex-col gap-10">
        {NEW_EMAIL_CATEGORIES.map((cat) => (
          <div key={cat.id}>
            <h3 className="text-lg font-semibold tracking-tight text-text-primary">{cat.title}</h3>
            <div className="mt-3 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3">
              {cat.keys.map((key) =>
                FILE_FOR_KEY[key] ? (
                  <EmailCard
                    key={key}
                    recipeKey={key}
                    src={FILE_FOR_KEY[key]!}
                    onOpen={() => setOpen(key)}
                  />
                ) : (
                  <EmptyCard key={key} recipeKey={key} />
                ),
              )}
            </div>
          </div>
        ))}
      </div>

      {open && FILE_FOR_KEY[open] && (
        <EmailOverlay recipeKey={open} src={FILE_FOR_KEY[open]!} onClose={() => setOpen(null)} />
      )}
    </section>
  );
}

function EmailCard({
  recipeKey,
  src,
  onOpen,
}: {
  recipeKey: RecipeKey;
  src: string;
  onOpen: () => void;
}) {
  const label = RECIPES[recipeKey].label;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative block w-64 shrink-0 snap-start overflow-hidden rounded-lg border border-white/10 bg-[#0f1d24] text-left transition-colors hover:border-white/30"
    >
      <div className="relative h-48 w-full overflow-hidden bg-white">
        <iframe
          src={src}
          title={label}
          tabIndex={-1}
          style={{
            width: "600px",
            height: "1600px",
            transform: "scale(0.4267)",
            transformOrigin: "top left",
            pointerEvents: "none",
            border: "none",
          }}
        />
      </div>
      <span className="block px-3 py-2.5">
        <span className="block text-xs font-semibold text-[#f0ede6]">{label}</span>
      </span>
      <span className="block px-3 pb-2.5 text-[10px] font-bold text-gulf-teal opacity-0 transition-opacity group-hover:opacity-100">
        Preview →
      </span>
    </button>
  );
}

/** No rendered capture yet — the recipe is real and builds (RECIPE_BUILDERS
 *  has it); this is a labelled blank holder, never a fabricated preview. */
function EmptyCard({ recipeKey }: { recipeKey: RecipeKey }) {
  const label = RECIPES[recipeKey].label;
  return (
    <div className="flex h-[248px] w-64 shrink-0 snap-start flex-col items-center justify-center rounded-lg border border-dashed border-white/15 bg-[#0f1d24]/40 px-3 text-center">
      <span className="text-[10px] uppercase tracking-[0.15em] text-white/30">
        Not rendered yet
      </span>
      <span className="mt-2 text-xs font-semibold text-[#f0ede6]/70">{label}</span>
    </div>
  );
}

function EmailOverlay({
  recipeKey,
  src,
  onClose,
}: {
  recipeKey: RecipeKey;
  src: string;
  onClose: () => void;
}) {
  const scrimRef = useRef<HTMLDivElement>(null);
  const recipe = RECIPES[recipeKey];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={scrimRef}
      className="fixed inset-0 z-[90] flex h-dvh flex-col bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === scrimRef.current) onClose();
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 py-3 sm:px-6 sm:py-5">
        <div className="flex items-center gap-3 rounded-t-xl bg-[#0b161c] px-4 py-3">
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#f0ede6]">
            {recipe.label}
          </p>
          <Link
            href={recipeDestination(recipe)}
            className="shrink-0 rounded-lg bg-gulf-teal px-4 py-2 text-xs font-bold text-navy-dark transition-opacity hover:opacity-90"
          >
            Build this →
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="shrink-0 text-gray-400 transition-colors hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#101f27] p-4 sm:p-6">
          <iframe
            src={src}
            title={recipe.label}
            className="mx-auto h-[2200px] w-full max-w-xl rounded-lg border border-white/10 bg-white"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
