// lib/listings/listing-events.test.ts
//
// Every test is NAMED FOR THE TRAP it prevents. All six traps were MEASURED live
// 08/04/2026 on data_lake.steadyapi_listing_events_v (235,383 events / 17,859 properties)
// and four of them CONTRADICT the 08/02 capability census.

import { describe, expect, test } from "bun:test";
import {
  LISTING_EVENTS_COLUMNS,
  priceCutHistory,
  saleEvents,
  summarizeListingEvents,
  type ListingEventRow,
} from "./listing-events";

function ev(over: Partial<ListingEventRow> = {}): ListingEventRow {
  return {
    property_id: "2990496617",
    event_ordinal: 1,
    event_name: "Price Changed",
    is_rental: false,
    event_date_raw: "2026-03-08",
    event_date: "2026-03-08",
    price: 899900,
    price_is_zero_sentinel: false,
    price_change: -49100,
    price_change_pct: null,
    price_change_pct_raw: null,
    price_change_pct_conflict: false,
    price_sqft: 491.48,
    days_after_listed: null,
    source_name: "Naples",
    listing_id: "2990496617",
    list_price: 899900,
    listing_status: "off_market",
    list_date: "2026-01-21T17:30:46Z",
    last_status_change_date: "2026-05-12T09:36:52Z",
    last_update_date: "2026-03-08T14:40:03Z",
    ...over,
  };
}

describe("TRAP 4 — rent events share the array with sale events (17,022 of them)", () => {
  test("a monthly RENT never enters the sale-event set", () => {
    // The failure: a $7,500/mo rental 'Listed for rent' price averaged into sale prices.
    const rows = [
      ev({ event_name: "Listed", price: 888000, is_rental: false }),
      ev({ event_name: "Listed for rent", price: 7500, is_rental: true }),
    ];
    const sales = saleEvents(rows);
    expect(sales).toHaveLength(1);
    expect(sales[0].price).toBe(888000);
  });
});

describe("TRAP 3 — price 0 is a SENTINEL (45.9% of 'Listing removed')", () => {
  test("a zero-price event reports NO price, and says the sentinel fired", () => {
    const out = summarizeListingEvents([
      ev({ event_name: "Listing removed", price: null, price_is_zero_sentinel: true }),
    ]);
    expect(out.events[0].price).toBeNull();
    expect(out.events[0].priceWasZeroSentinel).toBe(true);
  });

  test("price_change KEEPS its zero — there, zero means 'no change' and is real", () => {
    const out = summarizeListingEvents([ev({ price_change: 0 })]);
    expect(out.events[0].priceChange).toBe(0);
  });
});

describe("TRAP 1 — days_after_listed is the STRING '111 days', never a number", () => {
  test("the parsed integer is used and the human string never reaches a reader", () => {
    const out = summarizeListingEvents([ev({ days_after_listed: 111 })]);
    expect(out.events[0].daysAfterListed).toBe(111);
    expect(JSON.stringify(out)).not.toContain("111 days");
  });
});

describe("TRAP 6 — dirty date floor down to 1800-01-01", () => {
  test("an out-of-range date renders nothing rather than a fabricated one", () => {
    const out = summarizeListingEvents([ev({ event_date: null, event_date_raw: "1800-01-01" })]);
    expect(out.events[0].dateLabel).toBeNull();
    expect(JSON.stringify(out)).not.toContain("1800");
  });

  test("a real date renders MM/DD/YYYY (rule 2)", () => {
    expect(summarizeListingEvents([ev()]).events[0].dateLabel).toBe("03/08/2026");
  });
});

describe("PRICE CUTS — the actual product signal", () => {
  test("only real DROPS count as cuts; increases and no-changes do not", () => {
    const cuts = priceCutHistory([
      ev({ event_ordinal: 1, price_change: -49100, event_date: "2026-03-08" }),
      ev({ event_ordinal: 2, price_change: 15000, event_date: "2026-02-01" }),
      ev({ event_ordinal: 3, price_change: 0, event_date: "2026-01-15" }),
    ]);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].amount).toBe(49100);
  });

  test("a RENT price drop is not a listing price cut", () => {
    expect(priceCutHistory([ev({ is_rental: true, price_change: -200 })])).toHaveLength(0);
  });

  test("total cut and count come off the real events, newest first", () => {
    const out = summarizeListingEvents([
      ev({ event_ordinal: 1, price_change: -10000, event_date: "2026-01-01" }),
      ev({ event_ordinal: 2, price_change: -5000, event_date: "2026-03-01" }),
    ]);
    expect(out.priceCutCount).toBe(2);
    expect(out.totalPriceCut).toBe(15000);
    expect(out.events[0].dateLabel).toBe("03/01/2026");
  });
});

describe("TRAP: a null listing_id is NOT missing data", () => {
  test("a Public Record event is kept and labelled, not discarded as broken", () => {
    // listing{} is null on exactly 31,217 events and source_name='Public Record' on
    // exactly 31,217 — deed records, not board listings.
    const out = summarizeListingEvents([
      ev({ listing_id: null, source_name: "Public Record", event_name: "Sold" }),
    ]);
    expect(out.events).toHaveLength(1);
    expect(out.events[0].fromPublicRecord).toBe(true);
  });

  test("a board-sourced event is not marked public record", () => {
    expect(summarizeListingEvents([ev()]).events[0].fromPublicRecord).toBe(false);
  });
});

