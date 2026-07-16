// lib/billing/effective-tier.test.ts
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/database.types";
import { pickEffectiveTier, resolveEffectiveTier } from "./effective-tier";

const NOW = new Date("2026-07-16T12:00:00Z");
const activePass = { tier: "starter", expires_at: "2026-09-01T00:00:00Z" };
const expiredPass = { tier: "starter", expires_at: "2026-07-01T00:00:00Z" };

describe("pickEffectiveTier", () => {
  test("no sub, no pass → free", () => expect(pickEffectiveTier(null, null, NOW)).toBe("free"));
  test("active pass upgrades free", () =>
    expect(pickEffectiveTier(null, activePass, NOW)).toBe("starter"));
  test("expired pass does nothing", () =>
    expect(pickEffectiveTier(null, expiredPass, NOW)).toBe("free"));
  test("real paid sub wins over pass (never downgrade a payer)", () =>
    expect(pickEffectiveTier("growth", activePass, NOW)).toBe("growth"));
  test("free-tier sub row + active pass → pass tier", () =>
    expect(pickEffectiveTier("free", activePass, NOW)).toBe("starter"));
});

// ---------------------------------------------------------------------------
// resolveEffectiveTier — DEGRADE CONTRACT (review Critical, 2026-07-16)
//
// resolveEffectiveTier takes `db` by dependency injection, so these tests
// build a minimal fake client directly (no mock.module needed) — same
// pattern as lib/desk/loaders.test.ts's `{ schema: () => ({ from }) } as
// unknown as SupabaseClient`.
// ---------------------------------------------------------------------------

type MaybeSingleResult = { data: unknown; error: unknown };

function fakeDb(
  byTable: Record<string, () => Promise<MaybeSingleResult>>,
): SupabaseClient<Database> {
  const client = {
    from: (table: string) => {
      const resolver = byTable[table];
      if (!resolver) throw new Error(`unexpected table in test fake: ${table}`);
      return {
        select: () => ({ eq: () => ({ maybeSingle: resolver }) }),
      };
    },
  };
  return client as unknown as SupabaseClient<Database>;
}

describe("resolveEffectiveTier — degrade contract", () => {
  test("(a) billing read resolves {data:null, error} (no throw) → degraded true, tier free", async () => {
    const db = fakeDb({
      billing_subscriptions: async () => ({ data: null, error: { message: "RLS denied" } }),
      switch_passes: async () => ({ data: null, error: null }),
    });
    const result = await resolveEffectiveTier(db, "u1");
    expect(result).toEqual({ tier: "free", degraded: true });
  });

  test("(b) pass read errors but billing is fine → billing tier wins, degraded false", async () => {
    const db = fakeDb({
      billing_subscriptions: async () => ({ data: { tier: "growth" }, error: null }),
      switch_passes: async () => ({ data: null, error: { message: "pass lookup timeout" } }),
    });
    const result = await resolveEffectiveTier(db, "u1");
    expect(result).toEqual({ tier: "growth", degraded: false });
  });

  test("(c) happy path unchanged: free sub + active pass lifts tier, degraded false", async () => {
    const db = fakeDb({
      billing_subscriptions: async () => ({ data: { tier: "free" }, error: null }),
      switch_passes: async () => ({
        data: { tier: "starter", expires_at: "2099-01-01T00:00:00Z" },
        error: null,
      }),
    });
    const result = await resolveEffectiveTier(db, "u1");
    expect(result).toEqual({ tier: "starter", degraded: false });
  });
});
