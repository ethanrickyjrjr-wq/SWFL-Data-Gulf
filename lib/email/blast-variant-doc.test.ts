import { describe, expect, it } from "bun:test";
import { validateVariantTest, variantTestMatchesDoc, withCtaLabel } from "./blast-variant-doc";
import type { EmailDoc } from "./doc/types";

describe("validateVariantTest", () => {
  it("accepts subjects only", () => {
    expect(validateVariantTest({ subjects: ["A", "B"] })).toEqual({ ok: true, variantCount: 2 });
  });
  it("accepts ctas only", () => {
    expect(validateVariantTest({ ctas: ["A", "B", "C"] })).toEqual({ ok: true, variantCount: 3 });
  });
  it("rejects mismatched subject/cta counts", () => {
    expect(validateVariantTest({ subjects: ["A", "B"], ctas: ["X", "Y", "Z"] }).ok).toBe(false);
  });
  it("rejects neither axis given", () => {
    expect(validateVariantTest({}).ok).toBe(false);
  });
  it("rejects more than 4 variants", () => {
    expect(validateVariantTest({ subjects: ["A", "B", "C", "D", "E"] }).ok).toBe(false);
  });
});

describe("variantTestMatchesDoc", () => {
  const doc = {
    subjectVariants: ["Subject A", "Subject B"],
    ctaVariants: ["View Report", "See the Numbers"],
  };

  it("accepts subjects that are a subset of doc.subjectVariants", () => {
    expect(variantTestMatchesDoc({ subjects: ["Subject B"] }, doc)).toBe(true);
  });

  it("accepts ctas that are a subset of doc.ctaVariants", () => {
    expect(variantTestMatchesDoc({ ctas: ["View Report", "See the Numbers"] }, doc)).toBe(true);
  });

  it("rejects a subject not authored onto the doc — no injection via the API", () => {
    expect(variantTestMatchesDoc({ subjects: ["Subject B", "$999,000 invented"] }, doc)).toBe(
      false,
    );
  });

  it("rejects a cta not authored onto the doc", () => {
    expect(variantTestMatchesDoc({ ctas: ["Click here now!!"] }, doc)).toBe(false);
  });

  it("rejects any variant_test when the doc carries no variants at all (legacy template, or none authored)", () => {
    expect(variantTestMatchesDoc({ subjects: ["Anything"] }, null)).toBe(false);
    expect(variantTestMatchesDoc({ subjects: ["Anything"] }, undefined)).toBe(false);
    expect(variantTestMatchesDoc({ ctas: ["Anything"] }, { subjectVariants: ["Subject A"] })).toBe(
      false,
    );
  });

  it("passes trivially when neither axis is given (validateVariantTest already rejects this shape upstream)", () => {
    expect(variantTestMatchesDoc({}, doc)).toBe(true);
  });
});

describe("withCtaLabel", () => {
  const doc: EmailDoc = {
    globalStyle: {} as EmailDoc["globalStyle"],
    blocks: [
      { id: "1", type: "text", props: { body: "hi" } },
      { id: "2", type: "button", props: { label: "View Report", url: "https://x" } },
    ],
  };

  it("swaps the first button block's label", () => {
    const out = withCtaLabel(doc, "See the Numbers");
    expect((out.blocks[1].props as { label?: string }).label).toBe("See the Numbers");
    expect((out.blocks[1].props as { url?: string }).url).toBe("https://x"); // untouched
  });

  it("is a no-op when there's no button block", () => {
    const noButton: EmailDoc = { ...doc, blocks: [doc.blocks[0]] };
    expect(withCtaLabel(noButton, "X")).toEqual(noButton);
  });
});
