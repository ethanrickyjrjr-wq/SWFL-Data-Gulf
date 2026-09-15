/**
 * Unit tests for lib/mcp/anon-usage.ts — daily usage cap for anonymous MCP
 * callers. Mirrors lib/email/build-usage.test.ts's mock style (mock.module
 * over @/utils/supabase/service-role, branching on table name via the
 * UNTYPED client only — this module never uses the typed client).
 */
import { describe, test, expect, mock } from "bun:test";
import {
  FREE_ANON_MCP_REQUESTS_PER_DAY,
  mcpUsageDayKey,
  hashIp,
  checkMcpUsageAllowance,
  recordMcpUsage,
} from "./anon-usage.ts";

describe("mcpUsageDayKey", () => {
  test("returns YYYY-MM-DD in UTC", () => {
    expect(mcpUsageDayKey(new Date("2026-09-15T14:30:00Z"))).toBe("2026-09-15");
  });

  test("boundary: last instant of a day stays that day", () => {
    expect(mcpUsageDayKey(new Date("2026-09-15T23:59:59.999Z"))).toBe("2026-09-15");
  });
});

describe("FREE_ANON_MCP_REQUESTS_PER_DAY", () => {
  test("is 20", () => {
    expect(FREE_ANON_MCP_REQUESTS_PER_DAY).toBe(20);
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
  test("under the cap (19 today) → allowed", async () => {
    mockDb(async () => ({ data: { request_count: 19 }, error: null }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({ allowed: true, remaining: 1 });
  });

  test("at exactly the cap (20 today) → denied", async () => {
    mockDb(async () => ({ data: { request_count: 20 }, error: null }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({ allowed: false, remaining: 0 });
  });

  test("over the cap → denied, remaining clamped at 0", async () => {
    mockDb(async () => ({ data: { request_count: 25 }, error: null }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({ allowed: false, remaining: 0 });
  });

  test("no row yet today → allowed at full remaining", async () => {
    mockDb(async () => ({ data: null, error: null }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({
      allowed: true,
      remaining: FREE_ANON_MCP_REQUESTS_PER_DAY,
    });
  });

  test("DB read resolves {data:null, error} (no throw) → fails open, allowed", async () => {
    mockDb(async () => ({ data: null, error: { message: "relation does not exist" } }));
    expect(await checkMcpUsageAllowance("h1")).toEqual({
      allowed: true,
      remaining: FREE_ANON_MCP_REQUESTS_PER_DAY,
    });
  });

  test("DB read throws → fails open, allowed", async () => {
    mockDb(async () => {
      throw new Error("db unavailable");
    });
    expect(await checkMcpUsageAllowance("h1")).toEqual({
      allowed: true,
      remaining: FREE_ANON_MCP_REQUESTS_PER_DAY,
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
      remaining: FREE_ANON_MCP_REQUESTS_PER_DAY,
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

  test("calls upsert then rpc with the UTC day key on the happy path", async () => {
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
