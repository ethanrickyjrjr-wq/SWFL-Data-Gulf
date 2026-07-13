// lib/deliverable/recipes/open-house.test.ts
//
// R6 · OPEN HOUSE — the acceptance oracle for THE OPEN-SLOT CONTRACT.
//
// It wears the CAMPAIGN CHROME (lib/email/lifecycle-chrome.ts), same as its six siblings:
//   header · RIBBON("Open House") · photo · hero(address over price) · spec strip
//          · narrative · agent card · CTA(RSVP) · footer
// The shape is pinned by campaign-coherence.test.ts. What THIS suite pins is the sourcing —
// and the fact that the two cells this email is ABOUT can never be sourced at all.
//
// The date and the time of an open house are in NO vendor feed (all 18 SteadyAPI
// endpoints checked 07/13/2026). They are a lane-2/lane-4 fact: the agent supplies
// them. So this recipe is the cleanest test in the fan-out of the one rule that keeps
// "never invent" from becoming "never build":
//
//   an unsourceable fact is an INVITATION on the canvas (an editable cell whose LABEL
//   is the instruction) and DOES NOT EXIST in the sent email.
//
// Never a zero. Never a placeholder date. Never a naked label to a recipient.
//
// Fully offline: the Anthropic client, the subject resolver and the photo mirror are
// all stubbed, so this suite makes ZERO network calls and costs nothing to run.

import { test, expect, mock, afterAll, describe } from "bun:test";
import * as realAnthropic from "@/refinery/agents/anthropic.mts";
import * as realResolve from "@/lib/listings/resolve-subject";
import * as realMirror from "@/lib/media/hero-photo";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

/** The known-good fixture — the live 07/13/2026 resolve of the acceptance subject.
 *  Every value below is the vendor record's own (playbook Part 5). */
const SHORE_DR: ListingFacts = {
  address: "326 Shore Dr, Fort Myers, FL 33905",
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  price: "$595,000",
  beds: "3",
  baths: "3.5",
  sqft: "2847",
  lotSize: "0.26 ac",
  propertyType: "Residential",
  photos: ["https://example.invalid/photos/326-shore-dr.jpg"],
  sourceUrl: "https://www.swfldatagulf.com",
};

const NARRATIVE = "A three-bedroom home on a quarter-acre lot, open for you to walk through.";

// mock.module is process-global and mock.restore() does NOT undo it — snapshot and
// restore, the repo's established pattern (lib/email/build-doc-listing.test.ts).
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
// The subject resolver: the fixture record. No geocode, no vendor call.
mock.module("@/lib/listings/resolve-subject", () => ({
  ...realResolve,
  resolveSubjectListing: async () => structuredClone(SHORE_DR),
}));
// The photo mirror: identity. No Supabase storage round-trip.
mock.module("@/lib/media/hero-photo", () => ({
  ...realMirror,
  mirrorHeroPhoto: async (url: string) => url,
}));

const { buildOpenHouse } = await import("./open-house");
const { RECIPE_BUILDERS } = await import("./index");
const { authorDoc } = await import("@/lib/email/build-doc");
const { renderEmailDocHtml } = await import("@/lib/email/render-email-doc");
const { RECIPES } = await import("@/lib/deliverable/recipes");
const { SEED_DOCS, defaultDoc } = await import("@/lib/email/doc/default-docs");

const RECIPE = RECIPES["open-house"];
const FILLED_PROMPT = RECIPE.prompt.replace(/\[\[[^\]]+\]\]/, "326 Shore Dr, Fort Myers, FL 33905");

function statsRows(doc: EmailDoc): StatItem[][] {
  return doc.blocks.filter((b) => b.type === "stats").map((b) => b.props.stats);
}
function cellsOf(doc: EmailDoc): StatItem[] {
  return statsRows(doc).flat();
}
function labelled(doc: EmailDoc, label: string): StatItem | undefined {
  return cellsOf(doc).find((c) => c.label === label);
}
function blockOf(doc: EmailDoc, type: string) {
  return doc.blocks.find((b) => b.type === type);
}

