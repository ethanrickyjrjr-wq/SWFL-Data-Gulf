// app/c/[id]/card/route.test.ts
// Mirrors the mock-module posture of app/api/charts/save/route.test.ts.
import { test, expect, mock } from "bun:test";

const block = {
  title: "Median home value by city",
  columns: ["City", "Value"],
  rows: [["Cape Coral", 389000]],
  chart_type: "bar",
  value_format: "usd",
  asOf: "2026-06-30",
  source: { citation: "SWFL Data Gulf home-value desk" },
};

let row: unknown = { chart_block: block };
mock.module("@/utils/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () =>
            row ? { data: row, error: null } : { data: null, error: { message: "not found" } },
        }),
      }),
    }),
  }),
}));

const { GET } = await import("./route");

function req(url: string) {
  return new Request(url) as unknown as Parameters<typeof GET>[0];
}
const params = { params: Promise.resolve({ id: "abc12345" }) };

test("returns a PNG with long-cache headers", async () => {
  row = { chart_block: block };
  const res = await GET(req("http://localhost/c/abc12345/card"), params);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/png");
  expect(res.headers.get("cache-control")).toBe("public, max-age=3600, s-maxage=86400");
  const buf = new Uint8Array(await res.arrayBuffer());
  // PNG magic bytes
  expect(buf[0]).toBe(0x89);
  expect(buf[1]).toBe(0x50);
});

test("download=1 sets a content-disposition attachment", async () => {
  row = { chart_block: block };
  const res = await GET(req("http://localhost/c/abc12345/card?download=1"), params);
  expect(res.headers.get("content-disposition")).toBe('attachment; filename="swfl-abc12345.png"');
});

test("unknown id is a 404", async () => {
  row = null;
  const res = await GET(req("http://localhost/c/nope/card"), params);
  expect(res.status).toBe(404);
});

test("a malformed persisted block is a 404, never a 500", async () => {
  row = { chart_block: { title: 42 } };
  const res = await GET(req("http://localhost/c/abc12345/card"), params);
  expect(res.status).toBe(404);
});
