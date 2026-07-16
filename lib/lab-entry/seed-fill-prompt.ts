// lib/lab-entry/seed-fill-prompt.ts
//
// The build prompt a template pick synthesizes (spec
// 2026-07-16-seed-capture-or-blank-design.md). The template IS the layout —
// this prompt only tells the builder whose numbers fill it. Wording mirrors the
// PLATFORM_ARC recipe register: plain, sourced, no hype. Every figure the build
// writes comes from the four-lane build path; the prompt never carries one.
import type { SeedDoc } from "@/lib/email/doc/default-docs";

export function seedFillPrompt(
  seed: Pick<SeedDoc, "name" | "subject">,
  subjectValue: string | null,
): string {
  const v = (subjectValue ?? "").trim();
  if (seed.subject === "address" && v) {
    return `Fill this ${seed.name} email for my listing at ${v} — keep the layout, fill every open slot with real sourced figures for that property and its market.`;
  }
  if (seed.subject === "area" && v) {
    return `Fill this ${seed.name} email for ${v} — keep the layout, fill every open slot with real sourced figures for that area.`;
  }
  return `Fill this ${seed.name} email for my area — keep the layout, use my brand details and real sourced figures for my region.`;
}
