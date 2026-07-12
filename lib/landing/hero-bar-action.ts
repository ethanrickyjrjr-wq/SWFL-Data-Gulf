// lib/landing/hero-bar-action.ts
//
// The ONE homepage input's pure router (spec 2026-07-12-homepage-one-bar).
// Three modes, three existing destinations — no new engines:
//   campaign → the lab doors (heroDestination / openZipLab, unchanged semantics)
//   report   → /r/zip-report/<zip> (one-ZIP truth) or /r/search?q= (any place)
//   ask      → inline stream via the existing /api/assistant engine (no navigation)
// Free text never errors: it is carried to the destination as-is.

import { heroDestination, openZipLab } from "@/lib/lab-entry/destination";
import type { HeroCampaignEntry } from "@/lib/campaigns";
import type { ConverseInput } from "@/lib/assistant/converse";

export type HeroBarMode = "campaign" | "report" | "ask";

export type HeroBarAction =
  { kind: "navigate"; href: string } | { kind: "ask"; question: string } | { kind: "none" };

const BARE_ZIP = /^\d{5}$/;

export function heroBarAction(
  mode: HeroBarMode,
  raw: string,
  campaign: HeroCampaignEntry,
): HeroBarAction {
  const q = raw.trim();
  if (!q) return { kind: "none" };
  switch (mode) {
    case "campaign":
      // A typed bare ZIP means "a campaign about this ZIP" — the existing lab
      // door for that (the only path that makes the email ZIP-scoped).
      return BARE_ZIP.test(q)
        ? { kind: "navigate", href: openZipLab(q) }
        : { kind: "navigate", href: heroDestination(campaign, { filled: q }) };
    case "report":
      return BARE_ZIP.test(q)
        ? { kind: "navigate", href: `/r/zip-report/${q}` }
        : { kind: "navigate", href: `/r/search?q=${encodeURIComponent(q)}` };
    case "ask":
      return { kind: "ask", question: q };
  }
}

/** Ask-mode input for the shared assistant engine: question only — NO reportId,
 *  so the engine takes its grounded off-report conversation path. */
export function homeAskInput(question: string): ConverseInput {
  return { question };
}
