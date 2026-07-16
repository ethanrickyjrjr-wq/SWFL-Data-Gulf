// lib/listings/listed-date-write.test.ts
import { describe, expect, test } from "bun:test";
import { persistListedDate } from "./listed-date-write";

function fakeSb() {
  const calls: Record<string, unknown[]> = { update: [], eq: [], or: [] };
  const chain = {
    schema: (s: string) => ((calls.schema = [s]), chain),
    from: (t: string) => ((calls.from = [t]), chain),
    update: (v: unknown) => (calls.update.push(v), chain),
    eq: (c: string, v: unknown) => (calls.eq.push([c, v]), chain),
    or: (expr: string) => (calls.or.push(expr), Promise.resolve({ error: null })),
  };
  return { chain, calls };
}

describe("persistListedDate", () => {
  test("updates ONLY listed_date, keyed on the full identity, guarded null-or-older", async () => {
    const { chain, calls } = fakeSb();
    const ok = await persistListedDate(
      { sourceName: "api_feed", addressKey: "14977RIVERSEDGECTUNIT217:33908", saleOrRent: "sale" },
      "2026-05-15",
      { sb: chain as never },
    );
    expect(ok).toBe(true);
    expect(calls.schema).toEqual(["data_lake"]);
    expect(calls.from).toEqual(["listing_state"]);
    expect(calls.update).toEqual([{ listed_date: "2026-05-15" }]); // single column, ever
    expect(calls.eq).toEqual([
      ["source_name", "api_feed"],
      ["address_key", "14977RIVERSEDGECTUNIT217:33908"],
      ["sale_or_rent", "sale"],
    ]);
    expect(calls.or).toEqual(["listed_date.is.null,listed_date.lt.2026-05-15"]);
  });

  test("rejects a non-ISO date without touching the client", async () => {
    const { chain, calls } = fakeSb();
    expect(
      await persistListedDate(
        { sourceName: "api_feed", addressKey: "X:33908", saleOrRent: "sale" },
        "05/15/2026",
        { sb: chain as never },
      ),
    ).toBe(false);
    expect(calls.update).toEqual([]);
  });

  test("client error → false, never throws", async () => {
    const bad = {
      schema: () => bad,
      from: () => bad,
      update: () => bad,
      eq: () => bad,
      or: () => Promise.resolve({ error: { message: "boom" } }),
    };
    expect(
      await persistListedDate(
        { sourceName: "api_feed", addressKey: "X:33908", saleOrRent: "sale" },
        "2026-05-15",
        { sb: bad as never },
      ),
    ).toBe(false);
  });
});
