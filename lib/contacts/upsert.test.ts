// lib/contacts/upsert.test.ts
// Coverage for the canonical upsert core (extract on copy #3 — Task 5).
// Mocks the client at `from("contacts").upsert(batch, opts)` per the task
// brief; captures every call so batching, user_id stamping, the
// unsubscribed one-way rule, and stop-on-first-error can all be asserted
// against the actual payload objects (not a re-derived summary).
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { upsertCanonicalContacts } from "./upsert";
import type { ContactRow } from "./types";

type Batch = Record<string, unknown>[];
type Call = { batch: Batch; opts: unknown };

/** Builds a fake SupabaseClient whose `contacts.upsert` is driven by `handler`,
 * capturing every (batch, opts) pair it was called with. */
function fakeDb(
  handler: (batch: Batch, opts: unknown) => Promise<{ data: unknown; error: unknown }>,
) {
  const calls: Call[] = [];
  const client = {
    from: (table: string) => {
      if (table !== "contacts") throw new Error(`unexpected table in test fake: ${table}`);
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

function row(email: string, overrides: Partial<ContactRow> = {}): ContactRow {
  return {
    name: "Name",
    email,
    phone: null,
    tags: [],
    attribs: {},
    ...overrides,
  };
}

const okHandler = async (batch: Batch) => ({ data: batch.map(() => ({ id: "x" })), error: null });

describe("upsertCanonicalContacts", () => {
  test("batches at 100 — 150 rows becomes two calls of 100 then 50", async () => {
    const { db, calls } = fakeDb(okHandler);
    const rows = Array.from({ length: 150 }, (_, i) => row(`u${i}@x.com`));

    const result = await upsertCanonicalContacts(db, "user-1", rows);

    expect(calls).toHaveLength(2);
    expect(calls[0].batch).toHaveLength(100);
    expect(calls[1].batch).toHaveLength(50);
    expect(result).toEqual({ added: 150, error: null });
  });

  test("stamps user_id on every row of every batch", async () => {
    const { db, calls } = fakeDb(okHandler);
    const rows = Array.from({ length: 120 }, (_, i) => row(`u${i}@x.com`));

    await upsertCanonicalContacts(db, "user-42", rows);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      for (const r of call.batch) {
        expect(r.user_id).toBe("user-42");
      }
    }
  });

  test("upserts with onConflict user_id,email", async () => {
    const { db, calls } = fakeDb(okHandler);

    await upsertCanonicalContacts(db, "user-1", [row("a@x.com")]);

    expect(calls[0].opts).toEqual({ onConflict: "user_id,email" });
  });

  test("unsubscribed:true passes through to the payload", async () => {
    const { db, calls } = fakeDb(okHandler);

    await upsertCanonicalContacts(db, "user-1", [row("a@x.com", { unsubscribed: true })]);

    expect(calls[0].batch[0].unsubscribed).toBe(true);
  });

  test("unsubscribed:false is OMITTED from the payload (never resurrects an opt-out)", async () => {
    const { db, calls } = fakeDb(okHandler);

    await upsertCanonicalContacts(db, "user-1", [row("a@x.com", { unsubscribed: false })]);

    expect(Object.prototype.hasOwnProperty.call(calls[0].batch[0], "unsubscribed")).toBe(false);
  });

  test("unsubscribed:undefined (field never set) is OMITTED from the payload", async () => {
    const { db, calls } = fakeDb(okHandler);

    await upsertCanonicalContacts(db, "user-1", [row("a@x.com")]);

    expect(Object.prototype.hasOwnProperty.call(calls[0].batch[0], "unsubscribed")).toBe(false);
  });

  test("mixed rows: opt-outs and the rest go in SEPARATE calls — never a mixed-key batch", async () => {
    // PostgREST derives one call's column set as the union of keys across
    // its whole payload and fills any row missing a column the batch
    // specifies with null/default (Prefer: missing, PostgREST docs). If a
    // true row and a key-omitting row ever shared a call, the omitting
    // row's `unsubscribed` would get filled in server-side — resurrecting
    // an opt-out. So this asserts the two never land in the same batch.
    const { db, calls } = fakeDb(okHandler);

    await upsertCanonicalContacts(db, "user-1", [
      row("a@x.com", { unsubscribed: true }),
      row("b@x.com", { unsubscribed: false }),
      row("c@x.com"),
    ]);

    expect(calls).toHaveLength(2);
    const optOutCall = calls.find((c) => c.batch.some((r) => r.email === "a@x.com"))!;
    const restCall = calls.find((c) => c.batch.some((r) => r.email === "b@x.com"))!;
    expect(optOutCall).not.toBe(restCall);
    expect(optOutCall.batch).toHaveLength(1);
    expect(optOutCall.batch[0].unsubscribed).toBe(true);
    expect(restCall.batch.map((r) => r.email).sort()).toEqual(["b@x.com", "c@x.com"]);
    for (const r of restCall.batch) {
      expect(Object.prototype.hasOwnProperty.call(r, "unsubscribed")).toBe(false);
    }
  });

  test("invariant: every call's batch has a homogeneous unsubscribed-key membership", async () => {
    const { db, calls } = fakeDb(okHandler);
    const rows = [
      ...Array.from({ length: 120 }, (_, i) => row(`sub${i}@x.com`)),
      ...Array.from({ length: 40 }, (_, i) => row(`out${i}@x.com`, { unsubscribed: true })),
    ];

    await upsertCanonicalContacts(db, "user-1", rows);

    for (const call of calls) {
      const withKey = call.batch.filter((r) =>
        Object.prototype.hasOwnProperty.call(r, "unsubscribed"),
      );
      expect(withKey.length === 0 || withKey.length === call.batch.length).toBe(true);
    }
  });

  test("error propagation: added counts rows from batches before the failure, stops on first error", async () => {
    let callCount = 0;
    const { db, calls } = fakeDb(async (batch) => {
      callCount += 1;
      if (callCount === 2) return { data: null, error: { message: "boom" } };
      return { data: batch.map(() => ({ id: "x" })), error: null };
    });
    const rows = Array.from({ length: 250 }, (_, i) => row(`u${i}@x.com`));

    const result = await upsertCanonicalContacts(db, "user-1", rows);

    expect(result).toEqual({ added: 100, error: "boom" });
    // Third batch (rows 200-249) must never be attempted once batch 2 errors.
    expect(calls).toHaveLength(2);
  });
});
