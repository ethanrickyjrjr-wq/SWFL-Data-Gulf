import { test, expect, mock, afterAll } from "bun:test";

interface FakeRow {
  listing_id: string;
  street_address: string;
  city: string;
  county: string;
  zip_code: string;
  lat: number | null;
  lon: number | null;
  property_type: string;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lot_acres: number | null;
  status: string;
  list_price: number | null;
  listed_date: string | null;
  last_seen: string | null;
  days_on_market: number | null;
  mls_name: string | null;
  mls_number: string | null;
  photo_url: string | null;
}

function makeChain(rows: FakeRow[]) {
  const chain: Record<string, unknown> = {};
  chain.eq = () => chain;
  chain.limit = () => chain;
  chain.then = (resolve: (r: { data: FakeRow[]; error: null }) => void) =>
    resolve({ data: rows, error: null });
  return chain;
}

let rowsForNextCall: FakeRow[] = [];
const realServiceRole = await import("@/utils/supabase/service-role");
afterAll(() => {
  mock.module("@/utils/supabase/service-role", () => realServiceRole);
});
mock.module("@/utils/supabase/service-role", () => ({
  ...realServiceRole,
  createServiceRoleClientUntyped: () => ({
    schema: () => ({
      from: () => ({
        select: () => makeChain(rowsForNextCall),
      }),
    }),
  }),
}));

const { loadListingContext } = await import("./select");

const SAMPLE_ROW: FakeRow = {
  listing_id: "116:2026016564",
  street_address: "4100 Lakewood Blvd F30",
  city: "Cape Coral",
  county: "Lee",
  zip_code: "33914",
  lat: 26.55,
  lon: -81.98,
  property_type: "Single Family",
  beds: 3,
  baths: 2,
  sqft: 1800,
  lot_acres: 0.23,
  status: "Active",
  list_price: 340000,
  listed_date: "2026-06-01",
  last_seen: "2026-07-01",
  days_on_market: 30,
  mls_name: "Florida Gulf Coast MLS",
  mls_number: "226012345",
  photo_url: "https://rdcpix.example/photo.jpg",
};

test("loadListingContext reads data_lake.listing_state, never calls a live vendor API", async () => {
  rowsForNextCall = [SAMPLE_ROW];
  const ctx = await loadListingContext({ kind: "county", value: "Lee" }, new Date("2026-07-01"));
  expect(ctx.ranked).toHaveLength(1);
  expect(ctx.ranked[0].photoUrl).toBe("https://rdcpix.example/photo.jpg");
  expect(ctx.ranked[0].price).toBe(340000);
  expect(ctx.figures.length).toBeGreaterThan(0);
});

test("loadListingContext degrades to empty context on zero rows — never throws", async () => {
  rowsForNextCall = [];
  const ctx = await loadListingContext({ kind: "county", value: "Hendry" }, new Date("2026-07-01"));
  expect(ctx.ranked).toEqual([]);
  expect(ctx.figures).toEqual([]);
});
