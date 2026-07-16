// lib/deliverable/recipes/price-reduced.test.ts
//
// R7 · PRICE IMPROVED — the acceptance oracle for THE ARITHMETIC OF A PRICE CUT,
// now built on THE ONE CAMPAIGN CHROME (lib/email/lifecycle-chrome.ts).
//
// This recipe's failure mode is not an ugly email. It is a LIE ABOUT SOMEONE'S HOUSE.
//
// The vendor's `price.reduced_amount` is the SIZE OF THE CUT, not the old price
// (probed live 07/13/2026: 326 Shore Dr → price $595,000, reduced_amount 104975).
// Read it as the old price and the email announces that a $595,000 home was "reduced"
// to $104,975 — or, flipped the other way, invents a previous price out of thin air.
// The first test below is the guard, and it asserts BOTH the right answer and the
// wrong one, by name.
//
// The second failure mode is the NARRATOR. open-house.ts found (live) that Sonnet,
// handed the cut, wrote itself a market rationale every time. We cannot take the cut
// away from it — the cut is this recipe's entire hat — so the framing forbids the
// inventions by name, and the tests below assert no coaching note ever survives.
//
// The third — new, 07/13/2026 — is DRIFT. This email used to own its own grid (hero
// LEFT, a 2-cell price block beside it, TWO stacked stat rows, and no agent card at
// all), and so did its six siblings. Seven emails in one campaign, seven layouts. The
// chrome tests below pin it back onto the shared spine; campaign-coherence.test.ts is
// the cross-recipe oracle.
//
// Fully offline: the Anthropic client, the photo mirror, and the comp-helper
// (compsForAddress, Task 10's wiring) are all stubbed, so this suite makes ZERO
// network calls and costs nothing to run. The comp-helper default returns no comps,
// so every fixture here reserves-then-drops its chart slot; wiring-specific chart
// assertions (comps present, coherence, image fill) belong to a later suite.

import { test, expect, mock, afterAll, describe } from "bun:test";
import * as realAnthropic from "@/refinery/agents/anthropic.mts";
import * as realMirror from "@/lib/media/hero-photo";
import * as realCompHelper from "@/lib/assistant/comp-helper";
import * as realSpecToPng from "@/lib/email/spec-to-png";
import { RECIPES } from "@/lib/deliverable/recipes";
import { EmailDocSchema } from "@/lib/email/doc/schema";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { RenderComp } from "@/lib/assistant/comp-helper";

/** The known-good fixture — the LIVE 07/13/2026 resolve of the acceptance subject
 *  (326 Shore Dr, Fort Myers, FL 33905). Every value is the vendor record's own.
 *  Note `priceReduction` is ALREADY the formatted string the normalizer produced —
 *  the builder must not convert it a second time. */
const SHORE_DR: ListingFacts = {
  address: "326 Shore Dr, Fort Myers, FL, 33905", // the vendor's own stray comma
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  price: "$595,000",
  beds: "3",
  baths: "3.5",
  sqft: "2847",
  lotSize: "0.26 ac", // ACRES already — the normalizer converted from lot_sqft
  propertyType: "Residential",
  isNewConstruction: true,
  isPriceReduced: true,
  priceReduction: "$104,975", // THE SIZE OF THE CUT
  photos: ["https://example.invalid/photos/326-shore-dr.jpg"],
  sourceUrl: "https://www.swfldatagulf.com",
};

const NARRATIVE = "A three-bedroom home on a quarter-acre lot.";

// mock.module is process-global and mock.restore() does NOT undo it — snapshot and
// restore, the repo's established pattern (lib/email/build-doc-listing.test.ts).
const ORIG = {
  "@/refinery/agents/anthropic.mts": { ...realAnthropic },
  "@/lib/media/hero-photo": { ...realMirror },
  "@/lib/assistant/comp-helper": { ...realCompHelper },
  "@/lib/email/spec-to-png": { ...realSpecToPng },
};
afterAll(() => {
  for (const [path, orig] of Object.entries(ORIG)) mock.module(path, () => orig);
});

/** The narrator: deterministic prose, zero tokens spent. Captures the system prompt so
 *  we can assert WHAT THE MODEL WAS FORBIDDEN — the framing is this recipe's real work. */
