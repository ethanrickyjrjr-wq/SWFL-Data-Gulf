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
  "price-reduced": "/new-emails/price-reduced-email.html",
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
        {/* scrolling="no" is load-bearing: with it absent, content taller than the
            iframe grows a vertical scrollbar that steals ~17px of the 600px canvas,
            re-wraps the spec strips (which fit 600 EXACTLY — 6×94, 5×113, 3×189)
            and leaves a white gutter sliver. The thumbnail must be the sent email,
            not a squeezed variant of it (operator, 08/09/2026). */}
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

/** The email canvas is 600px and every spec strip is arithmetic-fitted to EXACTLY
 *  600 (6×94px, 5×113px, 3×189px cells) — so a preview viewport of 576px (the old
 *  `max-w-xl`) or 600-minus-scrollbar re-wraps rows the sent email never wraps:
 *  DOM dropped to its own line, "Single Family / TYPE" orphaned (operator
 *  screenshots, 08/09/2026). This renders the iframe at TRUE 600px with
 *  scrolling="no", measures the document's real height on load (same-origin —
 *  the captures live in /public), and scales the whole thing down only when the
 *  container is narrower than 600. The preview IS the sent email, at every width. */
const EMAIL_W = 600;

function TrueSizeEmail({ src, title }: { src: string; title: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [docH, setDocH] = useState(1600);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setScale(Math.min(1, el.clientWidth / EMAIL_W));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const measure = () => {
    try {
      const doc = iframeRef.current?.contentDocument;
      const h = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight;
      if (h && h > 0) setDocH(h);
    } catch {
      // cross-origin would throw; captures are same-origin, so this is belt-and-suspenders
    }
  };

  return (
    <div ref={wrapRef} className="mx-auto w-full" style={{ maxWidth: EMAIL_W }}>
      <div
        className="mx-auto overflow-hidden rounded-lg border border-white/10 bg-white"
        style={{ height: docH * scale, width: EMAIL_W * scale }}
      >
        {/* pointerEvents "none" is load-bearing: the captures carry real
            target="_blank" links (CTA, hero photo, logo, agent card) all
            pointing at the site homepage, so a live iframe turns any click on
            the enlarged email into "homepage in a new tab" (operator,
            08/10/2026). The preview is a picture of the email — the only
            action here is the Build button in the header bar. */}
        <iframe
          ref={iframeRef}
          src={src}
          title={title}
          scrolling="no"
          onLoad={measure}
          style={{
            width: EMAIL_W,
            height: docH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            border: "none",
            pointerEvents: "none",
          }}
        />
      </div>
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
          <TrueSizeEmail src={src} title={recipe.label} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
