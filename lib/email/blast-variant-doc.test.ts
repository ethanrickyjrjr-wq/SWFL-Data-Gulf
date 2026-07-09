import { describe, expect, it } from "bun:test";
import { validateVariantTest, withCtaLabel } from "./blast-variant-doc";
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