let lastSystem = "";
mock.module("@/refinery/agents/anthropic.mts", () => ({
  ...realAnthropic,
  getAnthropic: () => ({
    messages: {
      create: async (req: { system?: string }) => {
        lastSystem = req.system ?? "";
        return { content: [{ type: "text", text: NARRATIVE }] };
      },
    },
  }),
}));
mock.module("@/lib/media/hero-photo", () => ({
  ...realMirror,
  mirrorHeroPhoto: async (u: string) => u,
}));
// The wiring under test (Task 10) makes buildPriceReduced call compsForAddress. Every
// test in this file that builds SHORE_DR (isPriceReduced: true) now reserves a chart
// slot, so this default keeps the WHOLE suite offline: empty comps -> priceVsAreaDotSpec
// returns null (fewer than 2 comparable homes) -> the slot is dropped, never filled.
//
// Task 11 (below, "THE BUILD-LEVEL WIRING") needs exactly ONE test to see real comps.
// mock.module is process-global and last-registration-wins, so a SECOND mock.module call
// for this same specifier with a fixed 2-comp return would flip every pre-existing
// SHORE_DR fixture above onto the fill path and break their "no chart" assertions. A
// mutable binding instead lets that one test override the return value in place, while
// every other test in the file — before and after it — keeps seeing this empty default.
let mockComps: RenderComp[] = [];
mock.module("@/lib/assistant/comp-helper", () => ({
  ...realCompHelper,
  compsForAddress: async () => ({ comps: mockComps, asOf: "07/16/2026", needs: [] }),
}));
// chartSpecToEmailImage is only ever reached once priceVsAreaDotSpec has returned a real
// spec, which needs >=2 comparable comps (MIN_COMPS_FOR_CHART) — true for exactly the one
// Task 11 happy-path test below and no other fixture in this file, so this can stay a
// single static mock with no restore dance of its own.
mock.module("@/lib/email/spec-to-png", () => ({
  ...realSpecToPng,
  chartSpecToEmailImage: async () => ({
    url: "https://cdn.example/chart.png",
    alt: "The new price vs. nearby comparable homes",
    caption: "",
  }),
}));

const { buildPriceReduced, previousPrice, priceCutKicker, priceVsAreaDotSpec } =
  await import("./price-reduced");
const { renderEmailDocHtml } = await import("@/lib/email/render-email-doc");
const { defaultDoc } = await import("@/lib/email/doc/default-docs");

function ctx(facts: ListingFacts | null, currentDoc?: EmailDoc): RecipeBuildContext {
  return {
    recipe: RECIPES["price-reduced"],
    prompt:
      "Build a price-improved email for my listing at 326 Shore Dr, Fort Myers, FL 33905 — " +
      "lead with the price cut, the home's key specs, and one honest line on what the new price means.",
    currentDoc: currentDoc ?? defaultDoc(),
    facts,
    resolved: Boolean(facts),
  };
}

const statsRows = (doc: EmailDoc): StatItem[][] =>
  doc.blocks.filter((b) => b.type === "stats").map((b) => (b.props as { stats: StatItem[] }).stats);
const allCells = (doc: EmailDoc): StatItem[] => statsRows(doc).flat();
const cellNamed = (doc: EmailDoc, label: string): StatItem | undefined =>
  allCells(doc).find((c) => c.label === label);

/** The chrome lays down TWO hero blocks: the RIBBON band (kicker only) and the SUBJECT
 *  hero (address over price). This is the subject one. */
const heroOf = (doc: EmailDoc) =>
  doc.blocks.find((b) => b.type === "hero" && !b.props.ribbon)?.props as
    { kicker?: string; value?: string; label?: string; align?: string; order?: string } | undefined;
const ribbonOf = (doc: EmailDoc) =>
  doc.blocks.find((b) => b.type === "hero" && b.props.ribbon)?.props as
    { kicker?: string } | undefined;
const spine = (doc: EmailDoc): string[] =>
  [...doc.blocks]
    .sort((a, b) => (a.layout?.y ?? 0) - (b.layout?.y ?? 0))
    .map((b) => {
      if (b.type === "hero") return b.props.ribbon ? "hero:ribbon" : "hero:subject";
      if (b.type === "stats") return b.props.variant === "strip" ? "stats:strip" : "stats:grid";
      if (b.type === "image") return `image:${String(b.props.kind ?? "?")}`;
      return b.type;
    });

// ── THE CAMPAIGN CHROME — this email is a SIBLING, not a one-off ────────────────

