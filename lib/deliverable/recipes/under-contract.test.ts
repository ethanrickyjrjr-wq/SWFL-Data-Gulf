// lib/deliverable/recipes/under-contract.test.ts
//
// R4 · UNDER CONTRACT. Every test here drives a PURE function with fixture data —
// ZERO live calls, ZERO clock dependence.
//
// ── THIS SUITE WAS REWRITTEN AFTER A REFUTATION ──────────────────────────────
//
// The previous suite was 35/35 GREEN ON A WRONG ORACLE. It asserted, at line 387:
//
//     expect(offerClaims("This home went under contract after 75 days on the
//                         market.")).toEqual([])
//
// …and treated that as PASSING — pinning the exact fabricated interval that shipped
// to the rendered email as correct behavior. A green suite over a wrong oracle is
// worse than a red one: it certifies the lie.
//
// The oracle is now: NO SOURCE HOLDS THE DAYS-TO-CONTRACT INTERVAL. Not the vendor
// (no such field on any of the 18 endpoints), not the tax history (no Pending event,
// `days_after_listed` null on every row), not our lake (`median_dom` is an AREA
// median over the SOLD cohort). Therefore any day-count about this home, any ordering
// of its events, and any speed characterization is INVENTED — and the tests below
// exist to make that fabrication impossible to ship again.
//
// The fixtures are VERBATIM live vendor bodies, captured 07/13/2026:
//   • 326 Shore Dr, Fort Myers 33905 — property_id 6951062705
//   • its ZIP's median days on market (72) from the housing-swfl brain
import { describe, expect, it } from "bun:test";
import {
  buildUnderContractGrid,
  fallbackNote,
  formatListDate,
  inventedAttributes,
  offerClaims,
  parseActiveListDate,
  proseViolations,
  timingClaims,
  type MarketTiming,
} from "./under-contract";
import { renderEmailDocHtml } from "@/lib/email/render-email-doc";
import { DEFAULT_GLOBAL_STYLE } from "@/lib/email/doc/default-docs";
import type { EmailDoc, StatItem } from "@/lib/email/doc/types";
import type { ListingFacts } from "@/lib/email/listing-scrape";

/** VERBATIM shape of /property-tax-history for 326 Shore Dr (trimmed to the fields
 *  the parser reads). The current for-sale cycle sits alongside two OLD sold
 *  listings — the parser must never confuse a 2023 sale's list date for today's. */
const TAX_HISTORY = {
  body: {
    property_history: [
      {
        date: "2026-07-01",
        event_name: "Price Changed",
        listing: { status: "for_sale", list_date: "2026-04-29T17:46:36Z" },
      },
      {
        date: "2026-04-29",
        event_name: "Listed",
        listing: { status: "for_sale", list_date: "2026-04-29T17:46:36Z" },
      },
      {
        date: "2023-03-17",
        event_name: "Sold",
        listing: { status: "sold", list_date: "2023-08-25T06:36:25Z" },
      },
      {
        date: "2020-11-01",
        event_name: "Listing removed",
        listing: { status: "off_market", list_date: "2020-08-02T20:52:24Z" },
      },
    ],
  },
};

/** The resolved subject, exactly as the dispatcher hands it to the builder. */
const FACTS: ListingFacts = {
  address: "326 Shore Dr, Fort Myers, FL, 33905",
  city: "Fort Myers",
  state: "FL",
  zip: "33905",
  price: "$595,000",
  beds: "3",
  baths: "3.5",
  sqft: "2847",
  lotSize: "0.26 ac",
  propertyType: "Residential",
  isNewConstruction: true,
  isPriceReduced: true,
  priceReduction: "$104,975",
  photos: ["https://example.test/photo.webp"],
  lat: 26.688788,
  lon: -81.805899,
  sourceUrl: "https://www.swfldatagulf.com",
};

const TIMING: MarketTiming = { areaDom: 72, zip: "33905", asOf: "06/29/2026" };
const LISTED_ON = "04/29/2026";

const BLANK_DOC: EmailDoc = { globalStyle: DEFAULT_GLOBAL_STYLE, blocks: [] };

