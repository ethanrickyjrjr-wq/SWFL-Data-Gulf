// lib/deliverable/recipes/new-listing.test.ts
//
// R1 · NEW LISTING — the acceptance oracle for THE REAL PATH.
//
// Postmortem 07/20/2026: this recipe is the "reference implementation" (new-listing.ts
// header) and had ZERO test coverage. The operator typed a NATURAL prompt ("New listing
// announcement for <address>...") into the Email Lab and got a photo-less, wrong-ZIP,
// generic ZIP-stats email — no test caught it because every sibling recipe's "real path"
// test (open-house.test.ts, price-reduced.test.ts, …) drives the prompt through the
// RECIPE'S OWN SEED TEMPLATE ("...at [[address]] — key specs..."), which already matched
// the old `SUBJECT_AT` regex. A user typing their own words never does.
//
// This suite drives `authorDoc` with prompts phrased the way a human actually types them,
// not the seed template — the exact gap the operator's live test fell into.
//
// Fully offline: the Anthropic client, the subject resolver and the photo mirror are all
// stubbed. Zero network calls, zero cost to run.

import { test, expect, mock, afterAll, describe } from "bun:test";
import * as realAnthropic from "@/refinery/agents/anthropic.mts";
import * as realResolve from "@/lib/listings/resolve-subject";
import * as realMirror from "@/lib/media/hero-photo";
import { SHORE_DR_FACTS } from "./__fixtures__/shore-dr";
import type { EmailDoc } from "@/lib/email/doc/types";

const NARRATIVE = "A three-bedroom home on a quarter-acre lot, newly listed.";

// mock.module is process-global and mock.restore() does NOT undo it — snapshot and
// restore, the repo's established pattern (open-house.test.ts).
const ORIG = {
  "@/refinery/agents/anthropic.mts": { ...realAnthropic },
  "@/lib/listings/resolve-subject": { ...realResolve },
  "@/lib/media/hero-photo": { ...realMirror },
};
afterAll(() => {
  for (const [path, orig] of Object.entries(ORIG)) mock.module(path, () => orig);
});

// The narrator: deterministic prose, zero tokens spent.
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...realAnthropic,
  getAnthropic: () => ({
    messages: { create: async () => ({ content: [{ type: "text", text: NARRATIVE }] }) },
  }),
}));
// The subject resolver: the fixture record — the SAME real, committed listing every
// other recipe suite drives (326 Shore Dr). No geocode, no vendor call.
mock.module("@/lib/listings/resolve-subject", () => ({
  ...realResolve,
  resolveSubjectListing: async () => structuredClone(SHORE_DR_FACTS),
}));
// The photo mirror: identity. No Supabase storage round-trip.
mock.module("@/lib/media/hero-photo", () => ({
  ...realMirror,
  mirrorHeroPhoto: async (url: string) => url,
}));

const { authorDoc } = await import("@/lib/email/build-doc");
const { renderEmailDocHtml } = await import("@/lib/email/render-email-doc");
const { defaultDoc } = await import("@/lib/email/doc/default-docs");

function blockOf(doc: EmailDoc, type: string) {
  return doc.blocks.find((b) => b.type === type);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("THE REAL PATH — a NATURALLY TYPED prompt, not the seed template", () => {
  // The exact shape of the operator's live repro: "for <address>", no "at ... —".
  // Recipe dispatch matches on the prompt's own wording (`recipeFromPrompt`) — no
  // `recipeKey` handed in — because that is what the Lab's free-text build box does.
  const TYPED_PROMPT =
    "New listing announcement for 326 Shore Dr, Fort Myers, FL 33905 — 3 bed, 3.5 bath, just came to market.";

  test("the address is extracted and resolved from natural phrasing alone", async () => {
    const res = await authorDoc({ prompt: TYPED_PROMPT, rawDoc: defaultDoc() });
    expect(res.payload.applied).toBe(true);
    expect(res.payload.listing).toEqual({
      subject: SHORE_DR_FACTS.address,
      resolved: true,
    });
  });

  test("the built doc carries the REAL photo, price, and specs — not a generic ZIP card", async () => {
    const res = await authorDoc({ prompt: TYPED_PROMPT, rawDoc: defaultDoc() });
    const doc = res.payload.doc as EmailDoc;

    const img = blockOf(doc, "image");
    expect(img?.type === "image" && img.props.url).toBe(SHORE_DR_FACTS.photos[0]);

    const hero = doc.blocks.filter((b) => b.type === "hero").at(-1);
    expect(hero?.type === "hero" && hero.props.value).toBe(SHORE_DR_FACTS.price);

    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("2,847"); // sqft, comma-formatted
    expect(html).toContain(SHORE_DR_FACTS.zip);
  });

  test("NO stray area-wide chart — this email is about the house", async () => {
    const res = await authorDoc({ prompt: TYPED_PROMPT, rawDoc: defaultDoc() });
    const doc = res.payload.doc as EmailDoc;
    expect(doc.blocks.some((b) => b.type === "image" && b.props.kind === "chart")).toBe(false);
  });

  test("the WRONG ZIP never leaks in — a house number in the prompt is not the ZIP", async () => {
    // The postmortem bug: an explicit ZIP elsewhere in a multi-clause prompt could be
    // mis-picked as the house number, or vice versa. Assert the resolved facts carry
    // exactly the fixture's own ZIP, never a bare digit lifted from the street number.
    const res = await authorDoc({ prompt: TYPED_PROMPT, rawDoc: defaultDoc() });
    const doc = res.payload.doc as EmailDoc;
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("326—"); // no house number mistaken for a ZIP token
    expect(html).toContain("33905");
  });

  test("the paragraph is not cut off mid-sentence", async () => {
    const res = await authorDoc({ prompt: TYPED_PROMPT, rawDoc: defaultDoc() });
    const doc = res.payload.doc as EmailDoc;
    const text = blockOf(doc, "text");
    expect(text?.type === "text" && text.props.body).toBe(NARRATIVE);
  });

  test("the seed template phrasing ('...at [[address]] —') still works — no regression", async () => {
    const res = await authorDoc({
      prompt:
        "Build a new-listing announcement email for my listing at 326 Shore Dr, Fort Myers, FL 33905 — key specs, price per square foot, and one honest line about the home.",
      rawDoc: defaultDoc(),
    });
    expect(res.payload.listing).toEqual({
      subject: SHORE_DR_FACTS.address,
      resolved: true,
    });
  });
});
