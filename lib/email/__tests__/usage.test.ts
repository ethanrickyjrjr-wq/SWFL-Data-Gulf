/**
 * Unit tests for the pure helpers in lib/email/usage.ts.
 * No DB dependency — these exercise billingPeriod, tierLimit, and the
 * allow/limit math that checkUsageLimit computes.
 */
import { describe, test, expect, mock } from "bun:test";
import assert from "node:assert/strict";
import { billingPeriod, tierLimit, resolveTier, checkUsageLimit } from "../usage.ts";

// ---------------------------------------------------------------------------
// billingPeriod
// ---------------------------------------------------------------------------

describe("billingPeriod", () => {
  test("returns YYYY-MM in UTC", () => {
    assert.equal(billingPeriod(new Date("2026-06-12T14:30:00Z")), "2026-06");
  });

  test("boundary: last instant of a month stays in that month", () => {
    // 2026-06-30T23:59:59.999Z → '2026-06'
    assert.equal(billingPeriod(new Date("2026-06-30T23:59:59.999Z")), "2026-06");
  });

  test("boundary: first instant of next month advances the period", () => {
    // 2026-07-01T00:00:00Z → '2026-07'
    assert.equal(billingPeriod(new Date("2026-07-01T00:00:00Z")), "2026-07");
  });

  test("pads single-digit months", () => {
    assert.equal(billingPeriod(new Date("2026-01-15T00:00:00Z")), "2026-01");
    assert.equal(billingPeriod(new Date("2026-09-01T00:00:00Z")), "2026-09");
  });

  test("year rolls over correctly", () => {
    assert.equal(billingPeriod(new Date("2026-12-31T23:59:59.999Z")), "2026-12");
    assert.equal(billingPeriod(new Date("2027-01-01T00:00:00Z")), "2027-01");
  });
});

// ---------------------------------------------------------------------------
// tierLimit
// ---------------------------------------------------------------------------

describe("tierLimit", () => {
  test("free → 50", () => {
    assert.equal(tierLimit("free"), 50);
  });

  test("starter → 500", () => {
    assert.equal(tierLimit("starter"), 500);
  });

  test("growth → 2000", () => {
    assert.equal(tierLimit("growth"), 2000);
  });

  test("pro → 10000", () => {
    assert.equal(tierLimit("pro"), 10000);
  });

  test("unknown tier falls back to free limit (conservative)", () => {
    assert.equal(tierLimit("enterprise"), 50);
    assert.equal(tierLimit(""), 50);
    assert.equal(tierLimit("STARTER"), 50); // case-sensitive
  });
});

// ---------------------------------------------------------------------------
// allow / deny logic (pure math, no DB)
// The same logic checkUsageLimit uses: allowed = sent < tierLimit(tier)
// ---------------------------------------------------------------------------

describe("allow / deny math", () => {
  function isAllowed(sent: number, tier: string): boolean {
    return sent < tierLimit(tier);
  }

  test("free: 0 sends → allowed", () => {
    assert.equal(isAllowed(0, "free"), true);
  });

  test("free: 49 sends → allowed (one under limit)", () => {
    assert.equal(isAllowed(49, "free"), true);
  });

  test("free: 50 sends → denied (at limit, not under)", () => {
    assert.equal(isAllowed(50, "free"), false);
  });

  test("free: 51 sends → denied (over limit)", () => {
    assert.equal(isAllowed(51, "free"), false);
  });

  test("starter: 499 → allowed, 500 → denied", () => {
    assert.equal(isAllowed(499, "starter"), true);
    assert.equal(isAllowed(500, "starter"), false);
  });

  test("growth: 1999 → allowed, 2000 → denied", () => {
    assert.equal(isAllowed(1999, "growth"), true);
    assert.equal(isAllowed(2000, "growth"), false);
  });

  test("pro: 9999 → allowed, 10000 → denied", () => {
    assert.equal(isAllowed(9999, "pro"), true);
    assert.equal(isAllowed(10000, "pro"), false);
  });
});

// ---------------------------------------------------------------------------
// resolveTier (billing_subscriptions → tier)
// ---------------------------------------------------------------------------

