// lib/email/listing-description-block.test.ts
//
// F4 / F5 from docs/superpowers/specs/2026-08-03-apify-comp-email-design.md §4.

import { describe, test, expect } from "bun:test";
import type { EmailDoc } from "./doc/types";
import {
  buildDescriptionBlock,
  upsertDescriptionBlock,
  isDescriptionBlock,
} from "./listing-description-block";

const REMARKS =
  "Some waterfront homes impress the moment you walk in. This one keeps going. " +
  "Direct gulf access with no bridges. Some photos have been virtually staged and enhanced using AI.";

function docWith(...blocks: EmailDoc["blocks"]): EmailDoc {
  return { version: 1, globalStyle: {}, blocks } as unknown as EmailDoc;
}

describe("F5 · the description is VENDOR-VERBATIM, never authored", () => {
  test("the block body is a literal substring of the source remarks", () => {
    const block = buildDescriptionBlock(REMARKS, "https://www.realtor.com/x")!;
    const body = block.props.body!;
    for (const s of body.split(". ").filter((s) => s.trim() && !s.includes("virtually staged"))) {
      expect(REMARKS).toContain(s.replace(/\.$/, "").trim());
    }
  });

  test("no description → NO block at all, never an empty shell or a placeholder", () => {
    expect(buildDescriptionBlock(null, "https://x.com")).toBeNull();
    expect(buildDescriptionBlock("<NA>", "https://x.com")).toBeNull();
    expect(buildDescriptionBlock("", "https://x.com")).toBeNull();
  });

  test("the staging disclosure rides into the block", () => {
    const block = buildDescriptionBlock(REMARKS, "https://www.realtor.com/x")!;
    expect(block.props.body).toContain("virtually staged");
  });

  test("the block links OUT to the listing rather than printing the whole record", () => {
    const block = buildDescriptionBlock(REMARKS, "https://www.realtor.com/x")!;
    expect(block.props.linkUrl).toBe("https://www.realtor.com/x");
  });

  test("a missing property_url is an unlinked block, never a fabricated href", () => {
    const block = buildDescriptionBlock(REMARKS, undefined)!;
    expect(block.props.linkUrl).toBeUndefined();
  });
});

describe("F4 · the description is NOT a narrative slot", () => {
  test("it is identifiable as the description, so a narrative pass can skip it", () => {
    const block = buildDescriptionBlock(REMARKS, "https://www.realtor.com/x")!;
    expect(isDescriptionBlock(block)).toBe(true);
    expect(
      isDescriptionBlock({ id: "b", type: "text", props: { body: "narrator prose" } } as never),
    ).toBe(false);
  });

  test("upsert REPLACES in place — a rebuild never stacks two descriptions", () => {
    const first = buildDescriptionBlock(REMARKS, "https://x.com")!;
    let doc = upsertDescriptionBlock(docWith(), first);
    doc = upsertDescriptionBlock(
      doc,
      buildDescriptionBlock("A different home entirely.", "https://x.com")!,
    );
    const found = doc.blocks.filter(isDescriptionBlock);
    expect(found).toHaveLength(1);
    expect(found[0].props.body).toBe("A different home entirely.");
  });

  test("the narrator's paragraph and the description BOTH survive together", () => {
    const narrative = { id: "n1", type: "text", props: { body: "The code-authored verdict." } };
    const doc = upsertDescriptionBlock(
      docWith(narrative as never),
      buildDescriptionBlock(REMARKS, "https://x.com")!,
    );
    const texts = doc.blocks.filter((b) => b.type === "text");
    expect(texts).toHaveLength(2);
    expect(
      texts.some((b) => (b.props as { body?: string }).body === "The code-authored verdict."),
    ).toBe(true);
    expect(texts.some(isDescriptionBlock)).toBe(true);
  });

  test("it lands BEFORE the agent card / CTA, not after the sign-off", () => {
    const doc = upsertDescriptionBlock(
      docWith(
        { id: "t", type: "text", props: { body: "prose" } } as never,
        { id: "a", type: "agent-card", props: {} } as never,
        { id: "f", type: "footer", props: {} } as never,
      ),
      buildDescriptionBlock(REMARKS, "https://x.com")!,
    );
    const idx = doc.blocks.findIndex(isDescriptionBlock);
    const agent = doc.blocks.findIndex((b) => b.type === "agent-card");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(agent);
  });
});
