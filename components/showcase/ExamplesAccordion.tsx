"use client";

import { useState } from "react";
import { showcasesFor, SHOWCASES } from "@/lib/showcase/registry";
import type { ShowcaseRecipe } from "@/lib/showcase/recipe";
import { ShowcaseCard } from "@/components/showcase/ShowcaseCard";
import { ShowcaseOverlay } from "@/components/showcase/ShowcaseOverlay";

/**
 * "Examples" section for the lab rails: examples live IN the lab they
 * demonstrate — email examples in the Email lab, social examples in the Social
 * tool — never auto-injected into the AI panel (that read as the AI pitching
 * demo fixtures as your data).
 *
 * Operator ruling 07/03/2026 (PM): examples LEAD — the email lab passes
 * `defaultOpen` and mounts this directly under the Build box, and every
 * buildable step carries a "Make this →" recipe (`onUseRecipe` drops the
 * prompt into the host's builder). Supersedes the same-day closed-by-default
 * ruling, which was made when examples were passive show-and-tell.
 */
export function ExamplesAccordion({
  surface,
  defaultOpen = false,
  onUseRecipe,
}: {
  surface: "email" | "social";
  /** Initial-mount only — the accordion owns its open state after that. */
  defaultOpen?: boolean;
  /** Host builder's prompt-injection hook; absent → story-only overlay. */
  onUseRecipe?: (recipe: ShowcaseRecipe) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [openShowcase, setOpenShowcase] = useState<string | null>(null);
  const items = showcasesFor(surface);
  if (items.length === 0) return null;

  return (
    <div className="border-b border-white/8 px-4 pb-4 pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-1 text-[10px] uppercase tracking-[0.15em] text-white/35 hover:text-white/60"
      >
        <span>Examples — see it built, then make it yours</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <ul className="mt-2 grid grid-cols-1 gap-1.5">
          {items.map((s) => (
            <li key={s.id}>
              <ShowcaseCard showcase={s} onOpen={setOpenShowcase} />
            </li>
          ))}
        </ul>
      )}
      {openShowcase && (
        <ShowcaseOverlay
          showcase={SHOWCASES.find((s) => s.id === openShowcase)!}
          onClose={() => setOpenShowcase(null)}
          onUseRecipe={
            onUseRecipe
              ? (recipe) => {
                  setOpenShowcase(null);
                  onUseRecipe(recipe);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
