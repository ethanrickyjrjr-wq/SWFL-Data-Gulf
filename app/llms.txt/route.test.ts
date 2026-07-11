import { test } from "bun:test";
import assert from "node:assert/strict";
import { GET } from "./route";

test("GET /llms.txt: plain text, names the desk and the brand", async () => {
  const res = await GET();
  assert.equal(res.headers.get("content-type"), "text/plain; charset=utf-8");
  const body = await res.text();
  assert.ok(body.includes("SWFL Data Gulf"));
  assert.ok(body.includes("/desk"));
});
