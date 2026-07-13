// lib/deliverable/recipes/price-reduced.test.ts
//
// R7 · PRICE IMPROVED — the acceptance oracle for THE ARITHMETIC OF A PRICE CUT.
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
// inventions by name, and the tests below assert the seed's own coaching note (which
// asks for TWO of them: "a motivated seller", "room to negotiate") never survives.
//
// Fully offline: the Anthropic client and the photo mirror are stubbed, so this suite
// makes ZERO network calls and costs nothing to run.

import { test, expect, mock, afterAll, describe } from "bun:test";
import * as realAnthropic from "@/refinery/agents/anthropic.mts";
import * as realMirror from "@/lib/media/hero-photo";
import { RECIPES } from "@/lib/deliverable/recipes";
import type { RecipeBuildContext } from "./index";
import type { ListingFacts } from "@/lib/email/listing-scrape";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";

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

const NARRATIVE = "A three-bedroom home on a quarter-acre lot east of the river.";

// mock.module is process-global and mock.restore() does NOT undo it — snapshot and
// restore, the repo's established pattern (lib/email/build-doc-listing.test.ts).
const ORIG = {
  "@/refinery/agents/anthropic.mts": { ...realAnthropic },
  "@/lib/media/hero-photo": { ...realMirror },
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

const { buildPriceReduced, previousPrice, priceCutKicker } = await import("./price-reduced");
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
const heroOf = (doc: EmailDoc) =>
  doc.blocks.find((b) => b.type === "hero")?.props as
    { kicker?: string; value?: string; label?: string } | undefined;

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
    // HeroBlock renders kicker directly above value, at 11px (value: 40px) in
    // globalStyle.accentColor (the value renders in the text color). That IS the ruling.
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
    expect(heroOf(doc)!.kicker).toBe("");
    // …and the previous-price cell is an OPEN SLOT, not a fabricated anchor.
    expect(cellNamed(doc, "Previous Price")!.value).toBe("");
    // The recipe presupposes a cut; with none, it still BUILDS (RULE 0.7 — never refuse).
    expect(heroOf(doc)!.value).toBe("$595,000");
  });
});

// ── CELLS: sourced, or an open slot. Never a zero. ──────────────────────────────

describe("every cell is sourced or open", () => {
  test("the key specs come from the record", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    expect(cellNamed(doc, "Beds")!.value).toBe("3");
    expect(cellNamed(doc, "Baths")!.value).toBe("3.5");
    expect(cellNamed(doc, "Sq Ft")!.value).toBe("2,847");
    expect(cellNamed(doc, "Lot")!.value).toBe("0.26 ac"); // ACRES — never re-converted
    expect(cellNamed(doc, "Type")!.value).toBe("Residential");
  });

  test("$/Sq Ft is computed on the NEW price", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    // 595,000 ÷ 2,847 = $209. The cut is the point; the new $/sqft is what it bought.
    expect(cellNamed(doc, "$/Sq Ft")!.value).toBe("$209");
  });

  test("Days on Market is an OPEN SLOT — we hold no such field at all", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const dom = cellNamed(doc, "Days on Market")!;
    expect(dom.value).toBe(""); // never a 0, never a guess
    expect(dom.label).toBe("Days on Market"); // the label IS the instruction
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

  test("the seed's coaching note NEVER survives into the body", async () => {
    // The committed skeleton prefills this slot with "Say why this is a good value
    // now — what changed, and why a motivated seller means room to negotiate."
    // fillNarrative SKIPS a non-empty text block, so an uncleared slot ships it — a
    // canvas note asking for two claims we cannot source, sent as the agent's prose.
    for (const f of [SHORE_DR, WITH_REMARKS]) {
      const doc = (await buildPriceReduced(ctx(f)))!;
      const body =
        (doc.blocks.find((b) => b.type === "text")!.props as { body?: string }).body ?? "";
      expect(body).not.toContain("motivated seller");
      expect(body).not.toContain("room to negotiate");
    }
  });

  test("a failed narrator leaves an OPEN SLOT, not the coaching note", async () => {
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
    expect(body).toBe(""); // cleared, and left open — never the seed's pitch note
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
  test("the cut, the new price and the previous price all ship", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const html = await renderEmailDocHtml(doc);
    expect(html).toContain("Price cut $104,975");
    expect(html).toContain("$595,000");
    expect(html).toContain("$699,975");
    expect(html).toContain("326 Shore Dr, Fort Myers, FL 33905");
  });

  test("the OPEN SLOT does not exist in the email — no naked label to a recipient", async () => {
    const doc = (await buildPriceReduced(ctx(SHORE_DR)))!;
    const html = await renderEmailDocHtml(doc);
    // On the canvas "Days on Market" is an editable invitation. In the SENT email the
    // cell is dropped entirely (StatsBlock, emailRender) — never a label over nothing.
    expect(html).not.toContain("Days on Market");
    // The row survives because its sibling cell IS sourced.
    expect(html).toContain("Previous Price");
  });

  test("a house with no cut sends no price-cut language at all", async () => {
    const doc = (await buildPriceReduced(ctx({ ...SHORE_DR, isPriceReduced: false })))!;
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("Price cut");
    expect(html).not.toContain("Previous Price"); // the whole row is unsourced → gone
    expect(html).toContain("$595,000"); // the honest current ask still ships
  });
});