const statsOf = (doc: EmailDoc): StatItem[] =>
  doc.blocks.flatMap((b) => (b.type === "stats" ? b.props.stats : []));
const cellFor = (doc: EmailDoc, label: string): StatItem | undefined =>
  statsOf(doc).find((s) => s.label === label);

const fullDoc = () =>
  buildUnderContractGrid({ facts: FACTS, current: BLANK_DOC, listedOn: LISTED_ON, timing: TIMING });

// ─────────────────────────────────────────────────────────────────────────────
// THE REGRESSION. These are the EXACT strings that shipped to the rendered email.
// ─────────────────────────────────────────────────────────────────────────────

/** Screenshot A — 326 Shore Dr, the canonical fixture. */
const REFUTED_A =
  "This home went under contract after 75 days on market, in line with the 72-day median for ZIP 33905. The seller had reduced the asking price by $104,975 before a contract was reached.";
/** Screenshot B — 14550 Carva Ln, the chart branch. */
const REFUTED_B =
  "The home went under contract after 45 days on the market. The current asking price had been adjusted by $4,910 before the contract was accepted.";
/** The OLD deterministic fallback — it fabricated BY CONSTRUCTION, on the
 *  guaranteed-on-API-failure path. */
const REFUTED_FALLBACK =
  "It went under contract after 45 days on the market - 27 days quicker than the 72-day median for ZIP 33905.";

describe("THE REFUTATION — every sentence that actually shipped is now blocked", () => {
  it("blocks the canonical fabricated interval + the invented event ordering", () => {
    // The old suite proved offerClaims returns [] here and called that a PASS. It
    // does return [] — the guard is narrow BY DESIGN. The ship gate is
    // proseViolations, and THAT must reject it.
    expect(offerClaims(REFUTED_A)).toEqual([]); // still narrow — not the gate
    expect(timingClaims(REFUTED_A).length).toBeGreaterThan(0);
    expect(proseViolations(REFUTED_A, "")).not.toEqual([]); // THE GATE
  });

  it("blocks the chart-branch fabrication", () => {
    expect(timingClaims(REFUTED_B).length).toBeGreaterThan(0);
    expect(proseViolations(REFUTED_B, "")).not.toEqual([]);
  });

  it("blocks the OLD deterministic fallback — the path that lied on every API failure", () => {
    expect(timingClaims(REFUTED_FALLBACK).length).toBeGreaterThan(0);
  });

  it("blocks the interval alone, stripped of everything else", () => {
    // The single sentence the old test at :387 blessed.
    expect(timingClaims("This home went under contract after 75 days on the market.")).not.toEqual(
      [],
    );
  });
});

describe("timingClaims — INVENTION CLASS 3: a claim about time", () => {
  it("catches any duration, numeric or spelled out", () => {
    expect(timingClaims("It was listed for 75 days.")).not.toEqual([]);
    expect(timingClaims("Against a 72-day median.")).not.toEqual([]);
    expect(timingClaims("It found a buyer in three weeks.")).not.toEqual([]);
    expect(timingClaims("On the market barely a month.")).not.toEqual([]);
  });

  it("catches days-on-market phrasing in any form", () => {
    expect(timingClaims("Its days on market tell the story.")).not.toEqual([]);
    expect(timingClaims("Days to contract: well under the norm.")).not.toEqual([]);
    expect(timingClaims("Its time on the market was notable.")).not.toEqual([]);
  });

  it("catches an ORDERING of events we do not hold — the price cut vs the contract", () => {
    expect(timingClaims("The seller cut the price before a contract was reached.")).not.toEqual([]);
    expect(timingClaims("A contract was accepted soon after.")).not.toEqual([]);
    expect(timingClaims("Interest picked up after the price cut.")).not.toEqual([]);
    expect(timingClaims("The reduction drew a buyer.")).not.toEqual([]);
  });

  it("catches SPEED characterization — ours to state, and we never state it", () => {
    expect(timingClaims("This one went quickly.")).not.toEqual([]);
    expect(timingClaims("It didn't last.")).not.toEqual([]);
    expect(timingClaims("It was snapped up.")).not.toEqual([]);
    expect(timingClaims("A slow burn, then a contract.")).not.toEqual([]);
  });

  it("catches COMPARING this home to the area — a comparative claim is a factual claim", () => {
    expect(timingClaims("That is in line with the area median.")).not.toEqual([]);
    expect(timingClaims("It beat the typical home in this ZIP.")).not.toEqual([]);
    expect(timingClaims("The typical home here needs 72 days.")).not.toEqual([]);
  });

  it("PASSES an honest transaction paragraph — the guard is sharp, not merely loud", () => {
    const good =
      "This home is under contract. It is new construction, and the asking price had come " +
      "down by $104,975 from the original ask. The seller is still reviewing backup offers, " +
      "so if this one was on your list, it is worth putting your position on paper now.";
    expect(timingClaims(good)).toEqual([]);
    expect(proseViolations(good, "NEW CONSTRUCTION cut by $104,975")).toEqual([]);
  });
});

