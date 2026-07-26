// app/insiders/001/route.test.ts
// Failure modes covered (spec §Failure modes #1, #2, #3): anonymous leak,
// CDN cache cross-contamination, forged cookie. Uses plain Request/Response —
// the route deliberately avoids next/headers so it stays unit-testable.
import { describe, expect, test } from "bun:test";
import { signReader } from "@/lib/insiders/reader-cookie";
import { GET } from "./route";

const SECRET = "route-test-secret-0123456789abcdef";
process.env.INSIDERS_READER_SECRET = SECRET;

const req = (cookie?: string) =>
  new Request("https://www.swfldatagulf.com/insiders/001", {
    headers: cookie ? { cookie } : {},
  });

describe("GET /insiders/001", () => {
  test("anonymous gets teaser: Tape present, Watch absent", async () => {
    const res = await GET(req());
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Fifteen numbers, cold.");
    expect(html).not.toContain("Dated. Graded next issue.");
    expect(html).toContain("issue-001-gate");
  });

  test("valid signed cookie gets the full issue", async () => {
    const v = signReader("reader@example.com", SECRET);
    const res = await GET(req(`ins_reader=${v}`));
    const html = await res.text();
    expect(html).toContain("Dated. Graded next issue.");
    expect(html).toContain("Count what you just read.");
  });

  test("forged cookie gets the teaser", async () => {
    const res = await GET(req("ins_reader=forged.value"));
    const html = await res.text();
    expect(html).not.toContain("Dated. Graded next issue.");
  });

  test("both branches are uncacheable text/html", async () => {
    const v = signReader("reader@example.com", SECRET);
    for (const r of [await GET(req()), await GET(req(`ins_reader=${v}`))]) {
      expect(r.headers.get("cache-control")).toBe("private, no-store");
      expect(r.headers.get("content-type")).toBe("text/html; charset=utf-8");
    }
  });
});
