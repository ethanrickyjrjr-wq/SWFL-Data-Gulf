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
  dom_days: number | null;
  dom_is_floor: boolean | null;
  cdom_days: number | null;
  address_key: string | null;
  property_id: string | null;
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
  dom_days: 45,
  dom_is_floor: false,
  cdom_days: 45,
  address_key: "4100LAKEWOODBLVDF30:33914",
  property_id: "P123",
};

test("loadListingContext reads data_lake.listing_dom, never calls a live vendor API", async () => {
  rowsForNextCall = [SAMPLE_ROW];
  const ctx = await loadListingContext({ kind: "county", value: "Lee" }, new Date("2026-07-01"));
  expect(ctx.ranked).toHaveLength(1);
  expect(ctx.ranked[0].photoUrl).toBe("https://rdcpix.example/photo.jpg");
  expect(ctx.ranked[0].price).toBe(340000);
  expect(ctx.ranked[0].daysOnMarket).toBe(45); // from the view's dom_days, NOT the dead column
  expect(ctx.ranked[0].domIsFloor).toBe(false);
  expect(ctx.ranked[0].cdomDays).toBe(45);
  expect(ctx.figures.length).toBeGreaterThan(0);
});

test("loadListingContext degrades to empty context on zero rows — never throws", async () => {
  rowsForNextCall = [];
  const ctx = await loadListingContext({ kind: "county", value: "Hendry" }, new Date("2026-07-01"));
  expect(ctx.ranked).toEqual([]);
  expect(ctx.figures).toEqual([]);
});

// ── wave 1.5: photo enrichment (derived watermark-crop, one root) ────────────
// DYNAMIC import, matching this file's existing pattern (line 51): a static
// `import { enrichListingPhotos }` would hoist ABOVE the mock.module calls at
// the top of the file and break the supabase mocking.
const { enrichListingPhotos } = await import("./select");

test("enrichListingPhotos swaps photoUrl for the derived URL on top-ranked listings", async () => {
  const listings = [
    { id: "L1", photoUrl: "https://cdn.example.com/1.jpg" },
    { id: "L2", photoUrl: "https://cdn.example.com/2.jpg" },
  ] as Parameters<typeof enrichListingPhotos>[0];
  const out = await enrichListingPhotos(listings, async ({ listingId }) => {
    return `https://media.example.com/listing-photos/${listingId}-v1.jpg`;
  });
  expect(out[0].photoUrl).toBe("https://media.example.com/listing-photos/L1-v1.jpg");
  expect(out[1].photoUrl).toBe("https://media.example.com/listing-photos/L2-v1.jpg");
});

test("derive failure (null) keeps the ORIGINAL photo — degraded, never broken", async () => {
  const listings = [{ id: "L1", photoUrl: "https://cdn.example.com/1.jpg" }] as Parameters<
    typeof enrichListingPhotos
  >[0];
  const out = await enrichListingPhotos(listings, async () => null);
  expect(out[0].photoUrl).toBe("https://cdn.example.com/1.jpg");
});

test("listings without a photo are untouched, and enrichment caps at the top 5", async () => {
  const listings = Array.from({ length: 8 }, (_, i) => ({
    id: `L${i}`,
    photoUrl: i === 3 ? undefined : `https://cdn.example.com/${i}.jpg`,
  })) as Parameters<typeof enrichListingPhotos>[0];
  const derivedFor: string[] = [];
  await enrichListingPhotos(listings, async ({ listingId }) => {
    derivedFor.push(listingId);
    return `https://media.example.com/${listingId}.jpg`;
  });
  // top 5 slots, minus the photo-less one = 4 derive calls, none past index 4
  expect(derivedFor).toEqual(["L0", "L1", "L2", "L4"]);
});