describe("parseActiveListDate — the list date /search does not carry", () => {
  it("reads the ACTIVE for-sale listing's list date", () => {
    expect(parseActiveListDate(TAX_HISTORY)).toBe("2026-04-29T17:46:36Z");
  });

  it("never mistakes an old SOLD listing's list date for the current cycle", () => {
    const onlySold = {
      body: {
        property_history: [
          { event_name: "Sold", listing: { status: "sold", list_date: "2023-08-25T06:36:25Z" } },
        ],
      },
    };
    expect(parseActiveListDate(onlySold)).toBeNull();
  });

  it("returns null on a body with no history (never throws, never invents)", () => {
    expect(parseActiveListDate({})).toBeNull();
    expect(parseActiveListDate(null)).toBeNull();
    expect(parseActiveListDate({ body: { property_history: "nope" } })).toBeNull();
  });
});

describe("formatListDate — a DATE, and deliberately NOT an interval", () => {
  it("renders the vendor's list date as MM/DD/YYYY (Rule 5), in UTC", () => {
    expect(formatListDate("2026-04-29T17:46:36Z")).toBe("04/29/2026");
  });

  it("null in → null out (→ an open slot, never a zero)", () => {
    expect(formatListDate(null)).toBeNull();
    expect(formatListDate("not a date")).toBeNull();
  });

  // The whole refutation in one assertion: the OLD code did `now - listDate` and
  // called the result "days on market", then narrated it as "went under contract
  // after N days". There is no subtraction anywhere in this module any more.
  it("does not expose any elapsed-days helper to be re-narrated as an interval", async () => {
    const mod = (await import("./under-contract")) as Record<string, unknown>;
    expect(mod.daysOnMarket).toBeUndefined();
    expect(mod.compareDom).toBeUndefined();
    expect(mod.domChartSpec).toBeUndefined();
    expect(mod.domContext).toBeUndefined();
  });
});

describe("buildUnderContractGrid — the six answers, rendered", () => {
  it("leads with the PRICE, not a fabricated interval", () => {
    const hero = fullDoc().blocks.find((b) => b.type === "hero");
    expect(hero?.type === "hero" && hero.props.kicker).toBe("Under Contract");
    expect(hero?.type === "hero" && hero.props.value).toBe("$595,000");
    expect(hero?.type === "hero" && hero.props.label).toBe(FACTS.address);
  });

  it("states the LIST DATE — the one timing fact we hold", () => {
    expect(cellFor(fullDoc(), "Listed")?.value).toBe("04/29/2026");
  });

  it("states the ZIP's typical as an AREA fact, standing alone", () => {
    expect(cellFor(fullDoc(), "Typical Days in 33905")?.value).toBe("72");
  });

  it("sources every house cell from the resolved record — $/sqft is computed, not guessed", () => {
    const doc = fullDoc();
    expect(cellFor(doc, "List Price")?.value).toBe("$595,000");
    expect(cellFor(doc, "Beds")?.value).toBe("3");
    expect(cellFor(doc, "Baths")?.value).toBe("3.5");
    expect(cellFor(doc, "Sq Ft")?.value).toBe("2,847");
    expect(cellFor(doc, "$/Sq Ft")?.value).toBe("$209"); // 595000 / 2847
    expect(cellFor(doc, "Lot")?.value).toBe("0.26 ac");
    expect(cellFor(doc, "Type")?.value).toBe("Residential");
  });

  it("asks for the backup offer — that is the whole point of this email", () => {
    const btn = fullDoc().blocks.find((b) => b.type === "button");
    expect(btn?.type === "button" && btn.props.label).toBe("Submit a Backup Offer");
  });

  it("leaves the commentary slot EMPTY for the narrator (fillNarrative skips a filled one)", () => {
    const text = fullDoc().blocks.find((b) => b.type === "text");
    expect(text?.type === "text" && text.props.body).toBe("");
  });

  it("builds NO chart slot at all — a box that could only ever be empty is not built", () => {
    const chart = fullDoc().blocks.find((b) => b.type === "image" && b.props.kind === "chart");
    expect(chart).toBeUndefined();
  });
});

