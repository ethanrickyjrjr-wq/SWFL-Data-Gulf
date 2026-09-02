import { describe, test, expect } from "bun:test";
import { zipReportMetadata } from "./metadata";

describe("zipReportMetadata", () => {
  test("in-scope ZIP gets place-named title, description, and canonical", () => {
    const m = zipReportMetadata("33931"); // Fort Myers Beach, Lee
    // No "— SWFL Data Gulf" here — layout.tsx's title.template ("%s — SWFL
    // Data Gulf") appends it exactly once at render time. Baking it in here
    // too doubled the live <title> (caught on /r/zip-report/33904 09/02/2026).
    expect(m.title).toMatch(/33931 Market Report$/);
    expect(m.title).not.toMatch(/SWFL Data Gulf/);
    expect(m.title).not.toMatch(/^ZIP /); // place resolved, not the bare fallback
    expect(m.description).toContain("33931");
    expect(m.description).toContain("Lee County");
    expect(m.description).toContain("cited to the source");
    expect(m.alternates?.canonical).toBe("/r/zip-report/33931");
  });

  test("out-of-scope ZIP gets the minimal fallback — no invented place", () => {
    const m = zipReportMetadata("33101"); // Miami
    expect(m.title).toBe("ZIP Report");
    expect(m.description).toBeUndefined();
    expect(m.alternates).toBeUndefined();
  });

  test("malformed ZIP gets the minimal fallback", () => {
    expect(zipReportMetadata("abc").title).toBe("ZIP Report");
    expect(zipReportMetadata("339").title).toBe("ZIP Report");
  });
});