describe("it wears the one campaign chrome", () => {
  test("the spine is the campaign's, in order", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    // header · RIBBON · photo · hero(address over price) · spec strip · narrative
    //        · agent card · CTA · footer. The recipe owns the WORDS, never the SHAPE.
    expect(spine(doc)).toEqual([
      "header",
      "hero:ribbon",
      "image:photo",
      "hero:subject",
      "stats:strip",
      "text",
      "agent-card",
      "button",
      "footer",
    ]);
  });

  test("the ribbon word is what says WHICH email this is", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    expect(ribbonOf(doc)!.kicker).toBe("Price Improved");
  });

  test("ONE hairline strip — never the two stacked stat walls this file used to emit", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    expect(statsRows(doc)).toHaveLength(1);
    expect(spine(doc).filter((s) => s === "stats:grid")).toHaveLength(0);
  });

  test("the agent SIGNS it — this recipe used to ship no agent card at all", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    expect(doc.blocks.some((b) => b.type === "agent-card")).toBe(true);
  });

  test("the hero is CENTRED, address over price — like every other email in the campaign", async () => {
    const hero = heroOf((await buildPriceReduced(ctx(SHORE_DR)))!)!;
    expect(hero.align).toBe("center");
    expect(hero.order).toBe("label-first");
  });

  test("the CTA asks for the NEXT ACTION, never 'See the New Price'", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const buttons = doc.blocks.filter((b) => b.type === "button");
    expect(buttons).toHaveLength(1);
    // Operator, 07/13/2026: "why would the button be SEE THE NEW PRICE when we already
    // show the price". The hero IS the new price. A button pointing at what the reader
    // is already looking at asks them to do nothing.
    expect((buttons[0]!.props as { label?: string }).label).toBe("Schedule a Showing");
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("See the New Price");
  });

  test("the BRAND is sticky — a user's colours are never authored over", async () => {
    const branded = defaultDoc();
    branded.globalStyle = { ...branded.globalStyle, accentColor: "#123456" };
    const doc = (await buildPriceReduced(ctx(SHORE_DR, branded)))!;
    expect(doc.globalStyle.accentColor).toBe("#123456");
  });

  test("THE BUILT DOC PARSES — an invalid doc silently becomes the GENERIC AUTHOR", async () => {
    // THE BUG THIS TEST EXISTS FOR (caught 07/13/2026, and ONLY by building through the
    // real authorDoc path — this suite and campaign-coherence.test.ts were both GREEN):
    //
    // The strip carried SEVEN cells. `EmailDocSchema` caps a stats row at SIX. So the
    // builder returned a doc that FAILED VALIDATION, build-doc fell through to the
    // generic author, and the email the user actually got was written by a model with no
    // framing at all: "one of the sharpest values on the waterfront today", "Fort Myers
    // values have pulled back meaningfully from their 2023 peak" — a market analysis, a
    // comparison, and a value judgment, which are the three things this recipe's entire
    // framing exists to forbid. Every no-invention guard in this file was bypassed by a
    // CELL COUNT.
    //
    // A recipe that fails to parse does not fail loudly. It fails as a DIFFERENT EMAIL.
    for (const f of [SHORE_DR, WITH_REMARKS, { ...SHORE_DR, isPriceReduced: false }]) {
      const doc = (await buildPriceReduced(ctx(f)))!;
      const parsed = EmailDocSchema.safeParse(doc);
      expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true);
      for (const row of statsRows(doc)) expect(row.length).toBeLessThanOrEqual(6);
    }
  });
});

// ── THE ARITHMETIC — the lie-guard ──────────────────────────────────────────────

