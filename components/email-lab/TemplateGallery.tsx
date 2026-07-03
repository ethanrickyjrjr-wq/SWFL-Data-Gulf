"use client";
// components/email-lab/TemplateGallery.tsx — Lane E first-run empty state.
//
// Full-pane pick-a-template gallery shown by ProjectEmailLabClient when the
// Email tool opens with no doc and no built deliverable. Cards are LIVE
// scaled-down renders of SEED_DOCS via the pure BlockRenderer (never static
// screenshots — they can't drift from the seeds), lazy-mounted through an
// IntersectionObserver so 26 full email docs never render at once.
// Pure UI state — nothing is persisted; once a deliverable exists the client
// never shows this again.
import { useEffect, useRef, useState } from "react";
import { SEED_DOCS, type SeedDoc } from "@/lib/email/doc/default-docs";
import { BlockRenderer } from "@/lib/email/blocks/BlockRenderer";
import type { EmailDoc } from "@/lib/email/doc/types";

/** Operator-curated first shelf; the rest render under "All templates". */
const FEATURED_IDS = [
  "market-spotlight",
  "new-listing",
  "just-sold",
  "open-house",
  "welcome",
  "neighborhood-report",
  "monthly-digest",
  "minimal",
];

function SeedPreview({ seed }: { seed: SeedDoc }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<EmailDoc | null>(null);

  // Build + render the doc only once the card scrolls near the viewport.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDoc(seed.build());
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seed]);

  return (
    <div
      ref={frameRef}
      className="pointer-events-none h-52 overflow-hidden rounded-t-xl bg-white/[0.04]"
      style={doc ? { backgroundColor: doc.globalStyle.backdropColor } : undefined}
      aria-hidden="true"
    >
      {doc && (
        <div className="origin-top-left" style={{ width: 600, transform: "scale(0.35)" }}>
          {doc.blocks.map((b) => (
            <BlockRenderer key={b.id} block={b} globalStyle={doc.globalStyle} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeedCard({ seed, onPick }: { seed: SeedDoc; onPick: (seed: SeedDoc) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(seed)}
      className="group w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.02] text-left transition-all hover:border-gulf-teal/60 hover:bg-gulf-teal/[0.06] focus:outline-none focus:ring-2 focus:ring-gulf-teal/40"
    >
      <SeedPreview seed={seed} />
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
}: {
  onPick: (seed: SeedDoc) => void;
  onStartBlank: () => void;
}) {
  const featured = FEATURED_IDS.map((id) => SEED_DOCS.find((s) => s.id === id)).filter(
    (s): s is SeedDoc => Boolean(s),
  );
  const rest = SEED_DOCS.filter((s) => !FEATURED_IDS.includes(s.id));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Pick a starting point</h1>
          <p className="mt-1 text-sm text-white/50">
            Every template fills with real Southwest Florida data once it&rsquo;s on the canvas.
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

      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {featured.map((s) => (
          <SeedCard key={s.id} seed={s} onPick={onPick} />
        ))}
      </div>

      {rest.length > 0 && (
        <>
          <p className="mb-3 mt-10 text-[10px] uppercase tracking-widest text-white/30">
            All templates
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {rest.map((s) => (
              <SeedCard key={s.id} seed={s} onPick={onPick} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
