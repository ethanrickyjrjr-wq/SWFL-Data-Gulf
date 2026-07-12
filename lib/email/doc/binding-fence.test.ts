// lib/email/doc/binding-fence.test.ts
//
// The binding fence: `binding` is ENGINE-OWNED like `layout`. The doc schema
// round-trips it; the AI patch/author schemas (strip mode) can NEVER write it.
import { describe, it, expect } from "bun:test";
import { EmailDocSchema, BlockContentPatchSchema, AuthoredBlockSchema } from "./schema";
import { BINDING_VERSION } from "./types";

const STYLE = {
  primaryColor: "#0f1d24",
  accentColor: "#3DC9C0",
  fontFamily: "MODERN_SANS",
  textColor: "#111111",
  backdropColor: "#f5f5f5",
};

const BINDING = {
  v: BINDING_VERSION,
  lane: "lake",
  concoctionId: "corridor-profiles",
  params: { county: "Lee" },
  slice: { measures: ["asking_rent_psf"], dimension: "corridor_name" },
  asOf: "07/12/2026",
  sourceLine: "SWFL Data Gulf verified corridor metrics",
};

const docWith = (block: Record<string, unknown>) => ({
  globalStyle: STYLE,
  blocks: [block],
});

describe("binding fence", () => {
  it("EmailDocSchema round-trips a binding", () => {
    const parsed = EmailDocSchema.parse(
      docWith({
        id: "b1",
        type: "metric-card",
        props: { metricValue: "$16.50", metricLabel: "Rent PSF" },
        binding: BINDING,
      }),
    );
    const block = parsed.blocks[0] as { binding?: typeof BINDING };
    expect(block.binding?.concoctionId).toBe("corridor-profiles");
    expect(block.binding?.lane).toBe("lake");
    expect(block.binding?.asOf).toBe("07/12/2026");
  });

  it("a block with NO binding parses unchanged (back-compat)", () => {
    const parsed = EmailDocSchema.parse(docWith({ id: "b2", type: "text", props: { body: "hi" } }));
    expect((parsed.blocks[0] as { binding?: unknown }).binding).toBeUndefined();
  });

  it("the AI content-patch CANNOT write a binding (strip mode drops it)", () => {
    const patch = BlockContentPatchSchema.parse({ body: "new text", binding: BINDING });
    expect("binding" in patch).toBe(false);
  });

  it("the AUTHOR schema CANNOT write a binding (strip mode drops it)", () => {
    const authored = AuthoredBlockSchema.parse({
      type: "text",
      body: "authored text",
      binding: BINDING,
    });
    expect("binding" in authored).toBe(false);
  });

  it("rejects an unknown lane", () => {
    const r = EmailDocSchema.safeParse(
      docWith({
        id: "b3",
        type: "text",
        props: {},
        binding: { ...BINDING, lane: "invented" },
      }),
    );
    expect(r.success).toBe(false);
  });

  it("rejects a malformed as-of (raw token, not MM/DD/YYYY)", () => {
    const r = EmailDocSchema.safeParse(
      docWith({
        id: "b4",
        type: "text",
        props: {},
        binding: { ...BINDING, asOf: "SWFL-1-1-20260712" },
      }),
    );
    expect(r.success).toBe(false);
  });
});
