import { describe, expect, test } from "bun:test";
import { buildFrozenOccurrence } from "@/lib/email/sequence/frozen-occurrence";
import { defaultDoc } from "@/lib/email/doc/default-docs";
import type { EmailDoc } from "@/lib/email/doc/types";

// A valid EmailDoc fixture with every click-promising slot already linked, so the
// dead-link floor (applyLinkFallbacks) has nothing to fill and the verbatim
// contract below stays byte-exact. Frozen means frozen for CONTENT; a dead
// button gaining a destination is the one sanctioned exception (spec
// 2026-07-12-email-link-destinations, send gate).
const doc: EmailDoc = {
  ...defaultDoc(),
  blocks: defaultDoc().blocks.map((b) =>
    b.type === "button" ? { ...b, props: { ...b.props, url: "https://example.com/cta" } } : b,
  ),
};

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

  test("dead-link floor: a labeled button with no URL gets the ladder, logged", async () => {
    const logs: string[] = [];
    const needy: EmailDoc = {
      ...doc,
      blocks: doc.blocks.map((b) =>
        b.type === "button" ? { ...b, props: { ...b.props, url: "" } } : b,
      ),
    };
    let rendered: EmailDoc | null = null;
    const out = await buildFrozenOccurrence("d-1", {
      loadDeliverable: async () => ({
        doc: needy,
        instruction: null,
        scope_kind: null,
        scope_value: null,
        template: "block-canvas",
      }),
      renderDoc: async (d) => {
        rendered = d;
        return "<html><body>frozen</body></html>";
      },
      hostedUrl: "https://www.swfldatagulf.com/p/d-1",
      log: (l) => logs.push(l),
    });
    expect(out).not.toBeNull();
    const btn = rendered!.blocks.find((b) => b.type === "button")! as {
      props: { url?: string };
    };
    expect(typeof btn.props.url === "string" && btn.props.url.length > 0).toBe(true);
    expect(logs.some((l) => l.includes("link-fallback"))).toBe(true);
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
