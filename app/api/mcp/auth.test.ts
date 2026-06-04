import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { assertAuthorized } from "./auth";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("Authorization", authHeader);
  return new Request("https://example.com/api/mcp", {
    method: "POST",
    headers,
  });
}

describe("assertAuthorized", () => {
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
    await expect(assertAuthorized(makeRequest())).resolves.toBeUndefined();
  });

  it("(2) throws 401 Response when token set but no Authorization header", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    let caught: unknown;
    try {
      await assertAuthorized(makeRequest());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(401);
  });

  it("(3) throws 401 Response when bearer token is wrong", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    let caught: unknown;
    try {
      await assertAuthorized(makeRequest("Bearer wrong-token"));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Response);
    expect((caught as Response).status).toBe(401);
  });

  it("(4) resolves when bearer token matches exactly", async () => {
    process.env.MCP_BEARER_TOKEN = "secret-abc";
    await expect(
      assertAuthorized(makeRequest("Bearer secret-abc")),
    ).resolves.toBeUndefined();
  });
});
