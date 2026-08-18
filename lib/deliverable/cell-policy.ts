// lib/deliverable/cell-policy.ts
//
// THE ONE ROOT FOR BUYER-FACING FACT-CELL RULINGS.
//
// Operator decree 08/18/2026, verbatim: "why the fuck do we want HOA costs on there? We
// don't want to detour any potential buyers before arriving" — the email's job is to get
// the buyer to ARRIVE; cost questions are the AGENT'S job to answer, in person. A naked
// recurring cost with no amenity story attached is a detour, not a disclosure.
//
// WHY A REGISTRY AND NOT A LINE IN EACH RECIPE: the ruling was implemented on
// under-contract in July and new-listing still rendered an HOA fee on 08/18 — a ruling
// that lives per-recipe must be manually walked to every surface, and the walk is the step
// that never happens (strike shape `decree-in-prose-code-never-walked-it`,
// _ASSISTANT/STRIKES.md). A ruling lands HERE, once, and two mechanisms carry it:
//
//   1. The chrome backstop — `buildLifecycleEmail` (lib/email/lifecycle-chrome.ts) strips
//      banned cells from every stats block it assembles, so a banned cell cannot render on
//      ANY lifecycle email, including recipes written after this file.
//   2. The fleet test — cell-policy.test.ts sweeps the recipes' exported spec builders and
//      is run by Gate 18 (.claude/hooks/check-prepush-gate.mjs) on every push touching
//      lib/deliverable/recipes/ or the chrome.
//
// SCOPE — READER-FACING CELLS ONLY. The model still SEES the fee (operator, 08/06/2026:
// "why would the model not see HOA????") — narrator source lines in recipes/shared.ts are
// untouched by this policy, and the prose-side cost ban is shared.ts's own regex guard.
// This file governs what renders in front of a reader, nothing else.
//
// ADDING A RULING: one entry, with the decree quoted and dated. NEVER implement a content
// ban inside a recipe — that is the exact failure this file exists to end.
// EXCEPTING A RECIPE (none today): if a future email legitimately needs a cost cell (an
// investor carry brief, say), the exception is declared here, visibly — never by bypassing
// the chrome.

export interface BannedCellRule {
  id: string;
  /** Matched against the CELL LABEL a reader would see (StatItem.label). */
  pattern: RegExp;
  /** The operator ruling, quoted and dated — a ban nobody can trace gets re-litigated. */
  decree: string;
}

const COST_DECREE =
  "Operator 08/18/2026: \"why the fuck do we want HOA costs on there? We don't want to " +
  'detour any potential buyers before arriving" — no cost cell on any buyer-facing email; ' +
  "the agent answers cost questions in person.";

export const BUYER_FACING_BANNED_CELLS: BannedCellRule[] = [
  { id: "hoa", pattern: /\bHOA\b/i, decree: COST_DECREE },
  { id: "dues", pattern: /\bdues\b/i, decree: COST_DECREE },
  { id: "taxes", pattern: /\btax(es)?\b/i, decree: COST_DECREE },
  { id: "insurance", pattern: /insurance/i, decree: COST_DECREE },
  {
    id: "cdd",
    pattern: /\bCDD\b/,
    decree:
      COST_DECREE + " CDD (community development district) assessments are the same cost family.",
  },
  { id: "carrying", pattern: /carrying/i, decree: COST_DECREE },
];

/** The rule that bans this cell label, or null if the label is clean. */
export function bannedCellRule(label: string): BannedCellRule | null {
  for (const rule of BUYER_FACING_BANNED_CELLS) {
    if (rule.pattern.test(label)) return rule;
  }
  return null;
}

/** Drop banned cells, keep everything else in order. Pure; safe on any labeled item. */
export function stripBannedCells<T extends { label: string }>(items: T[]): T[] {
  return items.filter((item) => bannedCellRule(item.label) === null);
}