describe("the vendor's reduced_amount is the SIZE OF THE CUT, not the old price", () => {
  test("previous price = current + cut", () => {
    // $595,000 currently asked, cut by $104,975 → it used to be $699,975.
    expect(previousPrice(SHORE_DR)).toBe("$699,975");
  });

  test("it is NOT the reduced_amount itself (the lie this recipe exists to not tell)", () => {
    // Reading reduced_amount as the old price says a $595,000 home was cut FROM
    // $104,975 — a "reduction" to a HIGHER number. Absurd, and it would ship.
    expect(previousPrice(SHORE_DR)).not.toBe("$104,975");
    // And the previous price must always exceed what is being asked today.
    const prev = Number(previousPrice(SHORE_DR)!.replace(/[^\d]/g, ""));
    expect(prev).toBeGreaterThan(595_000);
  });

  test("the already-formatted priceReduction is never converted twice", () => {
    // `priceReduction` arrives as "$104,975" (resolve-subject ran usd() on it). A
    // second pass through a formatter, or a units guess, would corrupt the number.
    expect(priceCutKicker(SHORE_DR)).toBe("Price cut $104,975");
  });

  test("no cut, or a missing operand → NO previous price (an open slot, never a guess)", () => {
    expect(previousPrice({ ...SHORE_DR, isPriceReduced: false })).toBeUndefined();
    expect(previousPrice({ ...SHORE_DR, priceReduction: undefined })).toBeUndefined();
    expect(previousPrice({ ...SHORE_DR, price: undefined })).toBeUndefined();
    // A back-solved anchor price would be an INVENTED number — the one hard block.
    expect(priceCutKicker({ ...SHORE_DR, isPriceReduced: false })).toBe("");
  });
});

// ── THE OPERATOR'S TREATMENT ────────────────────────────────────────────────────

describe("the cut renders ABOVE the price, smaller, in a different color", () => {
  test("the kicker carries the cut and the hero value carries the new price", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const hero = heroOf(doc)!;
    // The chrome's hero renders a non-ribbon kicker at 11px in globalStyle.accentColor,
    // above the address (27px) and the price (48px accent). That IS the ruling.
    expect(hero.kicker).toBe("Price cut $104,975");
    expect(hero.value).toBe("$595,000");
  });

  test("the address is re-punctuated from the record's own fields, not the stray-comma tail", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    // The vendor hands back "…, Fort Myers, FL, 33905" — a comma before the ZIP.
    expect(heroOf(doc)!.label).toBe("326 Shore Dr, Fort Myers, FL 33905");
  });

  test("the three numbers check each other: previous − cut = current", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const prev = Number(cellNamed(doc, "Previous Price")!.value.replace(/[^\d]/g, ""));
    const cut = Number(heroOf(doc)!.kicker!.replace(/[^\d]/g, ""));
    const now = Number(heroOf(doc)!.value!.replace(/[^\d]/g, ""));
    expect(prev - cut).toBe(now);
  });

  test("a house with NO reduction never ships the words 'Price cut' over nothing", async () => {
    const doc = (await buildPriceReduced(ctx({ ...SHORE_DR, isPriceReduced: false })))!;
    // A falsy kicker is dropped by the chrome entirely — the prop never lands.
    expect(heroOf(doc)!.kicker ?? "").toBe("");
    // …and the previous-price cell is an OPEN SLOT, not a fabricated anchor.
    expect(cellNamed(doc, "Previous Price")!.value).toBe("");
    // The recipe presupposes a cut; with none, it still BUILDS (RULE 0.7 — never refuse).
    expect(heroOf(doc)!.value).toBe("$595,000");
  });
});

// ── CELLS: sourced, or an open slot. Never a zero. ──────────────────────────────

describe("every cell is sourced or open", () => {
  test("the strip is the campaign's spec line, with the price ANCHOR in front", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    // The shared line (listingSpecs) minus TYPE — the muted context cell nobody reads on
    // an email whose subject is a number that MOVED. It had to go: six is the schema's
    // hard cap on a stats row, and the anchor earns the slot.
    expect(allCells(doc).map((c) => c.label)).toEqual([
      "Previous Price",
      "Beds",
      "Baths",
      "Sq Ft",
      "Lot",
      "$/Sq Ft",
    ]);
  });

  test("the key specs come from the record", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    expect(cellNamed(doc, "Beds")!.value).toBe("3");
    expect(cellNamed(doc, "Baths")!.value).toBe("3.5");
    expect(cellNamed(doc, "Sq Ft")!.value).toBe("2,847");
    expect(cellNamed(doc, "Lot")!.value).toBe("0.26 ac"); // ACRES — never re-converted
  });

  test("$/Sq Ft is computed on the NEW price, and WINS the strip", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    // 595,000 ÷ 2,847 = $209. The cut is the point; the new $/sqft is what it bought.
    expect(cellNamed(doc, "$/Sq Ft")!.value).toBe("$209");
    expect(cellNamed(doc, "$/Sq Ft")!.emphasis).toBe("primary");
  });

  test("the previous price is MUTED — it must never out-shout the price you can pay", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    expect(cellNamed(doc, "Previous Price")!.emphasis).toBe("muted");
  });

  test("both DERIVED cells state their provenance under the strip", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const strip = doc.blocks.find((b) => b.type === "stats")!.props as { footnote?: string };
    expect(strip.footnote).toContain("list price ÷ listed square footage");
    expect(strip.footnote).toContain("Previous price = this asking price plus the reduction");
  });

  test("NOT ONE cell is a zero", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    for (const c of allCells(doc)) expect(c.value).not.toBe("0");
  });

  test("an unresolved subject still lands the grid, every cell open (never refuse)", async () => {
    const bare: ListingFacts = { address: "1 Nowhere St", photos: [], sourceUrl: "" };
    const doc = (await buildPriceReduced(ctx(bare)))!;
    expect(doc).toBeTruthy();
    expect(allCells(doc).every((c) => c.value === "")).toBe(true);
  });

  test("no subject at all → fall through to the generic author", async () => {
    expect(await buildPriceReduced(ctx(null))).toBeNull();
  });
});

