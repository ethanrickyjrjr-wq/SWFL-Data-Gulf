// lib/deliverable/recipes/just-sold.test.ts
//
// The invariants of R5 · JUST SOLD. Every one of these is a bug that was live at
// some point on 07/13/2026, or a trap the live vendor probe actually laid.
//
// Offline by construction: these test the PURE decision functions (which comp is a
// real sale, what may fill the close, which cells render). The network lives in
// buildJustSold's one compsForAddress call and is not exercised here.

import { describe, expect, it } from "bun:test";
import {
  buildJustSoldSpec,
  closeFrom,
  realSaleComps,
  statRows,
  subjectRow,
  withSubjectRowFacts,
} from "./just-sold";
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

describe("statRows — THE PAIRING RULE (found by looking at the render)", () => {
  const active: ListingFacts = {
    address: "326 Shore Dr",
    price: "$595,000", // the ASK — the house has not sold
    beds: "3",
    baths: "3.5",
    sqft: "2847",
    photos: [],
    sourceUrl: "x",
  };

  it("with NO close, the list price does NOT render — an ask alone under a JUST SOLD kicker reads as the close", () => {
    // StatsBlock drops empty cells on emailRender and centers a LONE survivor at
    // hero scale. With only "List Price" left, the email said the house closed at
    // its asking price — every word true, the page still lying.
    const [sale] = statRows(active, null);
    expect(sale.map((c) => c.value)).toEqual(["", "", ""]);
    expect(sale.map((c) => c.label)).toEqual(["Sale Price", "List Price", "List-to-Sale"]);
  });

  it("NEVER puts the list price in the Sale Price cell", () => {
    const [sale] = statRows(active, null);
    expect(sale.find((c) => c.label === "Sale Price")?.value).toBe("");
    expect(sale.map((c) => c.value).join()).not.toContain("595,000");
  });

  it("with a close, the sale row fills and list-to-sale is computed from TWO sourced numbers", () => {
    const [sale] = statRows(active, { price: 613_850, date: "2026-05-20" });
    expect(sale[0]).toEqual({ value: "$613,850", label: "Sale Price" });
    expect(sale[1]).toEqual({ value: "$595,000", label: "List Price" });
    expect(sale[2]).toEqual({ value: "103.2%", label: "List-to-Sale" }); // 613850/595000
  });

  it("with a close but NO ask (the REAL sold-house case), the whole row stays open — the hero already carries the close", () => {
    // The for-sale feed cannot see a sold home, so `facts.price` is absent. Rendering
    // the lone "Sale Price" cell repeated the hero's own $300,000 directly beneath
    // it, at the same scale. A comparison row with nothing to compare is not a row.
    const sold: ListingFacts = { address: "330 Shore Dr", photos: [], sourceUrl: "x" };
    const [sale] = statRows(sold, { price: 300_000, date: "2025-08-29" });
    expect(sale.map((c) => c.value)).toEqual(["", "", ""]); // never back-solved, never duplicated
  });

  it("an unsourced spec is an OPEN SLOT, never a zero", () => {
    const bare: ListingFacts = { address: "x", photos: [], sourceUrl: "x" };
    const [, home] = statRows(bare, null);
    expect(home.map((c) => c.value)).toEqual(["", "", ""]);
    expect(home.map((c) => c.value).join()).not.toContain("0");
  });

  it("formats sqft with a comma", () => {
    const [, home] = statRows(active, null);
    expect(home[2]).toEqual({ value: "2,847", label: "Sq Ft" });
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
