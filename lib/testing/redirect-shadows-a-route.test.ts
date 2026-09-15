// lib/testing/redirect-shadows-a-route.test.ts — guard for the shape that shipped
// a dead page on 09/15/2026.
//
// PR 204 added `app/connect/page.tsx` and linked it from the homepage. It could
// never render: `next.config.ts` had carried `{ source: "/connect", destination:
// "/", permanent: true }` since 05/26/2026 (commit 8eff67af, back when the
// connect content was folded into the homepage). A Next.js redirect is matched
// BEFORE the route, so prod answered `308 → /` and the new page was unreachable
// — built, not wired, with green tests and a green deploy.
//
// A redirect whose source is also a real route is always a bug: either the page
// is dead, or the redirect is stale. Nothing legitimate needs both.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

/** Every `source:` string inside next.config.ts's redirects() block. */
function redirectSources(config: string): string[] {
  const block = config.match(/async redirects\(\)[\s\S]*?\n {2}\},/)?.[0];
  if (!block) return [];
  return [...block.matchAll(/source:\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("a redirect never shadows a real app route", () => {
  test("the extractor reads sources out of a redirects() block, and ignores headers()", () => {
    const sample = `const c = {
  async redirects() {
    return [{ source: "/old", destination: "/", permanent: true }];
  },
  async headers() {
    return [{ source: "/embed/:path*", headers: [] }];
  },
};`;
    expect(redirectSources(sample)).toEqual(["/old"]);
  });

  test("no redirect source has a page.tsx behind it", async () => {
    const config = await Bun.file(join(ROOT, "next.config.ts")).text();
    const shadowed = redirectSources(config).filter((source) => {
      // Only literal paths can shadow; patterns (:path*, (.*)) are out of scope.
      if (/[:*()[\]]/.test(source)) return false;
      const dir = join(ROOT, "app", ...source.split("/").filter(Boolean));
      return existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "page.ts"));
    });
    expect(
      shadowed,
      `next.config.ts redirects these paths, but app/ has a real page for each — ` +
        `Next matches the redirect FIRST, so the page is dead in prod (that is how ` +
        `/connect shipped as a 308 to the homepage on 09/15/2026). Delete the stale ` +
        `redirect, or delete the page.`,
    ).toEqual([]);
  });
});