// ── CHART: none. Two bars is a fact wearing a chart costume. ────────────────────

describe("no chart", () => {
  test("the built doc carries no chart block", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const charts = doc.blocks.filter((b) => b.type === "image" && b.props.kind === "chart");
    expect(charts).toHaveLength(0);
  });

  test("the photo, not a chart, is the visual", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const photo = doc.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
    expect((photo!.props as { url?: string }).url).toBe(SHORE_DR.photos[0]);
  });

  test("no photo → an OPEN SLOT (a canvas dropzone), never a stock image", async () => {
    const doc = (await buildPriceReduced(ctx({ ...SHORE_DR, photos: [] })))!;
    const photo = doc.blocks.find((b) => b.type === "image" && b.props.kind === "photo");
    expect((photo!.props as { url?: string }).url).toBe("");
  });
});

// ── PROSE: the model writes prose and nothing else. ─────────────────────────────

/** The agent's own listing copy — lane 2. No vendor sells us MLS remarks, so this is
 *  the ONLY real source for what the home actually IS. */
const REMARKS =
  "Direct Gulf-access canal home with a private dock and a heated saltwater pool. " +
  "Quartz counters, impact glass throughout, and a five-minute idle to open water.";
const WITH_REMARKS: ListingFacts = { ...SHORE_DR, remarks: REMARKS };

