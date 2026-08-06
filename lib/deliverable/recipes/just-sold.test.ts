// lib/deliverable/recipes/just-sold.test.ts
//
// The invariants of R5 · JUST SOLD. Every one of these is a bug that was live at
// some point on 07/13/2026, or a trap the live vendor probe actually laid.
//
// Offline by construction: these test the PURE decision functions (which comp is a
// real sale, what may fill the close, which cells render). The network lives in
// buildJustSold's one compsForAddress call and is not exercised here.

import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  buildJustSoldSpec,
  chartAnchor,
  closeFrom,
  heroPrice,
  realSaleComps,
  soldFootnote,
  soldNarrativeLine,
  soldSpecs,
  subjectRow,
  withSubjectRowFacts,
} from "./just-sold";
import type { StatItem } from "@/lib/email/doc/types";
import type { RenderComp } from "@/lib/assistant/comp-helper";
import type { ListingFacts } from "@/lib/email/listing-scrape";

const comp = (over: Partial<RenderComp>): RenderComp => ({
  addressLine: "1 Main St",
  city: "Fort Myers",
  beds: 3,
  baths: 2,
  sqft: 1500,
  status: "sold",
  price: 400_000,
  priceKind: "sold",
  priceDate: "2026-05-20",
  sourceUrl: null,
  ...over,
});

const SUBJECT = "326 Shore Dr";

/** The real vacant lot from the live sold set around 326 Shore Dr — beds/sqft null,
 *  a big lot, and a price that would make a 2,847 sqft house look like a bargain. */
const VACANT_LOT = comp({
  addressLine: "315 Shore Dr",
  beds: null,
  baths: null,
  sqft: null,
  price: 127_500,
});

describe("realSaleComps — what may sit beside a close", () => {
  it("drops a vacant lot: a comp must have beds AND sqft (315 Shore Dr, live)", () => {
    const out = realSaleComps([comp({ addressLine: "330 Shore Dr" }), VACANT_LOT], SUBJECT);
    expect(out.map((c) => c.addressLine)).toEqual(["330 Shore Dr"]);
  });

  it("drops an AVM estimate and a last-list — neither is a SALE", () => {
    const out = realSaleComps(
      [
        comp({ addressLine: "A St", priceKind: "sold" }),
        comp({ addressLine: "B St", priceKind: "estimate" }),
        comp({ addressLine: "C St", priceKind: "last_list" }),
      ],
      SUBJECT,
    );
    expect(out.map((c) => c.addressLine)).toEqual(["A St"]);
  });

  it("drops the subject — a house is never its own comp (suffix-folded)", () => {
    // The vendor writes "326 Shore Drive"; the user typed "326 Shore Dr".
    const out = realSaleComps(
      [comp({ addressLine: "326 Shore Drive" }), comp({ addressLine: "330 Shore Dr" })],
      SUBJECT,
    );
    expect(out.map((c) => c.addressLine)).toEqual(["330 Shore Dr"]);
  });

  it("drops an unpriced comp (no price = no row)", () => {
    expect(realSaleComps([comp({ addressLine: "A St", price: null })], SUBJECT)).toEqual([]);
  });
});

describe("closeFrom — the ONLY thing that may fill a sale price", () => {
  it("takes a RECORDED sale", () => {
    const row = comp({ addressLine: SUBJECT, price: 300_000, priceDate: "2025-08-29" });
    expect(closeFrom(row)).toEqual({ price: 300_000, date: "2025-08-29" });
  });

  it("REFUSES an AVM estimate — an estimate is not a sale", () => {
    expect(closeFrom(comp({ priceKind: "estimate", price: 743_500 }))).toBeNull();
  });

  it("REFUSES a last-list price — an ask is not a sale", () => {
    expect(closeFrom(comp({ priceKind: "last_list", price: 595_000 }))).toBeNull();
  });

  it("REFUSES a missing subject row", () => {
    expect(closeFrom(null)).toBeNull();
  });
});