describe("DAYS TO CONTRACT — an OPEN SLOT *BY CONSTRUCTION*, not on failure", () => {
  // The number this email is nominally about is held by NO source — and by the AGENT,
  // who chose this recipe for their own listing. That is LANE 4. It is an open slot on
  // the richest possible input, not just on a miss.
  it("is an instruction even when EVERY other fact resolved", () => {
    const slot = cellFor(fullDoc(), "Days to Contract — type how long it took");
    expect(slot?.value).toBe(""); // NOT a number. NOT a zero.
    expect(cellFor(fullDoc(), "Days to Contract")).toBeUndefined(); // never a filled cell
  });

  it("the grid exposes NO WAY to fill it — there is no argument to pass", () => {
    // A regression guard on the TYPE: if someone adds a `daysToContract` opt, this
    // fails and they have to justify where the number came from.
    const opts = { facts: FACTS, current: BLANK_DOC, listedOn: LISTED_ON, timing: TIMING };
    expect(Object.keys(opts).sort()).toEqual(["current", "facts", "listedOn", "timing"]);
  });

  it("NEVER reaches the recipient — the instruction is a canvas affordance only", async () => {
    const html = await renderEmailDocHtml(fullDoc());
    expect(html).not.toContain("type how long it took");
    expect(html).not.toContain("Days to Contract");
    // …while the sourced facts DO ship.
    expect(html).toContain("$595,000");
    expect(html).toContain("04/29/2026");
    expect(html).toContain("72");
  });

  it("the SENT email contains no fabricated interval and no days-on-market claim", async () => {
    const html = await renderEmailDocHtml(fullDoc());
    expect(html).not.toMatch(/days?\s+on\s+(the\s+)?market/i);
    expect(html).not.toMatch(/went under contract after/i);
    expect(html).not.toMatch(/\b75\s*days?\b/i);
  });
});

describe("THE OPEN-SLOT CONTRACT — a gap is an invitation, never a zero", () => {
  /** Nothing timing-related resolved: no list date AND no ZIP median. */
  const blindDoc = () =>
    buildUnderContractGrid({ facts: FACTS, current: BLANK_DOC, listedOn: null, timing: null });

  it("an unsourced list date is an INSTRUCTION, never a 0", () => {
    const cells = statsOf(blindDoc());
    const slot = cells.find((c) => c.label.startsWith("Listed —"));
    expect(slot?.value).toBe("");
    expect(cells.some((c) => c.value === "0")).toBe(false);
  });

  it("an unsourced area median is an INSTRUCTION, never a fabricated benchmark", () => {
    const slot = statsOf(blindDoc()).find((c) => c.label.startsWith("Typical days on market"));
    expect(slot?.value).toBe("");
  });

  it("still leads with the price — the hero is never a naked kicker", () => {
    const hero = blindDoc().blocks.find((b) => b.type === "hero");
    expect(hero?.type === "hero" && hero.props.value).toBe("$595,000");
  });

  it("an unsourced spec is an instruction, and the sent email simply omits it", async () => {
    const bare: ListingFacts = {
      address: "1 Nowhere St, Fort Myers, FL, 33905",
      photos: [],
      sourceUrl: "https://www.swfldatagulf.com",
    };
    const doc = buildUnderContractGrid({
      facts: bare,
      current: BLANK_DOC,
      listedOn: null,
      timing: null,
    });
    // Every cell is an open slot on the canvas…
    expect(statsOf(doc).every((c) => c.value === "")).toBe(true);
    // …and NONE of them — nor an empty photo box — reaches the recipient.
    const html = await renderEmailDocHtml(doc);
    expect(html).not.toContain("type the bedroom count");
    expect(html).not.toContain("Beds");
    expect(html).not.toMatch(/>0</);
  });
});

