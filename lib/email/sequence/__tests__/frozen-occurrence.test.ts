import { describe, expect, test } from "bun:test";
import { buildFrozenOccurrence } from "@/lib/email/sequence/frozen-occurrence";
import { defaultDoc } from "@/lib/email/doc/default-docs";

const doc = defaultDoc(); // a valid EmailDoc fixture

describe("buildFrozenOccurrence", () => {
  test("renders the saved doc verbatim — renderDoc receives the STORED doc", async () => {
    let rendered: unknown = null;
    const out = await buildFrozenOccurrence("d-1", {
      loadDeliverable: async () => ({
        doc,
        instruction: null,
        scope_kind: null,
        scope_value: null,
        template: "block-canvas",
      }),
      renderDoc: async (d) => {
        rendered = d;
        return "<html><body>frozen</body></html>";
      },
    });
    expect(out).not.toBeNull();
    expect(rendered).toEqual(doc); // NOT a rebuilt doc — frozen means frozen
    expect(out!.emailDocHtml).toContain("frozen");
    expect(out!.body).toBe("");
  });
  test("missing deliverable → null", async () => {
    const out = await buildFrozenOccurrence("gone", {
      loadDeliverable: async () => null,
      renderDoc: async () => "x",
    });
    expect(out).toBeNull();
  });
  test("non-block-canvas → null", async () => {
    const out = await buildFrozenOccurrence("d-2", {
      loadDeliverable: async () => ({
        doc,
        instruction: null,
        scope_kind: null,
        scope_value: null,
        template: "pdf",
      }),
      renderDoc: async () => "x",
    });
    expect(out).toBeNull();
  });
  test("invalid stored doc → null", async () => {
    const out = await buildFrozenOccurrence("d-3", {
      loadDeliverable: async () => ({
        doc: { junk: true },
        instruction: null,
        scope_kind: null,
        scope_value: null,
        template: "block-canvas",
      }),
      renderDoc: async () => "x",
    });
    expect(out).toBeNull();
  });
});
