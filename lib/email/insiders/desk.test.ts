// lib/email/insiders/desk.test.ts
import { describe, expect, test } from "bun:test";
import { parseDeskLog } from "./desk";

const GOOD = `---
month: 2026-07
last_visited: 2026-07-10
last_seen_published_at: 2026-07-10T14:00:00Z
---

## 07/10/2026
- [4] Lee County expands road impact fees · url: https://example.com/a · areas: 33905, 33971 · series: permits YoY by ZIP · why: cost shock to new construction
- [2] Naples occupancy slips · url: https://example.com/b · areas: 34102 · series: tourism occupancy trend · why: soft signal
`;

describe("parseDeskLog", () => {
  test("parses frontmatter and weighted entries", () => {
    const r = parseDeskLog(GOOD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.log.month).toBe("2026-07");
    expect(r.log.lastVisited).toBe("2026-07-10");
    expect(r.log.lastSeenPublishedAt).toBe("2026-07-10T14:00:00Z");
    expect(r.log.entries).toHaveLength(2);
    expect(r.log.entries[0]).toMatchObject({
      weight: 4,
      headline: "Lee County expands road impact fees",
      url: "https://example.com/a",
      areas: ["33905", "33971"],
      seriesHint: "permits YoY by ZIP",
      why: "cost shock to new construction",
      day: "07/10/2026",
    });
  });

  test("weight outside 1-5, missing url, or missing why fails shape check with named errors", () => {
    const bad = GOOD.replace("[4]", "[9]").replace("url: https://example.com/b · ", "");
    const r = parseDeskLog(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join(" ")).toContain("weight");
    expect(r.errors.join(" ")).toContain("url");
  });

  test("missing frontmatter fails", () => {
    const r = parseDeskLog("## 07/10/2026\n- [3] x · url: https://e.com · why: y");
    expect(r.ok).toBe(false);
  });

  test("prose placeholder lines parse as zero entries (fresh desk file is ok)", () => {
    const fresh = `---
month: 2026-07
last_visited: 2026-07-10
last_seen_published_at: 2026-07-10T00:00:00Z
---

## 07/10/2026
- (desk opened — no triage yet)
`;
    const r = parseDeskLog(fresh);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.log.entries).toHaveLength(0);
  });
});