describe("subjectRow — the subject is the nearest property to its own coordinates", () => {
  it("finds the subject in its own nearby set, folding the street suffix", () => {
    const rows = [comp({ addressLine: "326 Shore Drive" }), comp({ addressLine: "330 Shore Dr" })];
    expect(subjectRow(rows, SUBJECT)?.addressLine).toBe("326 Shore Drive");
  });

  it("returns null when the subject is not in the set (it has not sold)", () => {
    expect(subjectRow([comp({ addressLine: "330 Shore Dr" })], SUBJECT)).toBeNull();
  });
});

describe("withSubjectRowFacts — the SOLD-SUBJECT gap", () => {
  const bare: ListingFacts = { address: "330 Shore Dr", photos: [], sourceUrl: "x" };

  it("recovers beds/baths/sqft for a sold house the for-sale feed cannot see", () => {
    // resolveSubjectListing reads the FOR-SALE feed, so a sold house resolves to an
    // address and nothing else. Its own row in the sold set holds the specs — on an
    // endpoint this builder already calls. (330 Shore Dr, live: 3/2/1,736.)
    const out = withSubjectRowFacts(bare, comp({ beds: 3, baths: 2, sqft: 1736 }));
    expect(out.beds).toBe("3");
    expect(out.baths).toBe("2");
    expect(out.sqft).toBe("1736");
  });

  it("NEVER overwrites a value the dispatcher already resolved", () => {
    const resolvedFacts: ListingFacts = { ...bare, beds: "5", baths: "4", sqft: "9999" };
    const out = withSubjectRowFacts(resolvedFacts, comp({ beds: 3, baths: 2, sqft: 1736 }));
    expect(out.beds).toBe("5");
    expect(out.baths).toBe("4");
    expect(out.sqft).toBe("9999");
  });

  it("is a no-op with no subject row — never invents a spec", () => {
    expect(withSubjectRowFacts(bare, null)).toEqual(bare);
  });
});

// ── THE SPEC STRIP. The campaign chrome (lib/email/lifecycle-chrome.ts) gives every
// lifecycle email ONE hairline row; the recipe only chooses the cells. The old two
// stat GRIDS are gone — that layout was one of the seven that made a campaign look
// like seven companies. The sourcing rules underneath did not change, so every guard
// below is the same guard, now asserted against the strip.
describe("soldSpecs — THE PAIRING RULE (found by looking at the render)", () => {
  const active: ListingFacts = {
    address: "326 Shore Dr",
    price: "$595,000", // the ASK — the house has not sold
    beds: "3",
    baths: "3.5",
    sqft: "2847",
    photos: [],
    sourceUrl: "x",
  };

  const cell = (strip: StatItem[], label: string) => strip.find((c) => c.label === label);

  it("is ONE strip — the chrome's single hairline row, never a wall of stat grids", () => {
    const strip = soldSpecs(active, { price: 613_850, date: "2026-05-20" });
    expect(strip.map((c) => c.label)).toEqual([
      "Beds",
      "Baths",
      "Sq Ft",
      "$/Sq Ft",
      "List Price",
      "List-to-Sale",
    ]);
  });

  it("NEVER carries the close — the hero says it once, and once is enough", () => {
    // The old layout printed the hero's own $300,000 again, at the same scale, in a
    // stat row directly beneath it. The HTML greps clean; only the screenshot showed it.
    const strip = soldSpecs(active, { price: 613_850, date: "2026-05-20" });
    expect(strip.some((c) => c.label === "Sale Price")).toBe(false);
    expect(strip.map((c) => c.value).join()).not.toContain("613,850");
  });

  it("with NO close, the list price does NOT render — an ask under a JUST SOLD ribbon reads as the close", () => {
    // With the close an open slot, "$595,000 / List Price" standing in the strip under
    // a gold JUST SOLD ribbon says the house closed at its asking price. Every word
    // true; the page still lying. All-or-nothing on the PAIR.
    const strip = soldSpecs(active, null);
    expect(cell(strip, "List Price")?.value).toBe("");
    expect(cell(strip, "List-to-Sale")?.value).toBe("");
    expect(strip.map((c) => c.value).join()).not.toContain("595,000");
  });

  it("with a close, the ask + list-to-sale fill, computed from TWO sourced numbers", () => {
    const strip = soldSpecs(active, { price: 613_850, date: "2026-05-20" });
    expect(cell(strip, "List Price")).toEqual({
      value: "$595,000",
      label: "List Price",
      emphasis: "muted",
    });
    expect(cell(strip, "List-to-Sale")).toEqual({
      value: "103.2%", // 613850 / 595000
      label: "List-to-Sale",
      emphasis: "primary",
    });
  });

  it("$/Sq Ft is the SALE price ÷ sq ft — never the ask ÷ sq ft", () => {
    // 613850 / 2847 = $216. The ask would have given $209 — a real number answering
    // the wrong question, which is this recipe's whole disease.
    expect(cell(soldSpecs(active, { price: 613_850, date: null }), "$/Sq Ft")?.value).toBe("$216");
    // No close → no sold $/sq ft. It does NOT quietly fall back to the ask.
    expect(cell(soldSpecs(active, null), "$/Sq Ft")?.value).toBe("");
  });

  it("with a close but NO ask (the REAL sold-house case), the price cells stay open", () => {
    // The for-sale feed cannot see a sold home, so `facts.price` is absent. The hero
    // carries the close on its own; a comparison cell with nothing to compare is not a cell.
    const sold: ListingFacts = { address: "330 Shore Dr", photos: [], sourceUrl: "x" };
    const strip = soldSpecs(sold, { price: 300_000, date: "2025-08-29" });
    expect(cell(strip, "List Price")?.value).toBe("");
    expect(cell(strip, "List-to-Sale")?.value).toBe(""); // never back-solved from one number
  });

  it("an unsourced spec is an OPEN SLOT, never a zero", () => {
    const bare: ListingFacts = { address: "x", photos: [], sourceUrl: "x" };
    const strip = soldSpecs(bare, null);
    expect(strip.map((c) => c.value)).toEqual(["", "", "", "", "", ""]);
    expect(strip.map((c) => c.value).join()).not.toContain("0");
  });

  it("formats sqft with a comma", () => {
    expect(cell(soldSpecs(active, null), "Sq Ft")?.value).toBe("2,847");
  });
});