describe("inventedAttributes — INVENTION CLASS 1: the class that is not a number", () => {
  // This guard exists because the SHARED narrator (authorListingNarrative) invented
  // "this three-story home" on these exact facts, live, 07/13/2026.
  const SOURCES = "STATUS: under contract. The vendor states this is NEW CONSTRUCTION.";

  it("catches the storey count the shared narrator actually invented", () => {
    const bad = "New construction on a quarter-acre lot, this three-story home is under contract.";
    expect(inventedAttributes(bad, SOURCES)).toContain("story");
  });

  it("catches the classic unsourced qualities — water, a pool, a view, a renovation", () => {
    expect(inventedAttributes("Waterfront living at its finest.", SOURCES)).toContain("waterfront");
    expect(inventedAttributes("The pool is heated.", SOURCES)).toContain("pool");
    const viewHits = inventedAttributes("Sweeping views of the gulf.", SOURCES);
    expect(viewHits).toContain("views");
    expect(viewHits).toContain("gulf");
    expect(inventedAttributes("Fully renovated in 2024.", SOURCES)).toContain("renovated");
  });

  it("ALLOWS an attribute the agent's own pasted description states (LANE 2)", () => {
    const withRemarks = `${SOURCES} THE AGENT'S OWN LISTING DESCRIPTION:\nDirect canal access with a private dock and a heated pool.`;
    expect(inventedAttributes("A canal-front home with a heated pool.", withRemarks)).toEqual([]);
  });
});

describe("offerClaims — INVENTION CLASS 2: a fabricated contract term", () => {
  it("catches the exact sentence the model actually produced", () => {
    expect(offerClaims("The seller accepted an offer at the current ask of $595,000.")).not.toEqual(
      [],
    );
  });

  it("catches over/under-ask and full-price claims", () => {
    expect(offerClaims("It went over asking.")).not.toEqual([]);
    expect(offerClaims("They took a full-price offer.")).not.toEqual([]);
    expect(offerClaims("An offer of $600,000 was accepted.")).not.toEqual([]);
  });

  it("ALLOWS the sourced price-cut sentence — that is the ASK's history, not the offer", () => {
    expect(offerClaims("The price was cut by $104,975 from the original asking price.")).toEqual(
      [],
    );
  });
});

describe("fallbackNote — deterministic, zero model, and it FABRICATES NOTHING", () => {
  // The old fallback emitted the lie BY CONSTRUCTION: every API failure shipped
  // "went under contract after 45 days… 27 days quicker than the 72-day median".
  it("passes its own ship gate — the guaranteed path can no longer lie", () => {
    expect(proseViolations(fallbackNote(FACTS), "")).toEqual([]);
    expect(timingClaims(fallbackNote(FACTS))).toEqual([]);
  });

  it("states the status, the sourced cut AMOUNT, and the ask — no interval, no ordering", () => {
    const note = fallbackNote(FACTS);
    expect(note).toContain("under contract");
    expect(note).toContain("$104,975"); // the vendor's reduced_amount
    expect(note).toContain("$595,000"); // the current ask
    expect(note).toContain("backup offers");
    expect(note).not.toMatch(/\bdays?\b/i);
    expect(note).not.toMatch(/before|after/i);
  });

  it("omits the price-cut sentence entirely when the vendor states no cut", () => {
    const note = fallbackNote({ ...FACTS, isPriceReduced: false, priceReduction: undefined });
    expect(note).not.toContain("$104,975");
    expect(note).toContain("under contract");
    expect(proseViolations(note, "")).toEqual([]);
  });

  it("asserts nothing about the house itself", () => {
    expect(inventedAttributes(fallbackNote(FACTS), "")).toEqual([]);
  });
});
