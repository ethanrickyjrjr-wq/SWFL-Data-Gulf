// lib/email/voice-guard.ts
//
// voiceGuard — the banned-phrase lint on authored email PROSE (spec
// 2026-07-08-email-voice-guard-design). It removes corporate-AI "tells" — the
// robotic register ("I hope this email finds you well", "circle back", "in
// today's fast-paced market") that makes an AI-written email read as templated.
// Derived from the 07/08/2026 social sweep's highest-engagement email finding.
//
// PURE — no LLM, no I/O — so it composes into build-doc.ts's existing author
// repair loop with no second round-trip (detection is local; the model only
// regenerates once, exactly as it already does for an invented number).
//
// TWO differences from lintAuthoredProse (the no-invention gate), by design:
//   1. A tell is NOT an invention — stripping is PHRASE-surgical (delete the
//      phrase, tidy whitespace) NOT sentence-level, so a cited number sharing the
//      sentence is never lost.
//   2. The list is conservative (universal corporate-AI tells only) — no
//      real-estate clichés, no debatable common words ("reach out", "leverage")
//      that agents genuinely use. Grow from real sends.
// It walks the SAME prose surfaces as the invention lint via the shared field
// lists exported from author-doc.ts — the two can never drift.

import type { EmailBlock, EmailDoc } from "./doc/types";
import { PROSE_FIELDS, COLUMN_PROSE_FIELDS, ITEM_PROSE_FIELDS } from "./author-doc";

export interface VoiceTell {
  /** Case-insensitive matcher for the phrase. */
  pattern: RegExp;
  /** A short family label (kept for future analytics; v1 uses only the match). */
  label: string;
}

// Apostrophes match both the straight (') and curly (’) forms.
const AP = "['’]";

/**
 * THE ONE authoritative banned-phrase list. v1 = corporate-AI tells only
 * (near-zero false positives). Each pattern is boundary-aware so it never fires
 * mid-word. Add to THIS array to grow the guard — never define a phrase elsewhere.
 */
