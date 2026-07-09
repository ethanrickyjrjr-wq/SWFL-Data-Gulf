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