async function build(facts: ListingFacts | null, current?: EmailDoc): Promise<EmailDoc> {
  const doc = await buildOpenHouse({
    recipe: RECIPE,
    prompt: FILLED_PROMPT,
    currentDoc: current ?? defaultDoc(),
    facts,
    resolved: Boolean(facts?.price),
  });
  expect(doc).not.toBeNull();
  return doc!;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("THE OPEN-SLOT CONTRACT — the date and time are never invented", () => {
  test("the moment is TWO OPEN SLOTS on the canvas, and the label is the instruction", async () => {
    const doc = await build(SHORE_DR);

    const date = labelled(doc, "Open House Date");
    const time = labelled(doc, "Open House Time");
    // The cells EXIST — the canvas renders each as an editable "+ Add" affordance
    // (StatsBlock: empty + scope → the dashed open-slot outline).
    expect(date).toBeDefined();
    expect(time).toBeDefined();
    // And they are EMPTY. Never a zero, never "TBD", never a placeholder date.
    expect(date!.value).toBe("");
    expect(time!.value).toBe("");
  });

  test("the SENT email contains no date, no time, and no naked label", async () => {
    const html = await renderEmailDocHtml(await build(SHORE_DR));

    // The instruction is a canvas affordance. It must not reach a recipient.
    expect(html).not.toContain("Open House Date");
    expect(html).not.toContain("Open House Time");
    // And nothing invented a moment in its place.
    expect(html).not.toMatch(/\b(Saturday|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday)\b/i);
    expect(html).not.toMatch(/\bTBD\b|\bTBA\b/i);
    expect(html).not.toMatch(/\b\d{1,2}\s*[-–—]\s*\d{1,2}\s*(am|pm)\b/i);
    // The classic failure mode: an unsourced cell rendered as a zero.
    expect(html).not.toMatch(/>\s*0\s*</);
  });

  test("once the agent fills the moment, it ships — and it LEADS the strip", async () => {
    const doc = await build(SHORE_DR);
    // Simulate the canvas edit: the agent types into the open cells. A real edit patches
    // `stats.<i>.value` — it does NOT replace props — so variant and emphasis survive.
    const fill: Record<string, string> = {
      "Open House Date": "Sat, Jul 19",
      "Open House Time": "1–4 PM",
    };
    const filled: EmailDoc = {
      ...doc,
      blocks: doc.blocks.map((b) =>
        b.type === "stats"
          ? {
              ...b,
              props: {
                ...b.props,
                stats: b.props.stats.map((s) => ({ ...s, value: fill[s.label] ?? s.value })),
              },
            }
          : b,
      ),
    };
    const html = await renderEmailDocHtml(filled);
    expect(html).toContain("Sat, Jul 19");
    expect(html).toContain("1–4 PM");
    // The label now reads as a CAPTION under the value — which is why it was never
    // written as a canvas-only imperative ("Add the date here").
    expect(html).toContain("Open House Date");

    // UP FRONT — as far up as the open-slot contract allows. The campaign chrome puts the
    // ADDRESS over the PRICE in the hero (that is the shape all seven emails share, and
    // HeroBlock ships any label it carries, so an instruction can never live there). The
    // moment therefore leads the very next element: the first two cells of the spec strip,
    // in the accent colour, ahead of the specs and well ahead of the paragraph.
    expect(html.indexOf("Sat, Jul 19")).toBeLessThan(html.indexOf("2,847"));
    expect(html.indexOf("1–4 PM")).toBeLessThan(html.indexOf(NARRATIVE));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("the cells — each renders only if sourced", () => {
  test("the specs are the resolved record's own values", async () => {
    const doc = await build(SHORE_DR);
    expect(labelled(doc, "Beds")).toEqual({ value: "3", label: "Beds" });
    expect(labelled(doc, "Baths")).toEqual({ value: "3.5", label: "Baths" });
    expect(labelled(doc, "Sq Ft")).toEqual({ value: "2,847", label: "Sq Ft" });
  });

  test("the strip does NOT argue the price — no $/sq ft, no lot, no type", async () => {
    // An invitation is not a price announcement. Those three cells are the argument
    // New Listing and Price Improved make; carrying them here turns a "come see it"
    // into a valuation, which is also exactly the drift the narrator is forbidden.
    const doc = await build(SHORE_DR);
    expect(labelled(doc, "$/Sq Ft")).toBeUndefined();
    expect(labelled(doc, "Lot")).toBeUndefined();
    expect(labelled(doc, "Type")).toBeUndefined();
    // …and the strip carries no derived cell, so it needs no provenance footnote.
    const strip = doc.blocks.find((b) => b.type === "stats");
    expect(strip?.type === "stats" && strip.props.footnote).toBeFalsy();
  });

  test("ONE spec strip — the campaign's hairline row, never a wall of stat grids", async () => {
    const doc = await build(SHORE_DR);
    const rows = doc.blocks.filter((b) => b.type === "stats");
    expect(rows).toHaveLength(1);
    if (rows[0].type !== "stats") throw new Error("no strip");
    expect(rows[0].props.variant).toBe("strip");
    // The moment LEADS it, and it is the cell the eye should land on.
    expect(rows[0].props.stats.map((s) => s.label)).toEqual([
      "Open House Date",
      "Open House Time",
      "Beds",
      "Baths",
      "Sq Ft",
    ]);
    expect(rows[0].props.stats[0].emphasis).toBe("primary");
    expect(rows[0].props.stats[1].emphasis).toBe("primary");
  });

  test("the campaign chrome: RIBBON('Open House') then the ADDRESS over the PRICE", async () => {
    const doc = await build(SHORE_DR);
    const heroes = doc.blocks.filter((b) => b.type === "hero");
    expect(heroes).toHaveLength(2);
    if (heroes[0].type !== "hero" || heroes[1].type !== "hero") throw new Error("no heroes");

    // 1. The RIBBON — the one element identical in SHAPE and different in WORD across all
    //    seven emails. It is what tells a reader which email in the campaign this is.
    expect(heroes[0].props.ribbon).toBe(true);
    expect(heroes[0].props.kicker).toBe("Open House");

    // 2. The SUBJECT hero — centred, address over price. Same as every sibling email.
    expect(heroes[1].props.ribbon).toBeFalsy();
    expect(heroes[1].props.align).toBe("center");
    expect(heroes[1].props.order).toBe("label-first");
    expect(heroes[1].props.value).toBe("$595,000");
    expect(heroes[1].props.label).toBe("326 Shore Dr, Fort Myers, FL 33905");

    // HeroBlock has no emailRender gate: any label it carries SHIPS. So the seed's old
    // instruction label must never survive into a built doc.
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("Date, time, and address");
  });

  test("the photo is the record's own, and links to the citation", async () => {
    const doc = await build(SHORE_DR);
    const img = blockOf(doc, "image");
    if (img?.type !== "image") throw new Error("no image");
    expect(img.props.url).toBe(SHORE_DR.photos[0]);
    expect(img.props.kind).toBe("photo");
    expect(img.props.alt).toBe("326 Shore Dr, Fort Myers, FL 33905");
    expect(img.props.linkUrl).toBe("https://www.swfldatagulf.com");
  });

  test("a bed count with no bath count leaves the BATH cell open — never a lying label", async () => {
    // This recipe used to jam beds and baths into ONE cell, so a missing bath count made
    // "3" sit under a "Beds / Baths" label — a lie told by a label, the same class of
    // failure as a naked one. The campaign strip gives each its own cell, so the gap can
    // simply BE a gap: an open slot on the canvas, absent from the email.
    const doc = await build({ ...SHORE_DR, baths: undefined });
    expect(labelled(doc, "Beds")).toEqual({ value: "3", label: "Beds" });
    expect(labelled(doc, "Baths")).toEqual({ value: "", label: "Baths" });
    expect(labelled(doc, "Beds / Baths")).toBeUndefined();

    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("Beds");
    expect(html).not.toContain("Baths"); // the unsourced cell does not reach a recipient
    expect(html).not.toMatch(/>\s*0\s*</);
  });

  test("an UNRESOLVED subject still lands the branded grid — as open slots", async () => {
    // Never refuse a build (RULE 0.7). The vendor missed; the agent fills it in.
    const doc = await build({
      address: "326 Shore Dr, Fort Myers, FL 33905",
      photos: [],
      sourceUrl: "https://www.swfldatagulf.com",
    });
    // Every spec cell is an open slot on the canvas…
    expect(cellsOf(doc).every((c) => c.value === "")).toBe(true);
    // …and the photo is a dropzone, not a gray box that ships.
    const img = blockOf(doc, "image");
    if (img?.type !== "image") throw new Error("no image");
    expect(img.props.url).toBe("");

    const html = await renderEmailDocHtml(doc);
    // Nothing unsourced reaches the recipient: no stat rows, no photo, no zeros.
    expect(html).not.toContain("Asking Price");
    expect(html).not.toContain("Beds / Baths");
    expect(html).not.toContain("Open House Date");
    // The photo slot is a canvas dropzone. The gray "Image" box used to ship — it
    // must not. (The only <img> left is the brand logo in the sticky header.)
    expect(html).not.toContain('alt="326 Shore Dr, Fort Myers, FL 33905"');
    expect(html).not.toContain("Add the photo");
    // The address the user typed is real — it still leads the invitation.
    expect(html).toContain("326 Shore Dr");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("chart, prose, and framing", () => {
  test("NO CHART — the deliverable is about a house and a moment", async () => {
    const doc = await build(SHORE_DR);
    expect(doc.blocks.some((b) => b.type === "image" && b.props.kind === "chart")).toBe(false);
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("chart");
  });

  test("the seed's canvas hint NEVER ships — the slot is empty, then authored", async () => {
    // THE LANDMINE, now fixed AT THE SOURCE: fillNarrative skips a text block that
    // already has content, and this seed used to PREFILL its body with a coaching note
    // ("…get someone off the couch…"). TextBlock ships any non-empty body, so a user who
    // picked the Open House card from the gallery and hit send EMAILED THAT SENTENCE to
    // real people. The builder cleared it; the seed card itself still shipped it.
    //
    // The seed's body is now "" per THE SLOT RULE. This test used to assert the hint was
    // PRESENT — pinning the defect in place. It now asserts the opposite: an instruction
    // to the author is never copy for the reader, at either layer.
    const seed = SEED_DOCS.find((s) => s.id === "open-house")!.build();
    const seedText = seed.blocks.find((b) => b.type === "text");
    expect(seedText?.type === "text" && seedText.props.body).toBe("");

    const doc = await build(SHORE_DR);
    const text = blockOf(doc, "text");
    expect(text?.type === "text" && text.props.body).toBe(NARRATIVE);
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("off the couch");
    expect(html).toContain(NARRATIVE);
  });

  test("a narrator that returns nothing leaves an OPEN SLOT, not the seed's hint", async () => {
    mock.module("@/refinery/agents/anthropic.mts", () => ({
      ...realAnthropic,
      getAnthropic: () => ({
        messages: {
          create: async () => {
            throw new Error("no key");
          },
        },
      }),
    }));
    const { buildOpenHouse: rebuilt } = await import("./open-house");
    const doc = await rebuilt({
      recipe: RECIPE,
      prompt: FILLED_PROMPT,
      currentDoc: defaultDoc(),
      facts: structuredClone(SHORE_DR),
      resolved: true,
    });
    const text = doc!.blocks.find((b) => b.type === "text");
    expect(text?.type === "text" && text.props.body).toBe("");
    const html = await renderEmailDocHtml(doc!);
    expect(html).not.toContain("off the couch");

    // Restore the narrator for any later test.
    mock.module("@/refinery/agents/anthropic.mts", () => ({
      ...realAnthropic,
      getAnthropic: () => ({
        messages: { create: async () => ({ content: [{ type: "text", text: NARRATIVE }] }) },
      }),
    }));
  });

  test("ONE CTA, and it is an RSVP", async () => {
    const doc = await build(SHORE_DR);
    const buttons = doc.blocks.filter((b) => b.type === "button");
    expect(buttons).toHaveLength(1);
    if (buttons[0].type !== "button") throw new Error("no button");
    expect(buttons[0].props.label).toBe("RSVP for the Open House");
    expect(buttons[0].props.url).toBe("https://www.swfldatagulf.com");
    // The seed still says "Get Directions" — the KEY is the authority on framing.
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("Get Directions");
    expect(html).toContain("RSVP for the Open House");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("THE REAL PATH — authorDoc, from the prompt alone, with NO scope", () => {
  // The Lab door. It passes NOTHING: the address lives only in the prompt text, and
  // gating the property lane on scope.address is what sent 15 of 17 recipes to the
  // photo-less grab-bag. If this only works with scope.address handed in, it is not fixed.
  test("the Lab door (no scope) builds the invitation from the prompt", async () => {
    // The dispatcher looks the builder up in RECIPE_BUILDERS. Registering it is the
    // operator's one-line shared-file change; the test proves the wiring end to end.
    (RECIPE_BUILDERS as Record<string, unknown>)["open-house"] = buildOpenHouse;

    const res = await authorDoc({
      prompt: FILLED_PROMPT,
      rawDoc: defaultDoc(),
      recipeKey: "open-house",
      // NO scope. NO address field. This is the door that was broken.
    });

    expect(res.payload.applied).toBe(true);
    const doc = res.payload.doc as EmailDoc;
    // The subject resolved from the PROMPT, and the house is on the page.
    expect(res.payload.listing).toEqual({
      subject: "326 Shore Dr, Fort Myers, FL 33905",
      resolved: true,
    });
    // The price is the HERO number (the campaign shape: address over price); the strip
    // carries the specs, and the moment stays open for the agent.
    const hero = doc.blocks.filter((b) => b.type === "hero")[1];
    expect(hero?.type === "hero" && hero.props.value).toBe("$595,000");
    expect(labelled(doc, "Sq Ft")?.value).toBe("2,847");
    expect(labelled(doc, "Open House Date")?.value).toBe("");

    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("326 Shore Dr");
    expect(html).toContain("$595,000");
    expect(html).toContain("RSVP for the Open House");
    expect(html).not.toContain("Open House Date");
  });
});
