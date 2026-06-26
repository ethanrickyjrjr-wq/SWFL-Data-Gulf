// gap-fill-pass.ts — FOUR-LANE GAP-FILL for a deliverable payload.
//
// RULE 0.7 (NEVER HANDCUFF A BUILD): a blank figure is never left blank and never
// invented. Each empty field is handed to a `fill` function that returns a CITED
// value or null. A cited value lands on the field with its citation; a null becomes
// an explicit "[Need: <key>]" placeholder flagged `needed:true` — a request for the
// number, NOT a fabricated one. Non-blank fields pass through untouched.
//
// The `fill` fn is INJECTED, not imported, so the route can wire the real
// lib/assistant/gap-fill.fillExternalPoint (a cited value or null) without this
// module depending on the Anthropic web_search surface. This file holds zero network
// code and is fully unit-testable with a mock fill.

export interface PayloadField {
  key: string;
  value: string | null;
}

export interface FilledField {
  key: string;
  /** The held value, the cited fill value, or a "[Need: <key>]" placeholder. */
  value: string;
  /** Present only when the value came from a cited fill. */
  citation?: string;
  /** True only when no source filled the gap — a request, never an invention. */
  needed?: boolean;
}

/** A cited fill result, or null when no real source has the number. */
export type FillFn = (key: string) => Promise<{ value: string; citation: string } | null>;

/** A field is blank when its value is null/undefined or only whitespace. */
function isBlank(value: string | null): boolean {
  return value == null || value.trim() === "";
}

/**
 * Run the four-lane gap-fill over a payload. For every blank field, ask `fill`;
 * a cited value is used verbatim with its citation, a null becomes an explicit
 * "[Need: <key>]" placeholder (`needed:true`) — NEVER a fabricated number. Non-blank
 * fields pass through unchanged. Order is preserved. Never throws on the data path;
 * a thrown `fill` propagates (the caller decides), but a null is the no-source path.
 */
export async function gapFillPayload(fields: PayloadField[], fill: FillFn): Promise<FilledField[]> {
  const out: FilledField[] = [];
  for (const field of fields) {
    if (!isBlank(field.value)) {
      out.push({ key: field.key, value: field.value as string });
      continue;
    }
    const filled = await fill(field.key);
    if (filled && typeof filled.value === "string" && !isBlank(filled.value)) {
      out.push({ key: field.key, value: filled.value, citation: filled.citation });
    } else {
      out.push({ key: field.key, value: `[Need: ${field.key}]`, needed: true });
    }
  }
  return out;
}
