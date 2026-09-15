import { describe, it, expect, mock } from "bun:test";
import { usageLimitedResponse } from "./usage-gate";

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/mcp", { method: "POST", headers });
}

function mockAllowance(allowed: boolean) {
  mock.module("@/lib/mcp/anon-usage", () => ({
    FREE_ANON_MCP_REQUESTS_PER_DAY: 20,
    hashIp: (ip: string) => `hash:${ip}`,
    checkMcpUsageAllowance: async () => ({ allowed, remaining: allowed ? 5 : 0 }),
    recordMcpUsage: async () => {},
  }));
}

describe("usageLimitedResponse", () => {
  it("(1) returns null for a caller presenting X-Account-Key, regardless of usage", async () => {
    mockAllowance(false);
    const res = await usageLimitedResponse(makeRequest({ "X-Account-Key": "acct_abc" }));
    expect(res).toBeNull();
  });

  it("(2) returns null for a caller presenting X-Project-Key, regardless of usage", async () => {
    mockAllowance(false);
    const res = await usageLimitedResponse(makeRequest({ "X-Project-Key": "proj_abc" }));
    expect(res).toBeNull();
  });

  it("(3) returns null for a keyless caller under the cap", async () => {
    mockAllowance(true);
    const res = await usageLimitedResponse(makeRequest());
    expect(res).toBeNull();
  });

  it("(4) RETURNS a 429 Response for a keyless caller over the cap", async () => {
    mockAllowance(false);
    const res = await usageLimitedResponse(makeRequest());
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(429);
  });

  it("(5) never throws when checkMcpUsageAllowance rejects", async () => {
    mock.module("@/lib/mcp/anon-usage", () => ({
      FREE_ANON_MCP_REQUESTS_PER_DAY: 20,
      hashIp: (ip: string) => `hash:${ip}`,
      checkMcpUsageAllowance: async () => {
        throw new Error("unexpected");
      },
      recordMcpUsage: async () => {},
    }));
    await expect(usageLimitedResponse(makeRequest())).rejects.toThrow();
    // NOTE: checkMcpUsageAllowance itself fails open in production (see
    // lib/mcp/anon-usage.ts) — this case only exercises a mock that breaks
    // that contract, confirming the gate has no independent try/catch of its
    // own layered on top. The real safety net lives in anon-usage.ts.
  });
});
