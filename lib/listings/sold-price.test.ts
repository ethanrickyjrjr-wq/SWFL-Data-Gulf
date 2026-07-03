import { describe, expect, test } from "bun:test";
import { resolveSoldPrice } from "./sold-price";

const noFetch = { fetchSold: () => Promise.reject(new Error("must not be called")) };

describe("resolveSoldPrice — lane 1: lake sold price", () => {
  test("nonzero lake sold price wins, no live call", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 14_800_000, soldDate: "2026-06-15", lastListPrice: 15_000_000 },
      noFetch,
    );
    expect(out).toEqual({
      kind: "sold",
      value: 14_800_000,
      asOf: "06/15/2026",
      source: "SWFL Data Gulf",
    });
  });

  test("a 0 sold price is MISSING, never a value", async () => {
    const out = await resolveSoldPrice({ soldPrice: 0, lastListPrice: 500_000 }, noFetch);
    expect(out?.kind).toBe("last_list");
  });
});

describe("resolveSoldPrice — lane 2: recorded event lookup", () => {
  test("0 in lake + propertyId → recorded event fills the price", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 0, propertyId: "M5493101642", lastListPrice: 500_000 },
      { fetchSold: async () => ({ soldPrice: 415_000, soldDate: "2026-05-12" }) },
    );
    expect(out).toEqual({
      kind: "sold",
      value: 415_000,
      asOf: "05/12/2026",
      source: "Public record",
    });
  });

  test("lookup miss falls to last list with the disclosure", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: null, propertyId: "M1", lastListPrice: 500_000, lastListDate: "2026-04-01" },
      { fetchSold: async () => null },
    );
    expect(out).toEqual({
      kind: "last_list",
      value: 500_000,
      asOf: "04/01/2026",
      source: "SWFL Data Gulf",
      disclosure: "Last listed at $500,000; closing price not yet recorded.",
    });
  });

  test("a 0-price recorded event is also MISSING", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 0, propertyId: "M1", lastListPrice: 500_000 },
      { fetchSold: async () => ({ soldPrice: 0, soldDate: "2026-05-12" }) },
    );
    expect(out?.kind).toBe("last_list");
  });
});

describe("resolveSoldPrice — lane 3: sold, price pending", () => {
  test("held sold date + 0 price → sold_price_pending with the confirmed date", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 0, soldDate: "2026-07-01", lastListPrice: 8_999_000 },
      noFetch,
    );
    expect(out).toEqual({
      kind: "sold_price_pending",
      value: 8_999_000,
      asOf: "07/01/2026",
      source: "SWFL Data Gulf",
      disclosure:
        "Sold — confirmed 07/01/2026. Closing price not yet in the county record; last listed at $8,999,000.",
    });
  });

  test("live lookup still wins over pending when it recovers a real price", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 0, soldDate: "2026-07-01", propertyId: "M1", lastListPrice: 8_999_000 },
      { fetchSold: async () => ({ soldPrice: 8_100_000, soldDate: "2026-07-01" }) },
    );
    expect(out?.kind).toBe("sold");
    expect(out?.value).toBe(8_100_000);
  });

  test("sold date but no positive list price → null, never a bare sold-with-no-number", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 0, soldDate: "2026-07-01", lastListPrice: 0 },
      noFetch,
    );
    expect(out).toBeNull();
  });

  test("unparseable sold date degrades to plain last_list", async () => {
    const out = await resolveSoldPrice(
      { soldPrice: 0, soldDate: "not-a-date", lastListPrice: 500_000 },
      noFetch,
    );
    expect(out?.kind).toBe("last_list");
  });
});

describe("resolveSoldPrice — never 0, never invented", () => {
  test("nothing resolvable → null (caller omits the slot)", async () => {
    const out = await resolveSoldPrice({ soldPrice: 0, lastListPrice: 0 }, noFetch);
    expect(out).toBeNull();
  });

  test("negative/NaN prices are missing", async () => {
    const out = await resolveSoldPrice({ soldPrice: -5, lastListPrice: NaN }, noFetch);
    expect(out).toBeNull();
  });

  test("no propertyId → no live call, straight to last list", async () => {
    const out = await resolveSoldPrice({ soldPrice: null, lastListPrice: 100_000 }, noFetch);
    expect(out?.kind).toBe("last_list");
  });
});
