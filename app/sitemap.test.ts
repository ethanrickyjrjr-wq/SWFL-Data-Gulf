import { describe, test, expect } from "bun:test";
import sitemap from "./sitemap";
import { CORE_SCOPE_ZIPS } from "@/refinery/lib/core-scope.mts";

/**
 * Pins that every core-scope ZIP (Lee + Collier, the same 57-ZIP authority
 * lib/zip-report/candidates.ts ranks against) gets a `/r/zip-report/[zip]`
 * sitemap entry — those pages render live, unique per-ZIP data but were
 * entirely absent from the sitemap before 09/02/2026. The list is read from
 * `refinery/lib/core-scope.mts`, never hand-typed, so it can't drift from the
 * set the ranked ZIP pages actually cover.
 */
describe("sitemap", () => {
  test("emits one /r/zip-report/[zip] entry per core-scope ZIP", async () => {
    const entries = await sitemap();
    const zipUrls = entries.filter((e) => e.url.includes("/r/zip-report/"));

    expect(zipUrls.length).toBe(CORE_SCOPE_ZIPS.size);

    const urlSet = new Set(zipUrls.map((e) => e.url));
    for (const zip of CORE_SCOPE_ZIPS) {
      expect(urlSet.has(`https://www.swfldatagulf.com/r/zip-report/${zip}`)).toBe(true);
    }

    for (const e of zipUrls) {
      expect(e.changeFrequency).toBe("weekly");
      expect(e.priority).toBe(0.7);
    }
  });

  test("every entry is a fully-qualified swfldatagulf.com URL", async () => {
    const entries = await sitemap();
    for (const e of entries) {
      expect(e.url.startsWith("https://www.swfldatagulf.com")).toBe(true);
    }
  });
});