describe("soldFootnote — a derived cell says where it came from", () => {
  const active: ListingFacts = {
    address: "326 Shore Dr",
    price: "$595,000",
    sqft: "2847",
    photos: [],
    sourceUrl: "x",
  };

  it("names BOTH derivations when both cells rendered", () => {
    const note = soldFootnote(active, { price: 613_850, date: null });
    expect(note).toContain("$/Sq Ft is the sale price ÷ listed square footage");
    expect(note).toContain("List-to-Sale is the sale price ÷ the list price");
  });

  it("names only what rendered — a sold house with no ask has no list-to-sale", () => {
    const sold: ListingFacts = {
      address: "330 Shore Dr",
      sqft: "1736",
      photos: [],
      sourceUrl: "x",
    };
    const note = soldFootnote(sold, { price: 300_000, date: null });
    expect(note).toContain("$/Sq Ft");
    expect(note).not.toContain("List-to-Sale");
  });

  it("is absent with no close — nothing was computed, so nothing is claimed", () => {
    expect(soldFootnote(active, null)).toBeUndefined();
  });
});

describe("buildJustSoldSpec — the chart is about the SUBJECT or it does not ship", () => {
  const two = [
    comp({ addressLine: "A St", price: 300_000 }),
    comp({ addressLine: "B St", price: 385_000 }),
  ];

  it("leads with the subject's own bar", () => {
    const spec = buildJustSoldSpec(two, { street: SUBJECT, close: 610_000 }, "2026-07-13");
    expect(spec?.rows[0]).toEqual([`This home · ${SUBJECT}`, 610_000]);
  });

  it("keeps the subject MARKER inside barChartSvg's 26-char label limit, even on a long street", () => {
    // barChartSvg truncates at 26 chars and right-anchors, so a TRAILING marker is
    // the first thing cut: "(Subject — sold)" rendered as "(Subject — s…". Leading
    // the marker means the street loses its tail instead and the bar stays identifiable.
    const long = "16447 Rainbow Meadows Court";
    const spec = buildJustSoldSpec(two, { street: long, close: 610_000 }, "2026-07-13");
    const label = String(spec?.rows[0][0]);
    expect(label.slice(0, 26)).toContain("This home");
  });

  it("sorts the comps descending beneath it", () => {
    const spec = buildJustSoldSpec(two, { street: SUBJECT, close: 610_000 }, "2026-07-13");
    expect(spec?.rows.slice(1)).toEqual([
      ["B St", 385_000],
      ["A St", 300_000],
    ]);
  });

  it("refuses under two comps — two bars is a fact wearing a chart costume", () => {
    expect(buildJustSoldSpec(two.slice(0, 1), { street: SUBJECT, close: 610_000 }, "x")).toBeNull();
    expect(buildJustSoldSpec([], { street: SUBJECT, close: 610_000 }, "x")).toBeNull();
  });
});

