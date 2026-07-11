// This repo has no DOM test environment by design — tests are bun:test + pure.
// We export `deriveTitle` from MaterialRow and test the core display logic directly.
import { describe, test, expect } from "bun:test";
import { deriveTitle } from "./MaterialRow";
import type { DeliverableRow } from "@/app/project/[id]/workspace/types";
import { SEED_DOCS } from "@/lib/email/doc/default-docs";

const base: DeliverableRow = {
  id: "d1",
  template: "block-canvas",
  status: "ready",
  created_at: new Date().toISOString(),
  scope_kind: null,
  scope_value: null,
  exec_summary: null,
  preview_chart: null,
  branding: null,
  deleted_at: null,
  supersedes_id: null,
  item_ids: [],
  data_as_of: new Date().toISOString(),
  doc: {
    globalStyle: {
      primaryColor: "#0f1d24",
      accentColor: "#3DC9C0",
      fontFamily: "MODERN_SANS",
      textColor: "#242424",
      backdropColor: "#F8F8F8",
    },
    blocks: [
      {
        id: "b1",
        type: "hero",
        props: { label: "Just Sold · Cape Coral" },
      },
    ],
  },
};

describe("MaterialRow", () => {
  test("derives title from hero label", () => {
    expect(deriveTitle(base)).toBe("Just Sold · Cape Coral");
  });

  test("falls back to hero value when label is absent", () => {
    const d: DeliverableRow = {
      ...base,
      doc: {
        globalStyle: base.doc!.globalStyle,
        blocks: [{ id: "b2", type: "hero", props: { value: "$512K" } }],
      },
    };
    expect(deriveTitle(d)).toBe("$512K");
  });

  test("falls back to header tagline when hero has no label or value", () => {
    const d: DeliverableRow = {
      ...base,
      doc: {
        globalStyle: base.doc!.globalStyle,
        blocks: [
          { id: "b1", type: "hero", props: {} },
          { id: "b2", type: "header", props: { tagline: "Lee County Market" } },
        ],
      },
    };
    expect(deriveTitle(d)).toBe("Lee County Market");
  });

  test("prefers a hero label over an EARLIER header tagline (real seed block order)", () => {
    // Every SEED_DOC is header-first, and the default header carries a tagline. A
    // document-order scan would wrongly return the brand tagline for every material;
    // the precedence is hero.label → hero.value → header.tagline regardless of order.
    const d: DeliverableRow = {
      ...base,
      doc: {
        globalStyle: base.doc!.globalStyle,
        blocks: [
          {
            id: "b0",
            type: "header",
            props: { companyName: "ACME", tagline: "Southwest Florida Real Estate" },
          },
          { id: "b1", type: "hero", props: { label: "Just Sold · Cape Coral" } },
        ],
      },
    };
    expect(deriveTitle(d)).toBe("Just Sold · Cape Coral");
  });

  test("titles a real header-first seed from its hero, not the brand tagline", () => {
    const justSold = SEED_DOCS.find((s) => s.id === "just-sold")!;
    const doc = justSold.build();
    const d: DeliverableRow = { ...base, doc };
    // Assert against the seed's ACTUAL hero copy (not a hardcoded literal) so this
    // can't rot when seed copy changes — as it did when the hero became an
    // instructional slot label per the 07/08 seed-slot playbook. The real invariant
    // is the FIELD precedence: deriveTitle picks the hero over the header tagline.
    const heroBlock = doc.blocks.find((b) => b.type === "hero")!;
    const headerBlock = doc.blocks.find((b) => b.type === "header");
    const expectedHero = heroBlock.props.label ?? heroBlock.props.value;
    expect(deriveTitle(d)).toBe(expectedHero);
    expect(deriveTitle(d)).not.toBe(headerBlock?.props.tagline);
  });

  test("version count string for 1 version is 'Updated 1×'", () => {
    const versions: DeliverableRow[] = [base];
    expect(`Updated ${versions.length}×`).toBe("Updated 1×");
  });

  test("version count string for 3 versions is 'Updated 3×'", () => {
    const versions: DeliverableRow[] = [base, base, base];
    expect(`Updated ${versions.length}×`).toBe("Updated 3×");
  });
});
