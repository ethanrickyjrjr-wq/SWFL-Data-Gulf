// lib/email/listing-description-block.test.ts
//
// F4 / F5 from docs/superpowers/specs/2026-08-03-apify-comp-email-design.md §4.

import { describe, test, expect } from "bun:test";
import type { EmailDoc } from "./doc/types";
import {
  buildDescriptionBlock,
  upsertDescriptionBlock,
  isDescriptionBlock,
  emptyDescriptionSlot,
  dropEmptyDescriptionSlot,
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

describe("FALLBACK — a doc that reserved no slot still keeps the description out of the footer", () => {
  // This branch cannot truly PLACE anything: a spliced block carries no `layout` and
  // finalize-doc sinks it to the bottom of the content. It exists so the block is never
  // LOST, and so it at least precedes the chrome in array order. The real contract is the
  // reserved slot — see the next describe. If a recipe is landing here, it should reserve.
  const b = (type: string, id = type) =>
    ({ id, type, props: {} }) as unknown as EmailDoc["blocks"][number];
  const desc = () => buildDescriptionBlock(REMARKS, "https://www.realtor.com/x")!;
  const typesOf = (d: EmailDoc) => d.blocks.map((x) => x.type);

  test("it is inserted before the agent card, the CTA and the footer", () => {
    const doc = upsertDescriptionBlock(
      docWith(b("hero"), b("list"), b("agent-card"), b("button"), b("footer")),
      desc(),
    );
    const t = typesOf(doc);
    expect(t.indexOf("text")).toBeLessThan(t.indexOf("agent-card"));
    expect(t.indexOf("text")).toBeLessThan(t.indexOf("button"));
    expect(t.indexOf("text")).toBeLessThan(t.indexOf("footer"));
  });

  test("no chrome at all → it is still added, never dropped", () => {
    const doc = upsertDescriptionBlock(docWith(b("hero"), b("list")), desc());
    expect(doc.blocks.filter(isDescriptionBlock)).toHaveLength(1);
  });

  test("a REFRESH replaces rather than stacks, even on the fallback path", () => {
    const once = upsertDescriptionBlock(docWith(b("hero"), b("button")), desc());
    const twice = upsertDescriptionBlock(once, desc());
    expect(twice.blocks.filter(isDescriptionBlock)).toHaveLength(1);
  });
});

describe("PLACEMENT IS BY layout.y — and that is why the slot is RESERVED, not spliced", () => {
  // THE HALF OF THE BUG THAT ACTUALLY REACHED AN INBOX. finalize-doc.ts:20, verbatim:
  // "a hand-written block with no `layout` sinks to y = 1_000_000 (the bottom of the
  // content, just above the footer)". Splicing the description into the middle of the
  // block ARRAY therefore placed nothing — it printed under the CTA and under
  // "Sources (2)", which is what the operator opened on his phone on 08/04/2026.
  //
  // The fix is not a smarter index. It is that the recipe RESERVES an empty slot in its
  // chrome (`emptyDescriptionSlot`), the layout seam mints its coordinates next to the
  // property facts, and this function fills it IN PLACE.
  const laid = (type: string, y: number, h: number, props: Record<string, unknown> = {}) =>
    ({
      id: `${type}-${y}`,
      type,
      props,
      layout: { x: 0, y, w: 12, h },
    }) as unknown as EmailDoc["blocks"][number];
  const desc = () => buildDescriptionBlock(REMARKS, "https://www.realtor.com/x")!;
  const slotOf = (d: EmailDoc) =>
    d.blocks.find(isDescriptionBlock) as unknown as
      { layout?: { y: number }; props: { body?: string } } | undefined;

  /** A doc shaped like the real one: the reserved slot sits between stats and the list. */
  const reserved = () =>
    docWith(
      laid("header", 0, 2),
      laid("hero", 2, 4),
      laid("stats", 6, 3),
      laid("text", 9, 3, { body: "", descriptionSlot: true }),
      laid("list", 12, 6),
      laid("text", 18, 4, { body: "" }), // the narrative slot
      laid("agent-card", 22, 4),
      laid("button", 22, 4),
      laid("sources", 26, 3),
      laid("footer", 29, 2),
    );

  test("filling the reserved slot KEEPS its seam-minted coordinates", () => {
    const out = upsertDescriptionBlock(reserved(), desc());
    const slot = slotOf(out)!;
    expect(slot.layout?.y).toBe(9); // exactly where the chrome put it
    expect(slot.props.body).toContain("waterfront");
  });

  test("the filled description never sinks to the y=1,000,000 bottom", () => {
    const out = upsertDescriptionBlock(reserved(), desc());
    expect(slotOf(out)!.layout?.y).toBeLessThan(1000);
  });

  test("it renders below the property facts and above the comps, CTA, sources, footer", () => {
    const out = upsertDescriptionBlock(reserved(), desc());
    const y = slotOf(out)!.layout!.y;
    const yOf = (type: string) =>
      (out.blocks.find((b) => b.type === type) as { layout?: { y: number } }).layout!.y;
    expect(y).toBeGreaterThan(yOf("stats"));
    expect(y).toBeLessThan(yOf("list"));
    expect(y).toBeLessThan(yOf("button"));
    expect(y).toBeLessThan(yOf("sources"));
    expect(y).toBeLessThan(yOf("footer"));
  });

  test("filling the slot moves NOTHING else — no band is disturbed", () => {
    const before = reserved();
    const after = upsertDescriptionBlock(before, desc());
    const ys = (d: EmailDoc) => d.blocks.map((b) => (b as { layout?: { y: number } }).layout?.y);
    expect(ys(after)).toEqual(ys(before));
  });

  test("a REFRESH refills the same slot — never a second description, never a drift", () => {
    const once = upsertDescriptionBlock(reserved(), desc());
    const twice = upsertDescriptionBlock(once, desc());
    expect(twice.blocks.filter(isDescriptionBlock)).toHaveLength(1);
    expect(slotOf(twice)!.layout?.y).toBe(9);
  });

  test("an unfilled reserved slot is REMOVED — a blank panel is a hole, not a slot", () => {
    expect(dropEmptyDescriptionSlot(reserved()).blocks.filter(isDescriptionBlock)).toHaveLength(0);
  });

  test("a FILLED slot survives the drop pass", () => {
    const out = dropEmptyDescriptionSlot(upsertDescriptionBlock(reserved(), desc()));
    expect(out.blocks.filter(isDescriptionBlock)).toHaveLength(1);
  });

  test("emptyDescriptionSlot is empty, marked, and mints a unique id", () => {
    const a = emptyDescriptionSlot();
    const b = emptyDescriptionSlot();
    expect(a.props.body).toBe("");
    expect(isDescriptionBlock(a)).toBe(true);
    expect(a.id).not.toBe(b.id);
  });
});