describe("the narrator", () => {
  test("NO pasted description → NO paragraph. The slot stays OPEN.", async () => {
    // THE FINDING THAT CHANGED THIS BUILD (live, 07/13/2026). Handed the record alone,
    // Sonnet wrote: "The address on Shore Drive suggests a setting worth a closer look…
    // room that newer builds at this size rarely compromise on. Worth scheduling a
    // showing…" — a setting inferred from a STREET NAME, a comparison to homes it was
    // never shown, and a call to action of its own. All three are banned in its prompt.
    // It wrote them anyway, because with no description it has NO SOURCE for a
    // paragraph, and the playbook already knew it (Part 3, rule 4).
    //
    // So we don't ask. The paragraph is authored only from a real descriptive source.
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const body = (doc.blocks.find((b) => b.type === "text")!.props as { body?: string }).body ?? "";
    expect(body).toBe("");
  });

  test("the OPEN paragraph does not exist in the sent email", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const html = await renderEmailDocHtml(doc);
    // On the canvas TextBlock shows its instruction ("Paste your text here — we'll
    // tighten it"). In the email the block is gone — never an empty bordered band.
    expect(html).not.toContain("Paste your text here");
  });

  test("WITH the agent's description (lane 2) → the paragraph is authored", async () => {
    const doc = (await buildPriceReduced(ctx(WITH_REMARKS)))!;
    const body = (doc.blocks.find((b) => b.type === "text")!.props as { body?: string }).body ?? "";
    expect(body).toBe(NARRATIVE);
  });

  test("no coaching note EVER survives into the body", async () => {
    // The committed skeleton once prefilled this slot with "Say why this is a good value
    // now — what changed, and why a motivated seller means room to negotiate." A canvas
    // note asking for two claims we cannot source, sent as the agent's prose.
    // fillNarrative SKIPS a non-empty text block, so the slot is cleared FIRST, always.
    for (const f of [SHORE_DR, WITH_REMARKS]) {
      const doc = (await buildPriceReduced(ctx(f)))!;
      const body =
        (doc.blocks.find((b) => b.type === "text")!.props as { body?: string }).body ?? "";
      expect(body).not.toContain("motivated seller");
      expect(body).not.toContain("room to negotiate");
    }
  });

  test("a failed narrator leaves an OPEN SLOT, not a half-written pitch", async () => {
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
    const doc = (await buildPriceReduced(ctx(WITH_REMARKS)))!;
    const body = (doc.blocks.find((b) => b.type === "text")!.props as { body?: string }).body ?? "";
    expect(body).toBe(""); // cleared, and left open — never a fabrication
    // restore the good narrator for the tests below
    mock.module("@/refinery/agents/anthropic.mts", () => ({
      ...realAnthropic,
      getAnthropic: () => ({
        messages: {
          create: async (req: { system?: string }) => {
            lastSystem = req.system ?? "";
            return { content: [{ type: "text", text: NARRATIVE }] };
          },
        },
      }),
    }));
  });

  test("is forbidden, BY NAME, from every invention the live run produced", async () => {
    await buildPriceReduced(ctx(WITH_REMARKS));
    // The registry prompt asks for "one honest line on what the new price means" —
    // which, with zero market data, is bait. These are the inventions it invites.
    expect(lastSystem).toContain("YOU DO NOT KNOW WHY THE PRICE CAME DOWN");
    expect(lastSystem).toContain("YOU WERE GIVEN NO MARKET DATA");
    expect(lastSystem).toContain("NEVER READ THE ADDRESS AS A FACT"); // the Shore Drive guess
    expect(lastSystem).toContain("NEVER COMPARE THIS HOME TO OTHER HOMES"); // "newer builds"
    expect(lastSystem).toContain("DO NOT WRITE A CALL TO ACTION"); // "worth scheduling a showing"
    for (const banned of ["motivated", "room", "bargain", "priced to move", "won't last"]) {
      expect(lastSystem.toLowerCase()).toContain(banned.toLowerCase());
    }
  });

  test("on a house with no cut, the narrator is never TOLD there was one", async () => {
    await buildPriceReduced(ctx({ ...WITH_REMARKS, isPriceReduced: false }));
    expect(lastSystem).toContain("YOU WERE NOT TOLD THE PRICE CHANGED");
    expect(lastSystem).not.toContain("A PRICE IMPROVEMENT announcement");
  });
});

// ── THE SENT ARTIFACT. The canvas lies about the email; verify the real renderer. ─

describe("the sendable email (renderEmailDocHtml — what the recipient actually gets)", () => {
  test("the ribbon, the cut, the new price and the previous price all ship", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("Price Improved"); // the campaign ribbon band
    expect(html).toContain("Price cut $104,975");
    expect(html).toContain("$595,000");
    expect(html).toContain("$699,975");
    expect(html).toContain("326 Shore Dr, Fort Myers, FL 33905");
  });

  test("an OPEN SLOT does not exist in the email — no naked label to a recipient", async () => {
    // Drop the one cell we cannot source on this fixture and confirm the label vanishes
    // from the sent bytes while its sourced siblings survive (StatsBlock, emailRender).
    const doc = (await buildPriceReduced(ctx({ ...SHORE_DR, lotSize: undefined })))!;
    const html = await renderEmailDocHtml(doc);
    expect(cellNamed(doc, "Lot")!.value).toBe(""); // an open slot on the canvas…
    expect(html).not.toContain(">Lot<"); // …and absent from the email
    expect(html).toContain("Previous Price"); // the strip itself survives
  });

  test("a house with no cut sends no price-cut language at all", async () => {
    const doc = (await buildPriceReduced(ctx({ ...SHORE_DR, isPriceReduced: false })))!;
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("Price cut");
    expect(html).not.toContain("Previous Price"); // the cell is unsourced → dropped
    expect(html).toContain("$595,000"); // the honest current ask still ships
  });
});

// ── THE CHART: the new price's $/sq ft vs. real nearby comps ────────────────────

const comp = (price: number, sqft: number): RenderComp => ({
  addressLine: "1 A St",
  city: "Fort Myers",
  beds: 3,
  baths: 2,
  sqft,
  status: "sold",
  price,
  priceKind: "sold",
  priceDate: "2026-01-01",
  sourceUrl: null,
});

