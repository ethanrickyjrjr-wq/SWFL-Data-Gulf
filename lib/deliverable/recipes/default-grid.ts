// lib/deliverable/recipes/default-grid.ts
//
// The terminal fallback builder (one-lane collapse, spec 2026-08-02). Loads the
// blank skeleton and fills open slots through the SAME sourced machinery every
// fixed-skeleton fill uses. An unfillable slot STAYS OPEN — that, not refusal
// and not invention, is the contract that makes this safe as the last resort.

import type { EmailDoc } from "@/lib/email/doc/types";
import type { RecipeBuildContext } from "./index";
import { fillSkeletonFromSources } from "@/lib/email/build-doc";

export async function buildDefaultGrid(ctx: RecipeBuildContext): Promise<EmailDoc | null> {
  const base = ctx.currentDoc; // dispatcher already seats skeleton or user layout
  const prompt = ctx.prompt?.trim() ?? "";
  if (!prompt) return base; // empty context: the open-slot skeleton IS the build
  try {
    return await fillSkeletonFromSources({
      prompt,
      doc: base,
      scope: ctx.zip ? { kind: "zip", value: ctx.zip } : undefined,
    });
  } catch {
    return base; // sourcing failed → open slots, never null, never invented
  }
}
