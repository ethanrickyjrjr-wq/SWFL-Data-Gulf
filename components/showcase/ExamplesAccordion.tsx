"use client";

import { useState } from "react";
import { showcasesFor, SHOWCASES } from "@/lib/showcase/registry";
import { ShowcaseCard } from "@/components/showcase/ShowcaseCard";
import { ShowcaseOverlay } from "@/components/showcase/ShowcaseOverlay";

/**
 * Collapsed "Examples" section for the lab rails (operator ruling 07/03/2026):
 * examples live IN the lab they demonstrate — email examples in the Email lab,
 * social examples in the Social tool — closed by default, never auto-injected
 * into the AI panel (that read as the AI pitching demo fixtures as your data).
 * Same industry pattern as the majors: the gallery is an explicit entry point
 * in the editor, not ambient content.
 */
export function ExamplesAccordion({ surface }: { surface: "email" | "social" }) {
  const [open, setOpen] = useState(false);
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
        <span>Examples — see it built</span>
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
        />
      )}
    </div>
  );
}
