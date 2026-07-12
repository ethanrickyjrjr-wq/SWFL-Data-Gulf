import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { unauthorizedResponse } from "./auth";
import { POST, DELETE } from "./route";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("Authorization", authHeader);
  return new Request("https://example.com/api/mcp", { method: "POST", headers });
}

describe("unauthorizedResponse", () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.MCP_BEARER_TOKEN;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MCP_BEARER_TOKEN;
    else process.env.MCP_BEARER_TOKEN = original;
  });

  it("(1) open when MCP_BEARER_TOKEN is not set", async () => {
    delete process.env.MCP_BEARER_TOKEN;
    expect(await unauthorizedResponse(makeRequest())).toBeNull();
  });

  it("(2) RETURNS a 401 Response when token set but no Authorization header", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    const res = await unauthorizedResponse(makeRequest());
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(401);
  });

  it("(3) RETURNS a 401 Response when the bearer token is wrong", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    const res = await unauthorizedResponse(makeRequest("Bearer wrong-token"));
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(401);
  });

  it("(4) returns null when the bearer token matches exactly", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    expect(await unauthorizedResponse(makeRequest("Bearer secret-abc"))).toBeNull();
  });
});

/**
 * The regression tests that matter. The previous suite asserted the gate *threw* a
 * Response — which it faithfully did, so CI stayed green through the eight days
 * production answered every MCP call with a bare 500. A throw is not a status.
 * Assert the status a client actually receives, through the real route handler.
 */
describe("route auth — the status a client actually receives", () => {
  let original: string | undefined;
  beforeEach(() => {
    original = process.env.MCP_BEARER_TOKEN;
    process.env.MCP_BEARER_TOKEN = "secret-abc";
  });
  afterEach(() => {
    if (original === undefined) delete process.env.MCP_BEARER_TOKEN;
    else process.env.MCP_BEARER_TOKEN = original;
  });

  it("POST with no token RESOLVES to 401 (never throws, never 500)", async () => {
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });

  it("POST with a wrong token RESOLVES to 401 (never throws, never 500)", async () => {
    const res = await POST(makeRequest("Bearer wrong-token"));
    expect(res.status).toBe(401);
  });

  it("DELETE with a wrong token RESOLVES to 401 (never throws, never 500)", async () => {
    const res = await DELETE(makeRequest("Bearer wrong-token"));
    expect(res.status).toBe(401);
  });
});