// ── THE CLOSE CELL — OPERATOR DECREE 08/06/2026 ────────────────────────────────
//
// Verbatim: *"SOLD PRICE IS ENTERED AS LAST LISTED PRICE WE HAVE. USER CAN CHANGE IT
// IF THEY WANT."* And, the same day: *"APIFY IS FALL BACK FOR SOLD PRICE. WE WILL NOT
// USE IT UNTIL WE SEE THERE IS AN ACTUAL DIFFERENCE. I WILL DECIDE."*
//
// So the cell fills from a REAL recorded sale when we hold one, otherwise it PREFILLS
// from `listing_state.list_price` (which is `facts.price` — `lib/listings/select.ts:264`),
// and the agent types over it. The paid rungs of the playbook ladder are SUSPENDED.
//
// Every test below is named after the failure mode it stops. The shape they all guard is
// ONE thing: a prefill is a STARTING VALUE IN AN EDITABLE CELL, never a measurement — so
// it may never reach a cell that is DERIVED, CHARTED, FOOTNOTED or WRITTEN INTO PROSE,
// because none of those are editable and none of them carry their own label.
describe("heroPrice — the close cell, and which rung filled it", () => {
  const active: ListingFacts = {
    address: "326 Shore Dr",
    price: "$595,000",
    sqft: "2847",
    photos: [],
    sourceUrl: "x",
  };

  it("a REAL recorded sale wins, and carries the Sold-date kicker", () => {
    const hero = heroPrice(active, { price: 613_850, date: "2026-05-20" });
    expect(hero).toEqual({ value: "$613,850", rung: "recorded", kicker: "Sold 05/20/2026" });
  });

  it("F6 · NO recorded sale → the last list price PREFILLS it, with NO sold-date kicker", () => {
    // A "Sold <date>" kicker over a prefill asserts a recorded date we do not hold. The
    // number is editable; the date line would not be, and it would ship to the recipient.
    const hero = heroPrice(active, null);
    expect(hero.rung).toBe("prefill");
    expect(hero.kicker).toBeUndefined();
  });

  it("F9 · the prefill is our list price VERBATIM — never reformatted", () => {
    // The agent recognizes their own number and leaves it or fixes it. Round-tripping it
    // through a formatter ($595,000 → $595000 → $595,000) is a silent way to hand back a
    // number that is no longer theirs, and it breaks the acceptance assertion outright.
    expect(heroPrice({ ...active, price: "$1,275,000" }, null).value).toBe("$1,275,000");
  });

  it("F8 · nothing held at all → an OPEN SLOT, never a zero", () => {
    const bare: ListingFacts = { address: "x", photos: [], sourceUrl: "x" };
    expect(heroPrice(bare, null)).toEqual({ value: "", rung: "open", kicker: undefined });
  });
});

