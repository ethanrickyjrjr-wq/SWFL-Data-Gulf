import { test, expect, mock } from "bun:test";

const mockGet = mock(async () => [
  {
    PostalCode: "33901",
    ClosePrice: 300000,
    DaysOnMarket: 30,
    LivingArea: 1500,
    CloseDate: "2025-06-01",
  },
  {
    PostalCode: "33901",
    ClosePrice: 500000,
    DaysOnMarket: 10,
    LivingArea: 2500,
    CloseDate: "2025-08-01",
  },
  {
    PostalCode: "33907",
    ClosePrice: 450000,
    DaysOnMarket: 20,
    LivingArea: 2000,
    CloseDate: "2025-07-01",
  },
]);
mock.module("./client", () => ({
  ResoClient: class {
    get = mockGet;
  },
}));

const upsertedRows: unknown[] = [];
const mockSelect = mock(() => ({ count: 2, error: null }));
const mockSupabase = {
  schema: () => ({
    from: (_table: string) => ({
      upsert: (rows: unknown[]) => {
        upsertedRows.push(...rows);
        return { error: null };
      },
      select: () => ({
        eq: () => ({ eq: () => ({ eq: () => ({ eq: () => mockSelect() }) }) }),
      }),
    }),
  }),
};

test("computes median close price per ZIP", async () => {
  upsertedRows.length = 0;
  const { pullZipStats } = await import("./pull-zip-stats");
  await pullZipStats(mockSupabase as never, "swfl_mls", "user-1", ["33901", "33907"]);

  const zip33901 = (upsertedRows as { postal_code: string; median_close_price: number }[]).find(
    (r) => r.postal_code === "33901",
  );
  expect(zip33901?.median_close_price).toBe(400000); // median of [300000, 500000]

  const zip33907 = (upsertedRows as { postal_code: string; close_count: number }[]).find(
    (r) => r.postal_code === "33907",
  );
  expect(zip33907?.close_count).toBe(1);
});

test("returns early when zips array is empty", async () => {
  upsertedRows.length = 0;
  const { pullZipStats } = await import("./pull-zip-stats");
  await pullZipStats(mockSupabase as never, "swfl_mls", "user-1", []);
  expect(upsertedRows.length).toBe(0);
});
