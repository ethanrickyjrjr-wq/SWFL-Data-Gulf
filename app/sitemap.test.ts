import { describe, test, expect } from "bun:test";
import sitemap from "./sitemap";
import { IN_SCOPE_ZIPS } from "@/refinery/lib/zip-resolver.mts";
import { isCoreScope, CORE_SCOPE_ZIPS } from "@/refinery/lib/core-scope.mts";

/**
 * Pins that every in-scope ZIP (`refinery/lib/zip-resolver.mts`'s
 * `IN_SCOPE_ZIPS` — the full 6-county SWFL footprint `resolveZip().in_scope`
 * accepts, ~100 ZIPs) gets a `/r/zip-report/[zip]` sitemap entry — those pages
 * render live, unique per-ZIP data but were entirely absent from the sitemap
 * before 09/02/2026. The list is read from the resolver's own data source,
 * never hand-typed, so it can't drift from the set the pages actually cover.
 * Priority favors the data-richer core-scope ZIPs (Lee + Collier, 57 of the
 * 100) without excluding the rest.
 */
describe("sitemap", () => {
  test("emits one /r/zip-report/[zip] entry per in-scope ZIP (full 6-county footprint)", async () => {
    // Pin the two counts this section depends on so a crosswalk-fixture drift
    // fails loudly here instead of silently shrinking/growing the sitemap.
    expect(IN_SCOPE_ZIPS.size).toBe(100);
    expect(CORE_SCOPE_ZIPS.size).toBe(57);

    const entries = await sitemap();
    const zipEntries = entries.filter((e) => e.url.includes("/r/zip-report/"));

    expect(zipEntries.length).toBe(IN_SCOPE_ZIPS.size);

    const byUrl = new Map(zipEntries.map((e) => [e.url, e]));
    for (const zip of IN_SCOPE_ZIPS) {
      const url = `https://www.swfldatagulf.com/r/zip-report/${zip}`;
      const entry = byUrl.get(url);
      expect(entry).toBeDefined();
      expect(entry?.changeFrequency).toBe("weekly");
      // Core-scope (Lee+Collier) ZIPs rank higher than the rest of the
      // 6-county footprint (Charlotte/Sarasota/Glades/Hendry).
      expect(entry?.priority).toBe(isCoreScope(zip) ? 0.7 : 0.5);
    }

    // Both priority tiers are actually represented — a regression that
    // collapsed everyone onto one priority would slip past a size-only check.
    const priorities = new Set(zipEntries.map((e) => e.priority));
    expect(priorities.has(0.7)).toBe(true);
    expect(priorities.has(0.5)).toBe(true);
  });

  test("every entry is a fully-qualified swfldatagulf.com URL", async () => {
    const entries = await sitemap();
    for (const e of entries) {
      expect(e.url.startsWith("https://www.swfldatagulf.com")).toBe(true);
    }
  });
});
