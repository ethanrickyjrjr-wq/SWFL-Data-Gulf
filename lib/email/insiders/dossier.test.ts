// lib/email/insiders/dossier.test.ts
import { describe, expect, test } from "bun:test";
import { assembleIssueDossier, type RawNewsRow } from "./dossier";

const DESK_MD = `---
month: 2026-07
last_visited: 2026-07-10
last_seen_published_at: 2026-07-10T00:00:00Z
---

## 07/10/2026
- [5] Lee County expands road impact fees · url: https://example.com/fees · areas: 33905 · series: permits YoY by ZIP · why: cost shock to new construction
- [3] Naples occupancy slips · url: https://example.com/occ · series: tourism occupancy trend · why: soft signal
`;

const NEWS_ROWS: RawNewsRow[] = [
  {
    headline: "Lee County expands road impact fees",
    article_url: "https://example.com/fees",
    body_text: "Commissioners approved a fee schedule rising to $9,800 per unit.",
    source_name: "News-Press",
    published_date: "2026-07-03",
    swfl_relevance: 5,
  },
  {
    headline: "Naples occupancy slips",
    article_url: "https://example.com/occ",
    body_text: "June occupancy came in at 61.4% across beach hotels.",
    source_name: "Naples Daily News",
    published_date: "2026-07-05",
    swfl_relevance: 4,
  },
  {
    headline: "Unrelated third story",
    article_url: "https://example.com/third",
    body_text: "A council discussed sidewalks; budget of $250,000 was floated.",
    source_name: "WINK",
    published_date: "2026-07-06",
    swfl_relevance: 2,
  },
];

const BRAINS: Record<string, string> = {
  master: `# master\npreamble ignored\n--- OUTPUT ---\nDirection: cooling. Median value $412,000 as of the latest build.`,
  "permits-swfl": `# permits\nnotes\n--- OUTPUT ---\nPermits fell 12.5% YoY in Lee County.`,
};

function opts(overrides: Partial<Parameters<typeof assembleIssueDossier>[0]> = {}) {
  return {
    month: "2026-07",
    deskMd: DESK_MD,
    playbookMd: "playbook stub",
    now: new Date("2026-07-10T15:00:00Z"),
    brainSlugs: ["master", "permits-swfl"],
    readBrain: async (slug: string) => BRAINS[slug] ?? "",
    fetchNews: async () => NEWS_ROWS,
    ...overrides,
  };
}

describe("assembleIssueDossier", () => {
  test("desk picks come first with weight/why; raw rows follow; master separated from leaves", async () => {
    const d = await assembleIssueDossier(opts());
    expect(d.deskOk).toBe(true);
    expect(d.month).toBe("2026-07");
    expect(d.asOf).toBe("07/10/2026");
    expect(d.masterOutputMd).toContain("Direction: cooling");
    expect(d.masterOutputMd).not.toContain("preamble ignored");
    expect(d.brainOutputs).toHaveLength(1);
    expect(d.brainOutputs[0].slug).toBe("permits-swfl");
    // Desk picks lead, ordered by weight desc, carrying editorial fields.
    expect(d.news[0]).toMatchObject({
      url: "https://example.com/fees",
      deskWeight: 5,
      deskWhy: "cost shock to new construction",
      seriesHint: "permits YoY by ZIP",
    });
    expect(d.news[1]).toMatchObject({ url: "https://example.com/occ", deskWeight: 3 });
    // Backstop row rides behind, no desk fields.
    expect(d.news[2].url).toBe("https://example.com/third");
    expect(d.news[2].deskWeight).toBeUndefined();
  });

  test("anchors carry every number in the included feed (brain outputs + news summaries)", async () => {
    const d = await assembleIssueDossier(opts());
    const joined = d.anchors.join(" | ");
    expect(joined).toContain("412,000"); // master output
    expect(joined).toContain("12.5"); // leaf output
    expect(joined).toContain("61.4"); // news summary
  });

  test("chartMenu leads with desk seriesHints by weight, then standing defaults, deduped", async () => {
    const d = await assembleIssueDossier(opts());
    expect(d.chartMenu[0]).toBe("permits YoY by ZIP");
    expect(d.chartMenu[1]).toBe("tourism occupancy trend");
    expect(d.chartMenu).toContain("median home value trend");
    expect(new Set(d.chartMenu).size).toBe(d.chartMenu.length);
  });

  test("malformed desk file → deskOk false, raw rows only (backstop), no throw", async () => {
    const d = await assembleIssueDossier(opts({ deskMd: "not a desk file" }));
    expect(d.deskOk).toBe(false);
    expect(d.news).toHaveLength(3);
    expect(d.news.every((n) => n.deskWeight === undefined)).toBe(true);
  });

  test("null desk file (missing) behaves like the backstop", async () => {
    const d = await assembleIssueDossier(opts({ deskMd: null }));
    expect(d.deskOk).toBe(false);
    expect(d.news).toHaveLength(3);
  });
});
