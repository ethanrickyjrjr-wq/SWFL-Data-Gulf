// lib/email/blast-variant-doc.ts
//
// Pure helpers for a split-send: validate a variant_test request against the
// authored doc's own variant arrays, and swap a button block's label for a
// given cohort's CTA text. No I/O — the blast route calls these, then renders.

import type { EmailDoc } from "./doc/types";

export interface VariantTestRequest {
  subjects?: string[];
  ctas?: string[];
}

export interface VariantTestValidation {
  ok: boolean;
  error?: string;
  variantCount: number;
}

/** A real split needs >=2 options on at least one axis, and if BOTH axes are
 *  given they must be the same length (one cohort = one subject + one CTA). */
export function validateVariantTest(req: VariantTestRequest): VariantTestValidation {
  const sCount = req.subjects?.length ?? 0;
  const cCount = req.ctas?.length ?? 0;
  if (sCount === 0 && cCount === 0) {
    return { ok: false, error: "variant_test requires subjects or ctas", variantCount: 0 };
  }
  if (sCount > 0 && cCount > 0 && sCount !== cCount) {
    return { ok: false, error: "subjects and ctas variant counts must match", variantCount: 0 };
  }
  const variantCount = Math.max(sCount, cCount);
  if (variantCount > 4) {
    return { ok: false, error: "max 4 variants per split-test", variantCount: 0 };
  }
  return { ok: true, variantCount };
}

/** Every variant_test string must be one the model already wrote onto the doc
 *  itself (doc.subjectVariants/ctaVariants — populated by assembleAuthoredDoc
 *  only after filterAnchoredVariants + cleanTellText, lib/email/author-doc.ts
 *  + lib/email/build-doc.ts). A caller can only PICK from that vetted set,
 *  never inject new text: a raw API request (bypassing the send-modal UI,
 *  which only ever offers the doc's own variants) could otherwise push an
 *  unanchored-number or voice-tell subject/CTA straight into a real send,
 *  skipping the same moat every authored string already passes through.
 *  A doc with no variants (legacy template, or block-canvas doc the model
 *  wrote no variants for) allows no variant_test — split-testing only exists
 *  for the variants the doc actually carries. */
export function variantTestMatchesDoc(
  req: VariantTestRequest,
  doc: Pick<EmailDoc, "subjectVariants" | "ctaVariants"> | null | undefined,
): boolean {
  const allowedSubjects = new Set(doc?.subjectVariants ?? []);
  const allowedCtas = new Set(doc?.ctaVariants ?? []);
  const subjectsOk = (req.subjects ?? []).every((s) => allowedSubjects.has(s));
  const ctasOk = (req.ctas ?? []).every((c) => allowedCtas.has(c));
  return subjectsOk && ctasOk;
}

/** Replace the FIRST button block's label — the doc model is "single centered
 *  CTA" (ButtonBlock.tsx), so there's exactly one to swap. A doc with no
 *  button block is returned unchanged (a CTA-only test with no button is a
 *  no-op, not an error — mirrors the spec's "CTA-only tests are valid" note
 *  degrading gracefully when there's nothing to swap). */
export function withCtaLabel(doc: EmailDoc, label: string): EmailDoc {
  const idx = doc.blocks.findIndex((b) => b.type === "button");
  if (idx === -1) return doc;
  const blocks = [...doc.blocks];
  const target = blocks[idx];
  blocks[idx] = { ...target, props: { ...target.props, label } } as EmailDoc["blocks"][number];
  return { ...doc, blocks };
}
