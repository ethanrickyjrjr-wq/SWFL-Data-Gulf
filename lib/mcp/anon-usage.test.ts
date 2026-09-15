/**
 * Unit tests for lib/mcp/anon-usage.ts — monthly usage cap for anonymous MCP
 * callers. Mirrors lib/email/build-usage.test.ts's mock style (mock.module
 * over @/utils/supabase/service-role, branching on table name via the
 * UNTYPED client only — this module never uses the typed client).
 */
import { describe, test, expect, mock, afterAll } from "bun:test";
import {
  FREE_ANON_MCP_REQUESTS_PER_MONTH,
  mcpUsageMonthKey,
  hashIp,
  checkMcpUsageAllowance,
  recordMcpUsage,
} from "./anon-usage.ts";

describe("mcpUsageMonthKey", () => {
  test("returns the first-of-month YYYY-MM-01 in UTC", () => {
    expect(mcpUsageMonthKey(new Date("2026-09-15T14:30:00Z"))).toBe("2026-09-01");
  });

  test("boundary: last instant of a month stays that month", () => {
    expect(mcpUsageMonthKey(new Date("2026-09-30T23:59:59.999Z"))).toBe("2026-09-01");
  });

  test("boundary: first instant of next month advances", () => {
    expect(mcpUsageMonthKey(new Date("2026-10-01T00:00:00Z"))).toBe("2026-10-01");
  });
});

describe("FREE_ANON_MCP_REQUESTS_PER_MONTH", () => {
  test("is 15", () => {
    expect(FREE_ANON_MCP_REQUESTS_PER_MONTH).toBe(15);
  });
});

describe("hashIp", () => {
  test("is deterministic for the same input", () => {
    expect(hashIp("203.0.113.5")).toBe(hashIp("203.0.113.5"));
  });

  test("differs for different inputs", () => {
    expect(hashIp("203.0.113.5")).not.toBe(hashIp("203.0.113.6"));
  });

  test("never leaks the raw IP into the digest", () => {
    expect(hashIp("203.0.113.5")).not.toContain("203.0.113.5");
  });
});

// ---------------------------------------------------------------------------
// checkMcpUsageAllowance — DB-integration cases
// ---------------------------------------------------------------------------

// bun's mock.module is PROCESS-GLOBAL and never auto-restored - a stub left
// installed here poisons every file that runs after this one in CI's file
// order. Snapshot the real module before mocking, hand it back in afterAll.
// Guard: lib/testing/mock-restore-ratchet.test.ts.
const realServiceRole = { ...(await import("@/utils/supabase/service-role")) };
afterAll(() => {
  mock.module("@/utils/supabase/service-role", () => realServiceRole);
});

type MaybeSingleResult = { data: unknown; error: unknown };

function mockDb(resolver: () => Promise<MaybeSingleResult>) {
  mock.module("@/utils/supabase/service-role", () => ({
    createServiceRoleClientUntyped: () => ({
      from: (table: string) => {
        if (table !== "mcp_anon_usage") throw new Error(`unexpected table in test mock: ${table}`);
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: resolver }) }) }) };
      },
    }),
  }));
}

describe("checkMcpUsageAllowance", () => {
  test("under the cap (14 this month) → allowed", async () => {
    mockDb(async () => ({ data: { request_count: 14 }, error: null }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({ allowed: true, remaining: 1 });
  });

  test("at exactly the cap (15 this month) → denied", async () => {
    mockDb(async () => ({ data: { request_count: 15 }, error: null }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({ allowed: false, remaining: 0 });
  });

  test("over the cap → denied, remaining clamped at 0", async () => {
    mockDb(async () => ({ data: { request_count: 25 }, error: null }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({ allowed: false, remaining: 0 });
  });

  test("no row yet this month → allowed at full remaining", async () => {
    mockDb(async () => ({ data: null, error: null }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({
      allowed: true,
      remaining: FREE_ANON_MCP_REQUESTS_PER_MONTH,
    });
  });

  test("DB read resolves {data:null, error} (no throw) → fails open, allowed", async () => {
    mockDb(async () => ({ data: null, error: { message: "relation does not exist" } }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({
      allowed: true,
      remaining: FREE_ANON_MCP_REQUESTS_PER_MONTH,
    });
  });

  test("DB read throws → fails open, allowed", async () => {
    mockDb(async () => {
      throw new Error("db unavailable");
    });
    expect(await checkMcpUsageAllowance("h1")).toEqual({
      allowed: true,
      remaining: FREE_ANON_MCP_REQUESTS_PER_MONTH,
    });
  });

  test("client constructor throws (env missing) → fails open, allowed", async () => {
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClientUntyped: () => {
        throw new Error("service role env missing");
      },
    }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({
      allowed: true,
      remaining: FREE_ANON_MCP_REQUESTS_PER_MONTH,
    });
  });
});

// ---------------------------------------------------------------------------
// recordMcpUsage — never throws
// ---------------------------------------------------------------------------

describe("recordMcpUsage", () => {
  test("never throws when the client constructor throws", async () => {
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClientUntyped: () => {
        throw new Error("service role env missing");
      },
    }));
    await expect(recordMcpUsage("h1")).resolves.toBeUndefined();
  });

  test("never throws when the upsert rejects", async () => {
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClientUntyped: () => ({
        from: () => ({
          upsert: async () => {
            throw new Error("upsert failed");
          },
        }),
        rpc: async () => ({ data: null, error: null }),
      }),
    }));
    await expect(recordMcpUsage("h1")).resolves.toBeUndefined();
  });

  test("never throws when the rpc increment rejects", async () => {
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClientUntyped: () => ({
        from: () => ({
          upsert: async () => ({ data: null, error: null }),
        }),
        rpc: async () => {
          throw new Error("rpc failed");
        },
      }),
    }));
    await expect(recordMcpUsage("h1")).resolves.toBeUndefined();
  });

  test("calls upsert then rpc with the UTC month key on the happy path", async () => {
    const calls: string[] = [];
    mock.module("@/utils/supabase/service-role", () => ({
      createServiceRoleClientUntyped: () => ({
        from: (table: string) => ({
          upsert: async () => {
            calls.push(`upsert:${table}`);
            return { data: null, error: null };
          },
        }),
        rpc: async (fn: string, args: Record<string, unknown>) => {
          calls.push(`rpc:${fn}:${args.p_ip_hash}:${args.p_n}`);
          return { data: null, error: null };
        },
      }),
    }));
    await recordMcpUsage("h1");
    expect(calls[0]).toBe("upsert:mcp_anon_usage");
    expect(calls[1]).toBe("rpc:increment_mcp_anon_usage:h1:1");
  });
});
