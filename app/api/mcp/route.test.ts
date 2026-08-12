import { describe, it, expect } from "bun:test";
import { POST, DELETE } from "./route";

/**
 * sa0718_cors_headers_only_applied_to_the_options_p
 *
 * GET and OPTIONS attach CORS_HEADERS. POST and DELETE historically did
 * `return handler(request)` verbatim — no CORS merge — so a cross-origin MCP
 * client's preflight (OPTIONS) succeeds, but the browser then blocks the JS
 * from reading the actual POST/DELETE response body because it carries no
 * `Access-Control-Allow-Origin`. Preflight passing proves nothing about the
 * real request.
 */
function makeRequest(method: string, body?: string): Request {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json, text/event-stream");
  return new Request("https://example.com/api/mcp", { method, headers, body });
}

describe("MCP route CORS — the actual response, not just the preflight", () => {
  it("POST response carries Access-Control-Allow-Origin even though the request succeeded via mcp-handler", async () => {
    const res = await POST(
      makeRequest("POST", JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 })),
    );
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("DELETE response carries Access-Control-Allow-Origin even on a non-2xx status from mcp-handler", async () => {
    const res = await DELETE(makeRequest("DELETE"));
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
