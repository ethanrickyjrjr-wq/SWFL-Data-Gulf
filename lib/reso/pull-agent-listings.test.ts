import { test, expect, mock } from "bun:test";

// Mock the ResoClient module so network never fires.
const mockGet = mock(async () => [
  {
    ListingKey: "K1",
    ListPrice: 400000,
    PostalCode: "33901",
    StandardStatus: "Active",
    LivingArea: 1800,
  },
  {
    ListingKey: "K2",
    ListPrice: 520000,
    ClosePrice: 510000,
    CloseDate: "2025-12-01",
    PostalCode: "33907",
    StandardStatus: "Closed",
    LivingArea: 2200,
  },
]);
mock.module("./client", () => ({
  ResoClient: class {
    get = mockGet;
  },
}));

const mockUpsert = mock(() => ({ error: null }));
const mockSupabase = {
  schema: () => ({ from: () => ({ upsert: mockUpsert }) }),
};

test("upserts fetched listings and returns count + zips", async () => {
  const { pullAgentListings } = await import("./pull-agent-listings");
  const result = await pullAgentListings(
    mockSupabase as never,
    "swfl_mls",
    "AGT001",
    "user-uuid-1",
  );

  expect(result.count).toBe(2);
  expect(result.zips.sort()).toEqual(["33901", "33907"]);
  expect(mockUpsert).toHaveBeenCalledTimes(1);

  const [rows] = mockUpsert.mock.calls[0] as [unknown[]];
  expect((rows as { listing_key: string }[]).find((r) => r.listing_key === "K1")).toBeDefined();
});

test("returns empty zips and count 0 when no listings found", async () => {
  mockGet.mockImplementation(async () => []);
  const { pullAgentListings } = await import("./pull-agent-listings");
  const result = await pullAgentListings(
    mockSupabase as never,
    "swfl_mls",
    "AGT999",
    "user-uuid-2",
  );
  expect(result.count).toBe(0);
  expect(result.zips).toEqual([]);
});
