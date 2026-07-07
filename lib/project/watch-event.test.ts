import { describe, test, expect } from "bun:test";
import {
  classifyTransition,
  buildWatchEvent,
  type CompTransition,
  type CompState,
  type WatchSubject,
} from "./watch-event";

const SUBJECT: WatchSubject = { beds: 3, baths: 2, sqft: 2_000, price: 500_000 };
const STATE: CompState = {
  address_key: "123MAINST:33914",
  lat: 26.5,
  lon: -81.9,
  beds: 4,
  baths: 2,
  sqft: 2_000,
  list_price: 440_000,
};

function tx(over: Partial<CompTransition>): CompTransition {
  return {
    from_state: "active",
    to_state: "active",
    at: "2026-07-06",
    price: 440_000,
    price_delta: null,
    sold_date: null,
    sold_price: null,
    ...over,
  };
}

describe("classifyTransition — sold wins, then new-listing, then price-cut", () => {
  test("to_state sold + sold_date → nearby_sale", () => {
    expect(classifyTransition(tx({ to_state: "sold", sold_date: "2026-05-14" }))).toBe(
      "nearby_sale",
    );
  });
  test("sold WITHOUT a real sold_date is NOT a sale (never fires on a holding guess)", () => {
    expect(classifyTransition(tx({ to_state: "sold", sold_date: null }))).toBeNull();
  });
  test("from_state null → nearby_new_listing", () => {
    expect(classifyTransition(tx({ from_state: null }))).toBe("nearby_new_listing");
  });
  test("negative price_delta → nearby_price_cut", () => {
    expect(classifyTransition(tx({ price_delta: -20_000 }))).toBe("nearby_price_cut");
  });
  test("a plain unchanged row is nothing", () => {
    expect(classifyTransition(tx({}))).toBeNull();
  });
});

describe("buildWatchEvent — gating", () => {
  test("outside the radius → null", () => {
    expect(buildWatchEvent(SUBJECT, tx({ from_state: null }), STATE, 0.9, 0.5, 2)).toBeNull();
  });

  test("new listing inside radius → neutral-scored event, address_key as the internal key", () => {
    const e = buildWatchEvent(SUBJECT, tx({ from_state: null }), STATE, 0.3, 0.5, 2);
    expect(e).not.toBeNull();
    expect(e!.event_type).toBe("nearby_new_listing");
    expect(e!.entity_brand_key).toBe("123MAINST:33914");
    expect(e!.source).toBe("listing_lifecycle_lake");
    expect(e!.notify_user).toBe(true);
    expect(e!.brand_tier).toBe(0);
    expect(e!.event_date).toBe("2026-07-06");
    expect(e!.ai_summary).toContain("New listing 0.3 mi away");
  });

  test("price cut BELOW the threshold is dropped", () => {
    // prior 445k → now 440k = 1.1% cut, threshold 2% → null
    const e = buildWatchEvent(
      SUBJECT,
      tx({ price: 440_000, price_delta: -5_000 }),
      STATE,
      0.2,
      0.5,
      2,
    );
    expect(e).toBeNull();
  });

  test("price cut ABOVE the threshold fires, dated to the transition day", () => {
    // prior 460k → now 440k = 4.3% cut, threshold 2%
    const e = buildWatchEvent(
      SUBJECT,
      tx({ price: 440_000, price_delta: -20_000 }),
      STATE,
      0.2,
      0.5,
      2,
    );
    expect(e).not.toBeNull();
    expect(e!.event_type).toBe("nearby_price_cut");
    expect(e!.ai_summary).toContain("Price cut");
  });

  test("sale uses sold_date as the event_date and sold_price in the copy", () => {
    const e = buildWatchEvent(
      SUBJECT,
      tx({ to_state: "sold", sold_date: "2026-05-14", sold_price: 435_000 }),
      STATE,
      0.5,
      0.5,
      2,
    );
    expect(e).not.toBeNull();
    expect(e!.event_type).toBe("nearby_sale");
    expect(e!.event_date).toBe("2026-05-14");
    expect(e!.ai_summary).toContain("sold on 05/14/2026");
  });
});