describe("the prefill NEVER leaks out of the hero cell", () => {
  const active: ListingFacts = {
    address: "326 Shore Dr",
    price: "$595,000",
    sqft: "2847",
    photos: [],
    sourceUrl: "x",
  };

  it("F1/F2/F3 · with a prefill in the hero, the strip's derived cells stay OPEN", () => {
    // F1 List-to-Sale would compute 100.0% from the same figure twice and render it in the
    // accent as the strip's PRIMARY cell — a fabricated market outcome, the worst defect
    // available here. F2 $/Sq Ft would be list-price-per-sqft under a label saying sale.
    // F3 List Price would print the hero's own number again at a second scale — the exact
    // bug this recipe's header records ("the HTML greps clean; only the screenshot showed it").
    expect(heroPrice(active, null).rung).toBe("prefill"); // the hero IS filled…
    const strip = soldSpecs(active, null); // …and the strip still knows nothing
    const cell = (l: string) => strip.find((c) => c.label === l)?.value;
    expect(cell("List-to-Sale")).toBe("");
    expect(cell("List Price")).toBe("");
    expect(cell("$/Sq Ft")).toBe("");
    expect(strip.map((c) => c.value).join()).not.toContain("595,000");
  });

  it("F2 · the footnote claims nothing when nothing was computed", () => {
    // A footnote is a provenance claim. "$/Sq Ft is the sale price ÷ listed square footage"
    // is false by construction when the hero holds a prefill.
    expect(soldFootnote(active, null)).toBeUndefined();
  });

  it("F4 · a prefill is NEVER a bar — the chart anchors on a recorded close or not at all", () => {
    // A baked PNG bar carries no label, no provenance row and no editability, so it is the
    // one element the agent cannot correct. That is the same mechanism §2.5.0 forbids for
    // an old recorded transfer: a plausible-looking wrong number that reads as authoritative.
    expect(chartAnchor(null)).toBeNull();
    expect(chartAnchor({ price: 613_850, date: null })).toBe(613_850);
  });

  it("F5 · with no recorded close the narrator is FORBIDDEN to name a sale price", () => {
    // Prose is baked at author time and is not editable. A prefill the agent will correct
    // in the cell would survive, uncorrected, inside the paragraph.
    const line = soldNarrativeLine(null);
    expect(line).toContain("NOT AVAILABLE TO YOU");
    expect(line).not.toContain("$");
    const withClose = soldNarrativeLine({ price: 613_850, date: "2026-05-20" });
    expect(withClose).toContain("$613,850");
    expect(withClose).toContain("05/20/2026");
  });
});

describe("F10 · the paid rung is OFF until the operator turns it on", () => {
  it("this recipe reaches for no paid sold-price lane", () => {
    // Decree 08/06/2026: *"APIFY IS FALL BACK FOR SOLD PRICE. WE WILL NOT USE IT UNTIL WE
    // SEE THERE IS AN ACTUAL DIFFERENCE. I WILL DECIDE. NOT STUPID CLAUDE."* A grep-shaped
    // guard is the honest one here: the failure is an IMPORT appearing, and no unit test of
    // a pure function can see that.
    const src = readFileSync(new URL("./just-sold.ts", import.meta.url), "utf8");
    const paid = src.match(/^import[\s\S]*?from\s+"[^"]*(apify|paid-record|property-tax)[^"]*";/gm);
    expect(paid).toBeNull();
  });
});

describe("the seller's for-sale description does NOT ship on a sold email", () => {
  it("no `description:` is handed to the chrome — the pitch is stale once it closes", () => {
    // Found by RENDERING AND LOOKING (08/06/2026), never by a test: wired up on the
    // acceptance house it printed "Best-priced single-family home in the community — don't
    // miss this opportunity" under a gold JUST SOLD ribbon. Urging a reader not to miss a
    // house that is already gone is incoherent, and the block is VERBATIM by contract so it
    // cannot be edited into coherence. The element and the headline cannot both be right.
    //
    // This is a source-shaped guard on purpose: the failure is a LINE REAPPEARING, and the
    // most likely way it comes back is someone reading the provenance row, seeing a held
    // description that does not ship, and "fixing" it. Under Contract keeps its description
    // because PENDING is not SOLD — do not copy that line into this file.
    const src = readFileSync(new URL("./just-sold.ts", import.meta.url), "utf8");
    expect(/^\s*description:/m.test(src)).toBe(false);
  });
});
