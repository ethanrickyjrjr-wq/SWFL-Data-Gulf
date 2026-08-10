// lib/deliverable/language.ts — sentence-bank engine. PURE: no I/O, no LLM.
//
// Spec: docs/superpowers/specs/2026-08-10-sentence-banks-design.md
// Each recipe's approved fact sentences live in a bank file beside its builder
// (<recipe>.language.ts, registry: language-banks.ts). Fixed words are pinned by
// test; facts enter ONLY through typed slots; the model never touches bank text.
//
// Drop-whole precedent (spec's amended decision — both precedents live in this repo):
// voice-guard.ts:13 is PHRASE-surgical because model prose may carry a cited number
// in the same sentence; shared.ts's scaffold-strip is SENTENCE-level delete-only
// ("one bad clause is one bad clause"). A template sentence is the second case with
// less to lose — its only content IS the slot. Fixed words shipped around a hole are
// the vendor blank-space failure (Mailchimp/HubSpot ship literal blanks when a token
// has no default — _RESEARCH/email-and-social/2026-08-09-merge-tag-fallback-vendor-docs.md).

export type SlotType = "number" | "money" | "date" | "time" | "address" | "community" | "text";

export interface SlotDef {
  /** Matches {{name}} in the template text. */
  name: string;
  type: SlotType;
  /** The canvas instruction (SEED_DOCS label law: a label instructs whoever fills the slot). */
  label: string;
  /** Spec Decision 2: an unfilled essential slot blocks a MANUAL send by name
   *  (scheduled sends skip-with-log). Wired at the send seam by the first recipe
   *  that carries one (open-house's time). */
  essential?: boolean;
}

export interface SentenceTemplate {
  text: string;
  slots: SlotDef[];
}

export interface SentenceBank {
  /** RecipeKey value, e.g. "price-reduced". */
  recipe: string;
  /** _RESEARCH paths the words came from (spec FM5 — a bank cites its research). */
  research: string[];
  sentences: SentenceTemplate[];
}

const TOKEN = /\{\{([a-z0-9_]+)\}\}/g;

/** Fill one template. ANY missing/empty slot value → null: the sentence drops WHOLE,
 *  never a gap. An undeclared {{token}} in the text is a bank bug → null too. */
export function renderTemplate(
  t: SentenceTemplate,
  values: Record<string, string | undefined>,
): string | null {
  const declared = new Set(t.slots.map((s) => s.name));
  for (const m of t.text.matchAll(TOKEN)) if (!declared.has(m[1])) return null;
  let ok = true;
  const out = t.text.replace(TOKEN, (_, name: string) => {
    const v = values[name]?.trim();
    if (!v) {
      ok = false;
      return "";
    }
    return v;
  });
  return ok ? out : null;
}

/** Every violation in a bank: a digit in fixed words, a declared slot absent from the
 *  text, an undeclared {{token}} present in it. [] = clean. Red-test every bank file
 *  with this (spec FM1). Digits ONLY — diction is per-recipe craft and must never be
 *  flattened here (spec FM8). */
export function auditBankTemplates(bank: SentenceBank): string[] {
  const violations: string[] = [];
  for (const t of bank.sentences) {
    const fixedWords = t.text.replace(TOKEN, " ");
    if (/\d/.test(fixedWords)) violations.push(`digit in fixed words: "${t.text}"`);
    const tokens = new Set([...t.text.matchAll(TOKEN)].map((m) => m[1]));
    for (const s of t.slots)
      if (!tokens.has(s.name)) violations.push(`slot "${s.name}" not in text: "${t.text}"`);
    for (const name of tokens)
      if (!t.slots.some((s) => s.name === name))
        violations.push(`token "{{${name}}}" undeclared: "${t.text}"`);
  }
  return violations;
}