describe("resolveTier (billing_subscriptions → tier)", () => {
  test("no subscription row → free", () => {
    assert.equal(resolveTier(null), "free");
  });
  test("row with null tier → free", () => {
    assert.equal(resolveTier({ tier: null }), "free");
  });
  test("paid row → its tier verbatim (incl. past_due rows — keep-through-dunning)", () => {
    assert.equal(resolveTier({ tier: "growth" }), "growth");
  });
});

// ---------------------------------------------------------------------------
// checkUsageLimit — DB-integration cases (effective-tier resolution, Task 3)
//
// checkUsageLimit now delegates tier resolution to resolveEffectiveTier(db,
// userId) (lib/billing/effective-tier.ts) instead of an inline
// billing_subscriptions read. These cases mock the service-role client's
// `.from(table)` and branch on the table name, since resolveEffectiveTier
// reads BOTH billing_subscriptions and switch_passes, and checkUsageLimit
// itself separately reads email_usage. Mirrors the mock.module pattern used
// in app/api/contacts/route.test.ts and app/api/segments/route.test.ts —
// mock.module updates the already-imported `checkUsageLimit`'s live binding
// to createServiceRoleClient (confirmed via Bun docs: "Overriding Already
// Imported Modules" — live bindings update even after static import).
// ---------------------------------------------------------------------------

type MaybeSingleResult = { data: unknown; error: unknown };

function mockDb(byTable: Record<string, () => Promise<MaybeSingleResult>>) {
  mock.module("@/utils/supabase/service-role", () => ({
    createServiceRoleClient: () => ({
      from: (table: string) => {
        const resolver = byTable[table];
        if (!resolver) throw new Error(`unexpected table in test mock: ${table}`);
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: resolver }), // email_usage: .eq(user_id).eq(billing_period)
              maybeSingle: resolver, // billing_subscriptions / switch_passes: .eq(user_id)
            }),
          }),
        };
      },
    }),
    createServiceRoleClientUntyped: () => ({}),
  }));
}

describe("checkUsageLimit (pass-aware via resolveEffectiveTier)", () => {
  test("billing_subscriptions null + active starter switch_passes row → tier lifts to starter", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: null }),
      switch_passes: async () => ({
        data: { tier: "starter", expires_at: "2099-01-01T00:00:00Z" },
        error: null,
      }),
      email_usage: async () => ({ data: { sent_count: 0 }, error: null }),
    });

    const result = await checkUsageLimit("u1");
    expect(result.tier).toBe("starter");
    expect(result.limit).toBe(500);
  });

  test("billing_subscriptions AND switch_passes both throw → fails open to free, never throws", async () => {
    mockDb({
      billing_subscriptions: async () => {
        throw new Error("db unavailable");
      },
      switch_passes: async () => {
        throw new Error("db unavailable");
      },
      email_usage: async () => ({ data: { sent_count: 0 }, error: null }),
    });

    const result = await checkUsageLimit("u1");
    expect(result.allowed).toBe(true);
    expect(result.tier).toBe("free");
  });

  // Review Critical (2026-07-16): supabase-js does NOT throw on a normal query
  // failure (RLS denial, timeout) — it resolves `{data: null, error}`. This is
  // the discriminating case: NO throw anywhere, just a returned `error` on the
  // billing_subscriptions read, for a caller who (per email_usage) has ALREADY
  // sent 200 this period — well past the free-tier limit of 50. The bug this
  // guards: treating an errored (not thrown) billing read as "no subscription"
  // → tier "free" → limit 50 → a paying growth customer's send gets BLOCKED
  // during a transient billing read glitch. Must still fail open.
  test("billing_subscriptions resolves {data:null, error} (no throw) + sent 200 → fails open, never blocks", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: { message: "RLS denied" } }),
      switch_passes: async () => ({ data: null, error: null }),
      email_usage: async () => ({ data: { sent_count: 200 }, error: null }),
    });

    const result = await checkUsageLimit("u1");
    expect(result).toEqual({ allowed: true, tier: "free", sent: 0, limit: 50 });
  });
});
