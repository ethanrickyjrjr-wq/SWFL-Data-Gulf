"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { EmailLabGridShell } from "@/components/email-lab/EmailLabGridShell";
import { seedById, SEED_DOCS } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";
import type { BrandNeed, ShowcaseRecipe } from "@/lib/showcase/recipe";

// Standalone PAID-tier grid lab (the north star) — no project scope yet, so you
// can play with it before Stripe gating exists. Opens on a pre-positioned grid
// seed so the first load already LOOKS like the north star; degrades to the
// first linear seed (stacked) if the grid seeds aren't present.
// Reads `?recipe=<prompt>&recipeNeeds=<comma needs>` (the showcase "Make
// this →" carry — pill or the /showcase page, lib/project/lab-redirect.ts)
// straight off the URL rather than via a prop from page.tsx: the parent
// server component only needs to handle the SIGNED-IN redirect carry (it
// already does, for the labDestination/AutoCreateProject hop); this
// anonymous leaf reads its own query string, so it never depends on page.tsx
// remembering to thread anything through. Absent → the lab opens blank.
export function EmailLabGridClient({ seedDoc }: { seedDoc?: EmailDoc | null }) {
  // ?zip= server-built prebuild wins; otherwise the static grid seed.
  const [initialDoc] = useState(
    () => seedDoc ?? (seedById("luxury-market-report") ?? SEED_DOCS[0]).build(),
  );
  const searchParams = useSearchParams();
  const recipePrompt = searchParams.get("recipe");
  const recipeNeedsCsv = searchParams.get("recipeNeeds");
  const initialRecipe: ShowcaseRecipe | null = recipePrompt
    ? {
        prompt: recipePrompt,
        needs: (recipeNeedsCsv ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as BrandNeed[],
      }
    : null;

  return (
    <EmailLabGridShell
      initialDoc={initialDoc}
      initialRecipe={initialRecipe}
      headerSlot={
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-gulf-teal">Email</span>
          <span className="text-gulf-teal">Lab</span>
          <span className="rounded bg-gulf-teal px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[#0a1419]">
            Grid · paid
          </span>
        </span>
      }
    />
  );
}