describe("TRAP 2 — the vendor's percentage is SIGNED TEXT, and it can contradict its own amount", () => {
  // The bug this exists to prevent, found live 08/04/2026: the view's first cut stripped only
  // '%', so "+31.24%" never matched and the column silently held CUTS ONLY — 16,099 of 44,896
  // parsed, every survivor negative. A reader of that column would have seen a market in which
  // asking prices never rise. Both signs now parse (42,633), and of the 6,488 events carrying
  // both a non-zero amount and a percentage, 183 DISAGREE IN SIGN — the view NULLs those and
  // sets price_change_pct_conflict, so a contradictory pair can never reach a caller.
  test("a price INCREASE keeps its positive percentage", () => {
    const [e] = summarizeListingEvents([
      ev({ event_name: "Price Changed", price_change: 25000, price_change_pct: 31.24 }),
    ]).events;
    expect(e.priceChangePct).toBe(31.24);
    expect(e.priceChangePctRefused).toBe(false);
  });

  test("a refused (sign-contradicting) percentage reads as ABSENT, not as a figure", () => {
    // Live shape: price 140,000 / price_change -50,000 / "+154.55%".
    const [e] = summarizeListingEvents([
      ev({
        price: 140000,
        price_change: -50000,
        price_change_pct: null,
        price_change_pct_conflict: true,
      }),
    ]).events;
    expect(e.priceChangePct).toBeNull();
    expect(e.priceChangePctRefused).toBe(true);
  });

  test("a refused percentage does NOT suppress the cut itself — the amount is the trustworthy field", () => {
    const cuts = priceCutHistory([
      ev({ price_change: -50000, price_change_pct: null, price_change_pct_conflict: true }),
    ]);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].amount).toBe(50000);
    expect(cuts[0].pct).toBeNull();
  });

  test("the view column is actually selected — a column we never ask for is a guard we never get", () => {
    expect(LISTING_EVENTS_COLUMNS).toContain("price_change_pct_conflict");
  });
});

describe("TRUNCATION — a partial history must never be summarised as a complete one", () => {
  // Measured live 08/04/2026: the busiest property carries 357 events and the next 328, both
  // ABOVE the row cap the module shipped with (200) — and the fetch had no ORDER BY, so which
  // 200 came back was arbitrary. The module comment claimed "busiest observed histories are
  // well under this". They are not. A `totalPriceCut` summed over an arbitrary subset is a
  // fabricated figure of exactly the kind the $0-sentinel rule exists to prevent.
  const cuts = [
    ev({ event_ordinal: 1, event_date: "2026-05-01", price_change: -10000 }),
    ev({ event_ordinal: 2, event_date: "2026-06-01", price_change: -5000 }),
  ];

  test("a COMPLETE history still reports a total", () => {
    const out = summarizeListingEvents(cuts);
    expect(out.truncated).toBe(false);
    expect(out.totalPriceCut).toBe(15000);
  });

  test("a TRUNCATED history reports the cuts it holds but REFUSES to total them", () => {
    const out = summarizeListingEvents(cuts, { truncated: true });
    expect(out.truncated).toBe(true);
    expect(out.priceCuts).toHaveLength(2);
    expect(out.priceCutCount).toBe(2);
    expect(out.totalPriceCut).toBeNull();
  });
});

describe("CYCLE SCOPE — cuts from DIFFERENT listings are not one number", () => {
  // Measured live 08/04/2026 on 3970 NE 68th Ave, 34120 (Collier): ONE address, 357 events,
  // **11 distinct listing_ids across 3 boards spanning 2010-2026**, 291 cuts. Summed blindly
  // that is "$18,471,297 in price cuts" on a single house — every component real, the total
  // meaningless. A seller asks "how far has THIS listing come down", not "what happened over
  // sixteen years and eleven agents".
  const twoCycles = [
    ev({ event_ordinal: 1, listing_id: "L1", event_date: "2019-04-01", price_change: -20000 }),
    ev({ event_ordinal: 2, listing_id: "L2", event_date: "2026-06-01", price_change: -15000 }),
  ];

  test("cuts inside ONE listing cycle still total", () => {
    const out = summarizeListingEvents([
      ev({ event_ordinal: 1, listing_id: "L2", event_date: "2026-05-01", price_change: -20000 }),
      ev({ event_ordinal: 2, listing_id: "L2", event_date: "2026-06-01", price_change: -15000 }),
    ]);
    expect(out.listingCycleCount).toBe(1);
    expect(out.totalPriceCut).toBe(35000);
  });

  test("cuts spanning MORE THAN ONE listing cycle report the count and REFUSE the total", () => {
    const out = summarizeListingEvents(twoCycles);
    expect(out.listingCycleCount).toBe(2);
    expect(out.priceCutCount).toBe(2);
    expect(out.totalPriceCut).toBeNull();
  });

  test("public-record events carry no listing and never inflate the cycle count", () => {
    const out = summarizeListingEvents([
      ev({ event_ordinal: 1, listing_id: "L2", event_date: "2026-05-01", price_change: -20000 }),
      ev({
        event_ordinal: 2,
        listing_id: null,
        source_name: "Public Record",
        event_date: "2020-01-01",
        price_change: null,
      }),
    ]);
    expect(out.listingCycleCount).toBe(1);
    expect(out.totalPriceCut).toBe(20000);
  });
});

describe("SCOPE + EMPTY", () => {
  test("the summary carries the listing-scope caveat", () => {
    expect(summarizeListingEvents([ev()]).scopeNote.toLowerCase()).toContain("this property");
  });

  test("empty in, empty out — never throws", () => {
    const out = summarizeListingEvents([]);
    expect(out.events).toEqual([]);
    expect(out.priceCutCount).toBe(0);
    expect(out.totalPriceCut).toBeNull();
  });
});
