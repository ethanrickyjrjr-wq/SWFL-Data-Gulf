import { test, expect, mock, afterAll } from "bun:test";
import * as realClient from "./client";
import * as realPullAgentListings from "./pull-agent-listings";
import * as realPullZipStats from "./pull-zip-stats";
// Snapshot the real modules before mock.module replaces them (process-global, no per-file
// isolation — an unrestored mock leaks into whichever test file runs next; on Linux CI the
// file order is filesystem-dependent, so the leak reddens pull-*.test.ts at random).
const clientOrig = { ...realClient };
const pullAgentListingsOrig = { ...realPullAgentListings };
const pullZipStatsOrig = { ...realPullZipStats };
afterAll(() => {
  mock.module("./client", () => clientOrig);
  mock.module("./pull-agent-listings", () => pullAgentListingsOrig);
  mock.module("./pull-zip-stats", () => pullZipStatsOrig);
});

// Mock all dependencies
mock.module("./pull-agent-listings", () => ({
  pullAgentListings: mock(async () => ({ count: 5, zips: ["33901", "33907"] })),
}));
mock.module("./pull-zip-stats", () => ({
  pullZipStats: mock(async () => {}),
}));

const mockClientGet = mock(async () => []);
mock.module("./client", () => ({
  ResoClient: class {
    get = mockClientGet;
  },
}));

const mockUpdate = mock(() => ({ error: null }));
const mockSupabase = {
  from: () => ({ update: () => ({ eq: () => mockUpdate() }) }),
  schema: () => ({
    from: () => ({
      upsert: mock(() => ({ error: null })),
      delete: () => ({ eq: () => ({ eq: () => ({ in: mock(() => ({ error: null })) }) }) }),
    }),
  }),
};

const baseConn = {
  id: "conn-1",
  user_id: "user-1",
  board_slug: "swfl_mls" as const,
  member_mls_id: "AGT001",
  last_entity_event_sequence: null,
};

test("first sync: calls pullAgentListings + pullZipStats + stores max sequence", async () => {
  // Return one event to seed the max sequence
  mockClientGet.mockImplementation(async () => [{ EntityEventSequence: 999 }]);
  mockUpdate.mockClear();

  const { syncConnection } = await import("./sync");
  const result = await syncConnection(mockSupabase as never, baseConn);

  expect(result.listings).toBe(5);
  expect(result.zips).toEqual(["33901", "33907"]);
  // Should have updated with last_entity_event_sequence = 999
  expect(mockUpdate).toHaveBeenCalled();
});

test("incremental sync: returns 0 when no events since last sequence", async () => {
  mockClientGet.mockImplementation(async () => []); // no events
  mockUpdate.mockClear();

  const { syncConnection } = await import("./sync");
  const conn = { ...baseConn, last_entity_event_sequence: 999 };
  const result = await syncConnection(mockSupabase as never, conn);

  expect(result.listings).toBe(0);
  expect(result.zips).toEqual([]);
});
