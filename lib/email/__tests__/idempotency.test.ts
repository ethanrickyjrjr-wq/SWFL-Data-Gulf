import { describe, test } from "bun:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { claimOnce } from "../idempotency.ts";

/**
 * In-memory fake that ENFORCES the unique(idempotency_key) constraint exactly like
 * `INSERT ... ON CONFLICT DO NOTHING`: a second insert of the same key returns an
 * empty data array (no row inserted), never an error. `failCode` forces a DB error.
 */
function makeDb(opts?: { failCode?: string }): {
  db: SupabaseClient;
  rows: Record<string, unknown>[];
} {
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  const db = {
    from() {
      return {
        upsert(row: Record<string, unknown>) {
          return {
            async select() {
              if (opts?.failCode) {
                return { data: null, error: { code: opts.failCode, message: "db boom" } };
              }
              const key = String(row.idempotency_key);
              if (seen.has(key)) return { data: [], error: null }; // conflict → ignored
              seen.add(key);
              rows.push(row);
              return { data: [{ id: rows.length }], error: null };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { db, rows };
}

describe("claimOnce", () => {
  test("first claim wins (true); a second claim of the SAME key loses (false)", async () => {
    const { db, rows } = makeDb();
    const ctx = { userId: "u1", kind: "digest" as const, scheduleId: 7 };
    assert.equal(await claimOnce(db, "digest:7:2026-06-13", ctx), true);
    assert.equal(await claimOnce(db, "digest:7:2026-06-13", ctx), false);
    // exactly one row materialized (the unique key held)
    assert.equal(rows.length, 1);
  });

  test("distinct keys each win", async () => {
    const { db } = makeDb();
    assert.equal(
      await claimOnce(db, "digest:7:2026-06-13", { userId: "u1", kind: "digest" }),
      true,
    );
    assert.equal(
      await claimOnce(db, "digest:7:2026-06-14", { userId: "u1", kind: "digest" }),
      true,
    );
    assert.equal(await claimOnce(db, "nonce:abc", { userId: "u1", kind: "nonce" }), true);
  });

  test("persists the context columns on the winning insert", async () => {
    const { db, rows } = makeDb();
    await claimOnce(db, "activation:lead-9:step2", {
      userId: "u1",
      kind: "activation",
      recipient: "lead-9",
      sequenceStep: "step2",
    });
    assert.equal(rows[0].kind, "activation");
    assert.equal(rows[0].recipient, "lead-9");
    assert.equal(rows[0].sequence_step, "step2");
  });

  test("missing table (42P01) → proceeds (true), does not block sends pre-migration", async () => {
    const { db } = makeDb({ failCode: "42P01" });
    assert.equal(
      await claimOnce(db, "digest:1:2026-06-13", { userId: "u1", kind: "digest" }),
      true,
    );
  });

  test("any other DB error THROWS (fail-closed: never double-send on ambiguity)", async () => {
    const { db } = makeDb({ failCode: "23502" });
    await assert.rejects(() =>
      claimOnce(db, "digest:1:2026-06-13", { userId: "u1", kind: "digest" }),
    );
  });
});
