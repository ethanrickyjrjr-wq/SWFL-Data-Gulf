import { test, expect, mock, afterAll } from "bun:test";

interface FakeStatsRow {
  price_cuts_30d: number;
  price_raises_30d: number;
  new_holdings_30d: number;
  sales_30d: number;
  new_listings_30d: number;
  price_cuts_90d: number;
  price_raises_90d: number;
  new_holdings_90d: number;
  sales_90d: number;
  new_listings_90d: number;
  latest_at: string;
}

function makeChain(row: FakeStatsRow | null) {
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.is = () => chain;
  chain.maybeSingle = async () => ({ data: row, error: null });
  return chain;
}

let rowForNextCall: FakeStatsRow | null = null;
const realServiceRole = await import("@/utils/supabase/service-role");
afterAll(() => {
  mock.module("@/utils/supabase/service-role", () => realServiceRole);
});
mock.module("@/utils/supabase/service-role", () => ({
  ...realServiceRole,
  createServiceRoleClientUntyped: () => ({
    schema: () => ({ from: () => ({ select: () => makeChain(rowForNextCall) }) }),
  }),
}));

const { loadLifecycleDigest } = await import("./market-context");

test("loadLifecycleDigest prefers the 30-day window when it has signal", async () => {
  rowForNextCall = {
    price_cuts_30d: 4,
    price_raises_30d: 0,
    new_holdings_30d: 12,
    sales_30d: 1,
    new_listings_30d: 6,
    price_cuts_90d: 10,
    price_raises_90d: 1,
    new_holdings_90d: 30,
    sales_90d: 3,
    new_listings_90d: 15,
    latest_at: "2026-07-01",
  };
  const fig = await loadLifecycleDigest({ kind: "zip", value: "33928" });
  expect(fig?.value).toContain("4 price cuts");
  expect(fig?.label).toContain("last 30 days");
});

test("loadLifecycleDigest falls back to the 90-day window when 30d is all zero", async () => {
  rowForNextCall = {
    price_cuts_30d: 0,
    price_raises_30d: 0,
    new_holdings_30d: 0,
    sales_30d: 0,
    new_listings_30d: 0,
    price_cuts_90d: 2,
    price_raises_90d: 0,
    new_holdings_90d: 5,
    sales_90d: 1,
    new_listings_90d: 3,
    latest_at: "2026-07-01",
  };
  const fig = await loadLifecycleDigest({ kind: "zip", value: "33928" });
  expect(fig?.value).toContain("2 price cuts");
  expect(fig?.label).toContain("last 90 days");
});

test("loadLifecycleDigest returns null when both windows are all-zero", async () => {
  rowForNextCall = {
    price_cuts_30d: 0,
    price_raises_30d: 0,
    new_holdings_30d: 0,
    sales_30d: 0,
    new_listings_30d: 0,
    price_cuts_90d: 0,
    price_raises_90d: 0,
    new_holdings_90d: 0,
    sales_90d: 0,
    new_listings_90d: 0,
    latest_at: "2026-07-01",
  };
  expect(await loadLifecycleDigest({ kind: "zip", value: "33928" })).toBeNull();
});

test("loadLifecycleDigest returns null on no row (out-of-scope county, e.g. Hendry)", async () => {
  rowForNextCall = null;
  expect(await loadLifecycleDigest({ kind: "county", value: "Hendry" })).toBeNull();
});
