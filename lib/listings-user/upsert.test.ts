// lib/listings-user/upsert.test.ts
// Guards: failure mode 9 (duplicate imports → idempotent key), Postgres
// "cannot affect row a second time" (in-batch dedupe), batching at 100.
// fakeDb capture pattern copied from lib/contacts/upsert.test.ts.
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { upsertUserListings } from "./upsert";
import type { UserListingRow } from "./parse-listings-csv";

type Batch = Record<string, unknown>[];
type Call = { batch: Batch; opts: unknown };

function fakeDb(
  handler: (batch: Batch, opts: unknown) => Promise<{ data: unknown; error: unknown }>,
) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => {
      if (table !== "user_listings") throw new Error(`unexpected table: ${table}`);
      return {
        upsert: async (batch: Batch, opts: unknown) => {
          calls.push({ batch, opts });
          return handler(batch, opts);
        },
      };
    },
  };
  return { db: client as unknown as SupabaseClient<Database>, calls };
}

const ok = async () => ({ data: null, error: null });

function row(
  address: string,
  key: string,
  overrides: Partial<UserListingRow> = {},
): UserListingRow {
  return {
    address,
    address_key: key,
    price: null,
    beds: null,
    baths: null,
    sqft: null,
    status: null,
    url: null,
    attribs: {},
    ...overrides,
  };
}

describe("upsertUserListings", () => {
  test("batches at 100 and stamps user_id + joined county on every row", async () => {
    const { db, calls } = fakeDb(ok);
    const rows = Array.from({ length: 150 }, (_, i) =>
      row(`${i} Main St, Fort Myers, FL 33901`, `${i} main st fort myers fl 33901`),
    );
    const result = await upsertUserListings(db, "user-1", rows);
    expect(calls).toHaveLength(2);
    expect(calls[0].batch).toHaveLength(100);
    expect(calls[0].batch[0]).toMatchObject({
      user_id: "user-1",
      zip_code: "33901",
      county: "Lee",
    });
    expect(calls[0].opts).toEqual({ onConflict: "user_id,address_key" });
    expect(result.added).toBe(150);
    expect(result.matchedToCounty).toBe(150);
  });
  test("same address_key twice in one file collapses to one payload row (later non-null wins)", async () => {
    const { db, calls } = fakeDb(ok);
    const rows = [
      row("5 Palm Ave 33901", "5 palm ave 33901", { price: 100000 }),
      row("5 Palm Ave 33901", "5 palm ave 33901", { beds: 3 }),
    ];
    const result = await upsertUserListings(db, "u", rows);
    expect(calls[0].batch).toHaveLength(1);
    expect(calls[0].batch[0]).toMatchObject({ price: 100000, beds: 3 });
    expect(result.added).toBe(1);
  });
  test("db error stops and reports; added reflects only landed batches", async () => {
    const { db } = fakeDb(async () => ({ data: null, error: { message: "boom" } }));
    const result = await upsertUserListings(db, "u", [row("1 A St", "1 a st")]);
    expect(result.error).toBe("boom");
    expect(result.added).toBe(0);
  });
});
