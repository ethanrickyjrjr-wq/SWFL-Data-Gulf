// lib/email/emaildoc-subject.ts
//
// Derive an email SUBJECT line from an EmailDoc. The block-canvas EmailDoc model
// (lib/email/doc/types.ts) carries no subject field — the design is blocks + style —
// so a scheduled send must synthesize one from the content. PURE: no I/O, no Date.
//
// Preference order picks the most "headline-like" text actually present, falling back
// gracefully so we never ship an empty subject. The AI content-fill refreshes these
// block texts each occurrence, so the subject tracks the fresh content for free.

import type { EmailDoc, EmailBlock } from "./doc/types";

const MAX_SUBJECT = 90;

function firstText(blocks: EmailBlock[], type: EmailBlock["type"], key: string): string | null {
  for (const b of blocks) {
    if (b.type !== type) continue;
    const v = (b.props as Record<string, unknown>)[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Collapse whitespace + clamp to a sane subject length (… when truncated). */
function clean(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > MAX_SUBJECT ? t.slice(0, MAX_SUBJECT - 1).trimEnd() + "…" : t;
}

/**
 * Best subject for an EmailDoc. Prefers a variant from `subjectVariants[0]` when present;
 * falls back to block-derived text. A `signal.title` reads like a headline; a hero's
 * label/kicker is the next-best human line; then the header's tagline/company. Never
 * returns "" — a doc with no usable text falls back to a neutral default.
 */
export function deriveEmailDocSubject(doc: EmailDoc): string {
  const variant = doc.subjectVariants?.[0]?.trim();
  if (variant) return clean(variant);

  const b = doc.blocks;
  const headline =
    firstText(b, "signal", "title") ??
    firstText(b, "hero", "label") ??
    firstText(b, "hero", "kicker") ??
    firstText(b, "hero", "value") ??
    firstText(b, "header", "tagline");
  if (headline) return clean(headline);

  const company = firstText(b, "header", "companyName");
  if (company) return clean(`${company} — market update`);

  return "Your Southwest Florida market update";
}