export const VOICE_TELLS: VoiceTell[] = [
  {
    pattern: new RegExp(
      `\\bI hope (?:this (?:email )?finds you well|you(?:${AP}re| are) (?:doing )?well)\\b`,
      "i",
    ),
    label: "greeting-cliché",
  },
  { pattern: /\bcircle back\b/i, label: "corporate-filler" },
  {
    pattern:
      /\bin today['’]s (?:fast-paced|ever-changing|competitive|dynamic) (?:world|market|landscape|environment)\b/i,
    label: "filler-opener",
  },
  { pattern: new RegExp(`\\b(?:please )?don${AP}t hesitate to\\b`, "i"), label: "hedge" },
  { pattern: /\bseamless(?:ly)?\b/i, label: "buzzword" },
  { pattern: /\bdelve(?: into)?\b/i, label: "ai-tell" },
  { pattern: /\bat the end of the day\b/i, label: "filler" },
  {
    pattern: new RegExp(`\\bit${AP}s (?:worth noting|important to note)(?: that)?\\b`, "i"),
    label: "hedge",
  },
  { pattern: /\b(?:unlock|elevate) your\b/i, label: "buzzword" },
  {
    pattern: new RegExp(`\\bwe(?:${AP}re| are) (?:thrilled|excited) to\\b`, "i"),
    label: "filler-opener",
  },
  { pattern: /\blook no further\b/i, label: "cliché" },
  { pattern: /\brest assured\b/i, label: "hedge" },
];

/** A global-flag clone of a pattern (for iterated exec / replace). */
function globalize(pattern: RegExp): RegExp {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  return new RegExp(pattern.source, flags);
}

/** Tidy a field after phrase removal: collapse doubled whitespace, drop a space
 *  left before punctuation, remove orphaned leading punctuation/space, and
 *  re-capitalize a sentence start the strip left lowercase. Never touches digits. */
function tidy(s: string): string {
  return s
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .replace(/^[\s.,!?;:]+/, "")
    .replace(/([.!?]\s+)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/^([a-z])/, (c) => c.toUpperCase())
    .trim();
}

/** Every prose string in the doc (block fields + nested column/item fields). */
function eachProseString(doc: EmailDoc, visit: (text: string) => void): void {
  for (const b of doc.blocks) {
    const props = b.props as Record<string, unknown>;
    for (const f of PROSE_FIELDS) {
      const v = props[f];
      if (typeof v === "string" && v) visit(v);
    }
    visitNested(props.columns, COLUMN_PROSE_FIELDS, visit);
    visitNested(props.items, ITEM_PROSE_FIELDS, visit);
  }
}

function visitNested(arr: unknown, fields: readonly string[], visit: (text: string) => void): void {
  if (!Array.isArray(arr)) return;
  for (const el of arr) {
    if (!el || typeof el !== "object") continue;
    const rec = el as Record<string, unknown>;
    for (const f of fields) {
      const v = rec[f];
      if (typeof v === "string" && v) visit(v);
    }
  }
}

/** The distinct banned phrases present in the doc's prose (verbatim matched text),
 *  in first-seen order — named to the model in the single regeneration ask. */
export function detectVoiceTells(doc: EmailDoc): string[] {
  const found = new Set<string>();
  eachProseString(doc, (text) => {
    for (const { pattern } of VOICE_TELLS) {
      const g = globalize(pattern);
      let m: RegExpExecArray | null;
      while ((m = g.exec(text)) !== null) {
        found.add(m[0]);
        if (m.index === g.lastIndex) g.lastIndex++; // guard against a zero-width match
      }
    }
  });
  return [...found];
}

/** Remove every tell phrase from a single field, tidying only when it changed. */
function cleanField(text: string): string {
  let out = text;
  for (const { pattern } of VOICE_TELLS) out = out.replace(globalize(pattern), "");
  return out === text ? text : tidy(out);
}

/** Phrase-surgical strip: delete each tell from every prose field and tidy. A
 *  co-located cited number is preserved (unlike the sentence-level invention
 *  strip). Returns a new doc; unchanged blocks keep their reference. */
export function stripVoiceTells(doc: EmailDoc): EmailDoc {
  const blocks = doc.blocks.map((b) => {
    const props = b.props as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = { ...props };

    for (const f of PROSE_FIELDS) {
      const v = props[f];
      if (typeof v === "string" && v) {
        const c = cleanField(v);
        if (c !== v) {
          next[f] = c;
          changed = true;
        }
      }
    }
    if (cleanNested(props.columns, COLUMN_PROSE_FIELDS, next, "columns")) changed = true;
    if (cleanNested(props.items, ITEM_PROSE_FIELDS, next, "items")) changed = true;

    return changed ? ({ ...b, props: next } as EmailBlock) : b;
  });
  return { ...doc, blocks };
}

/** Clean a nested prose array in place on `target`; returns whether it changed. */
function cleanNested(
  arr: unknown,
  fields: readonly string[],
  target: Record<string, unknown>,
  key: string,
): boolean {
  if (!Array.isArray(arr)) return false;
  let arrChanged = false;
  const nextArr = arr.map((el) => {
    if (!el || typeof el !== "object") return el;
    const rec = el as Record<string, unknown>;
    let elChanged = false;
    const nel: Record<string, unknown> = { ...rec };
    for (const f of fields) {
      const v = rec[f];
      if (typeof v === "string" && v) {
        const c = cleanField(v);
        if (c !== v) {
          nel[f] = c;
          elChanged = true;
        }
      }
    }
    if (elChanged) arrChanged = true;
    return elChanged ? nel : el;
  });
  if (arrChanged) target[key] = nextArr;
  return arrChanged;
}

export interface VoiceGuardResult {
  /** No tells found. */
  ok: boolean;
  /** Distinct matched phrases (for the regeneration ask). */
  tells: string[];
  /** The doc with every tell phrase surgically removed (the SAME doc ref when clean). */
  stripped: EmailDoc;
}

/** Detect + strip in one pass. When clean, `stripped` is the input doc unchanged. */
export function voiceGuard(doc: EmailDoc): VoiceGuardResult {
  const tells = detectVoiceTells(doc);
  return { ok: tells.length === 0, tells, stripped: tells.length ? stripVoiceTells(doc) : doc };
}