test("priceVsAreaDotSpec returns null with fewer than 2 comparable homes", () => {
  const facts = {
    address: "1 Main St, Fort Myers, FL 33905",
    price: "$500,000",
    sqft: "2000",
  } as never;
  expect(priceVsAreaDotSpec(facts, [comp(400000, 2000)])).toBeNull();
});

test("priceVsAreaDotSpec returns null with no subject price or sqft", () => {
  const facts = { address: "1 Main St, Fort Myers, FL 33905", sqft: "2000" } as never;
  expect(priceVsAreaDotSpec(facts, [comp(400000, 2000), comp(420000, 2100)])).toBeNull();
});

test("priceVsAreaDotSpec plots the subject's $/sqft against the comp median, on the dot-plot frame", () => {
  const facts = {
    address: "1 Main St, Fort Myers, FL 33905",
    price: "$400,000",
    sqft: "2000",
  } as never;
  const spec = priceVsAreaDotSpec(facts, [comp(440000, 2000), comp(460000, 2000)]); // 220, 230 $/sqft
  expect(spec).not.toBeNull();
  expect(spec!.frameId).toBe("dot-plot");
  expect((spec!.options as { data: { value: number; reference?: number }[] }).data[0].value).toBe(
    200,
  ); // 400000/2000
  expect(
    (spec!.options as { data: { value: number; reference?: number }[] }).data[0].reference,
  ).toBe(225); // median(220,230)
});

test("priceVsAreaDotSpec filters out vacant-lot comps (no beds/sqft) before computing the median", () => {
  const facts = {
    address: "1 Main St, Fort Myers, FL 33905",
    price: "$400,000",
    sqft: "2000",
  } as never;
  const vacantLot: RenderComp = { ...comp(139800, 0), beds: null, sqft: null };
  const spec = priceVsAreaDotSpec(facts, [comp(440000, 2000), comp(460000, 2000), vacantLot]);
  expect(spec).not.toBeNull();
  expect((spec!.options as { data: { reference?: number }[] }).data[0].reference).toBe(225); // unaffected by the lot
});

// ── THE BUILD-LEVEL WIRING: the chart fills when sourced, drops cleanly when not ──
//
// Task 10 wired priceVsAreaDotSpec + compsForAddress + chartSpecToEmailImage into
// buildPriceReduced itself. Every fixture above this point exercises the NO-COMPS path
// (the module-level compsForAddress mock defaults to `mockComps = []`, so the "no chart"
// describe block above and every SHORE_DR-based test reserve-then-drop the slot). These
// are the only two tests in the file that prove the OTHER side of that wiring end to
// end: the slot actually fills when real comps exist, and a listing with no reduction
// never reserves the slot in the first place — through the real built doc, not a mock
// call count.

describe("the build-level wiring — the chart fills when sourced, drops cleanly when not", () => {
  test("fills the chart slot when a reduction and real comps both exist", async () => {
    // The only test in this file that flips the module-level comps mock away from its
    // empty default — restored in `finally` so every other test keeps seeing no comps
    // regardless of run order.
    mockComps = [comp(440000, 2000), comp(460000, 2000)];
    try {
      const facts: ListingFacts = {
        address: "1 Main St, Fort Myers, FL 33905",
        price: "$400,000",
        sqft: "2000",
        isPriceReduced: true,
        priceReduction: "$50,000",
        photos: [],
        sourceUrl: "",
      };
      const doc = (await buildPriceReduced(ctx(facts)))!;
      const chartBlock = doc.blocks.find((b) => b.type === "image" && b.props.kind === "chart");
      expect((chartBlock?.props as { url?: string } | undefined)?.url).toBe(
        "https://cdn.example/chart.png",
      );
    } finally {
      mockComps = [];
    }
  });

  test("has no chart block at all when there is no reduction", async () => {
    const facts: ListingFacts = {
      address: "1 Main St, Fort Myers, FL 33905",
      price: "$400,000",
      sqft: "2000",
      isPriceReduced: false,
      photos: [],
      sourceUrl: "",
    };
    const doc = (await buildPriceReduced(ctx(facts)))!;
    const chartBlock = doc.blocks.find((b) => b.type === "image" && b.props.kind === "chart");
    expect(chartBlock).toBeUndefined(); // dropEmptyChartSlot removed the never-reserved slot
  });
});
