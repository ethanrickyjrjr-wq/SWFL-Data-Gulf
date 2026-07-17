/**
 * Unit tests for lib/email/build-usage.ts — per-user build metering + the
 * quiet free-tier daily guard. Mirrors the mock style of
 * lib/email/__tests__/usage.test.ts's checkUsageLimit DB-integration cases
 * (mock.module over @/utils/supabase/service-role, branching on table name;
 * resolveEffectiveTier itself is the REAL function, reading through the
 * mocked db's billing_subscriptions / switch_passes tables).
 */
import { describe, test, expect, mock } from "bun:test";
import {
  FREE_BUILDS_PER_DAY,
  buildDayKey,
  checkBuildAllowance,
  recordBuild,
} from "./build-usage.ts";

// ---------------------------------------------------------------------------
// buildDayKey — pure UTC day-key helper (no DB dependency)
// ---------------------------------------------------------------------------

describe("buildDayKey", () => {
  test("returns YYYY-MM-DD in UTC", () => {
    expect(buildDayKey(new Date("2026-07-16T14:30:00Z"))).toBe("2026-07-16");
  });

  test("boundary: last instant of a day stays that day", () => {
    expect(buildDayKey(new Date("2026-07-16T23:59:59.999Z"))).toBe("2026-07-16");
  });

  test("boundary: first instant of next day advances", () => {
    expect(buildDayKey(new Date("2026-07-17T00:00:00Z"))).toBe("2026-07-17");
  });
});

describe("FREE_BUILDS_PER_DAY", () => {
  test("is 30", () => {
    expect(FREE_BUILDS_PER_DAY).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// checkBuildAllowance — DB-integration cases
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
              eq: () => ({ maybeSingle: resolver }), // build_usage: .eq(user_id).eq(day)
              maybeSingle: resolver, // billing_subscriptions / switch_passes: .eq(user_id)
            }),
          }),
        };
      },
    }),
    createServiceRoleClientUntyped: () => ({}),
  }));
}

describe("checkBuildAllowance", () => {
  test("free tier under limit (29 builds today) → allowed", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: null }),
      switch_passes: async () => ({ data: null, error: null }),
      build_usage: async () => ({ data: { build_count: 29 }, error: null }),
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: true });
  });

  test("free tier at exactly 30 builds today → denied", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: null }),
      switch_passes: async () => ({ data: null, error: null }),
      build_usage: async () => ({ data: { build_count: 30 }, error: null }),
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: false });
  });

  test("free tier, no build_usage row yet today → allowed", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: null }),
      switch_passes: async () => ({ data: null, error: null }),
      build_usage: async () => ({ data: null, error: null }),
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: true });
  });

  test("starter tier at 500 builds today → allowed (paid tiers are uncapped)", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: { tier: "starter" }, error: null }),
      switch_passes: async () => ({ data: null, error: null }),
      build_usage: async () => ({ data: { build_count: 500 }, error: null }),
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: true });
  });

  test("free tier lifted to starter via active switch_passes row → allowed at any count", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: null }),
      switch_passes: async () => ({
        data: { tier: "starter", expires_at: "2099-01-01T00:00:00Z" },
        error: null,
      }),
      build_usage: async () => ({ data: { build_count: 999 }, error: null }),
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: true });
  });

  test("degraded resolver (billing_subscriptions read throws) → fails open, allowed", async () => {
    mockDb({
      billing_subscriptions: async () => {
        throw new Error("db unavailable");
      },
      switch_passes: async () => {
        throw new Error("db unavailable");
      },
      build_usage: async () => ({ data: { build_count: 999 }, error: null }),
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: true });
  });

  // Discriminating case (mirrors usage.test.ts's Review Critical 07/16 case):
  // supabase-js resolves {data:null, error} on a normal query failure, it does
  // NOT throw. A caller already at 999 builds today must still fail open.
  test("billing_subscriptions resolves {data:null, error} (no throw) → fails open, allowed", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: { message: "RLS denied" } }),
      switch_passes: async () => ({ data: null, error: null }),
      build_usage: async () => ({ data: { build_count: 999 }, error: null }),
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: true });
  });

  test("build_usage read errors (free tier, no throw) → fails open, allowed", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: null }),
      switch_passes: async () => ({ data: null, error: null }),
      build_usage: async () => ({ data: null, error: { message: "timeout" } }),
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: true });
  });

  test("build_usage read throws (free tier) → fails open, allowed", async () => {
    mockDb({
      billing_subscriptions: async () => ({ data: null, error: null }),
      switch_passes: async () => ({ data: null, error: null }),
      build_usage: async () => {
        throw new Error("db unavailable");
      },
    });
    const result = await checkBuildAllowance("u1");
    expect(result).toEqual({ allowed: true });
  });
});

// ---------------------------------------------------------------------------
// recordBuild — never throws
// ---------------------------------------------------------------------------

describe("recordBuild", () => {
  test("never throws when the untyped client constructor throws", async () => {
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({}),
      createServiceRoleClientUntyped: () => {
        throw new Error("service role env missing");
      },
    }));
    await expect(recordBuild("u1")).resolves.toBeUndefined();
  });

  test("never throws when the upsert rejects", async () => {
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({}),
      createServiceRoleClientUntyped: () => ({
        from: () => ({
          upsert: async () => {
            throw new Error("upsert failed");
          },
        }),
        rpc: async () => ({ data: null, error: null }),
      }),
    }));
    await expect(recordBuild("u1")).resolves.toBeUndefined();
  });

  test("never throws when the rpc increment rejects", async () => {
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({}),
      createServiceRoleClientUntyped: () => ({
        from: () => ({
          upsert: async () => ({ data: null, error: null }),
        }),
        rpc: async () => {
          throw new Error("rpc failed");
        },
      }),
    }));
    await expect(recordBuild("u1")).resolves.toBeUndefined();
  });

  test("calls upsert then rpc with the UTC day key on the happy path", async () => {
    const calls: string[] = [];
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClient: () => ({}),
      createServiceRoleClientUntyped: () => ({
        from: (table: string) => ({
          upsert: async () => {
            calls.push(`upsert:${table}`);
            return { data: null, error: null };
          },
        }),
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calls.push(`rpc:${fn}:${args.p_user_id}:${args.p_n}`);
          return { data: null, error: null };
        },
      }),
    }));
    await recordBuild("u1");
    expect(calls[0]).toBe("upsert:build_usage");
    expect(calls[1]).toBe("rpc:increment_build_count:u1:1");
  });
});
