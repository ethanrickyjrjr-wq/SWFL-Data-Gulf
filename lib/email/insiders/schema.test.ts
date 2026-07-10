// lib/email/insiders/schema.test.ts
import { describe, expect, test } from "bun:test";
import { FIXTURE_ISSUE_DOC, ISSUE_DOC_JSON_SCHEMA, IssueDocSchema } from "./schema";

const VALID = {
  issue_slug: "2026-07",
  subject: "The Insiders Edition — July 2026: the impact-fee squeeze",
  as_of: "07/10/2026",
  the_read: ["Paragraph one of the thesis.", "Paragraph two."],
  stories: [
    {
      headline: "Impact fees jump",
      what_happened: "Lee County approved higher road impact fees [1].",
      our_data: "Permits in the affected ZIPs had already slowed [2].",
      analog: "Austin's fee hike preceded a permit dip [3].",
    },
    {
      headline: "Occupancy softens",
      what_happened: "June occupancy slipped [4].",
      our_data: "Our tourism series shows the same drift [2].",
      analog: "Sarasota played out similarly [5].",
    },
  ],
  dashboard: [
    { question: "permits YoY by ZIP for Lee County", why: "quantifies the fee-shock exposure" },
    { question: "tourism occupancy trend", why: "anchors the soft-season story" },
    { question: "median home value trend", why: "the month's base market context" },
  ],
  forward_look: [
    {
      claim: "Permit volume in fee-affected ZIPs falls further by fall.",
      base_source_n: 2,
      falsifier: "September permits flat or up vs June in those ZIPs.",
    },
    {
      claim: "Occupancy stabilizes by October.",
      base_source_n: 4,
      falsifier: "October occupancy below September.",
    },
  ],
  sources: [
    { n: 1, url: "https://example.com/fees", label: "News-Press, fee vote" },
    { n: 2, url: "https://www.swfldatagulf.com/r/source/permits", label: "SWFL Data Gulf permits" },
    { n: 3, url: "https://example.com/austin", label: "Austin analog" },
    { n: 4, url: "https://example.com/occ", label: "Occupancy report" },
    { n: 5, url: "https://example.com/sarasota", label: "Sarasota analog" },
  ],
};

describe("IssueDocSchema", () => {
  test("accepts a complete issue", () => {
    const r = IssueDocSchema.safeParse(VALID);
    expect(r.success).toBe(true);
  });

  test("rejects: bad slug, <2 stories, <3 charts, projection without falsifier, source ref to nowhere", () => {
    expect(IssueDocSchema.safeParse({ ...VALID, issue_slug: "july" }).success).toBe(false);
    expect(IssueDocSchema.safeParse({ ...VALID, stories: [VALID.stories[0]] }).success).toBe(false);
    expect(
      IssueDocSchema.safeParse({ ...VALID, dashboard: VALID.dashboard.slice(0, 2) }).success,
    ).toBe(false);
    expect(
      IssueDocSchema.safeParse({
        ...VALID,
        forward_look: [{ ...VALID.forward_look[0], falsifier: "" }, VALID.forward_look[1]],
      }).success,
    ).toBe(false);
    expect(
      IssueDocSchema.safeParse({
        ...VALID,
        forward_look: [{ ...VALID.forward_look[0], base_source_n: 99 }, VALID.forward_look[1]],
      }).success,
    ).toBe(false);
  });

  test("rejects a prose [n] reference that resolves to no source", () => {
    const withDanglingRef = {
      ...VALID,
      the_read: ["A thesis citing a ghost [9].", "Paragraph two."],
    };
    expect(IssueDocSchema.safeParse(withDanglingRef).success).toBe(false);
  });

  test("rejects duplicate source numbers", () => {
    const dup = {
      ...VALID,
      sources: [...VALID.sources.slice(0, 4), { ...VALID.sources[4], n: 4 }],
    };
    expect(IssueDocSchema.safeParse(dup).success).toBe(false);
  });

  test("JSON schema is structured-outputs-safe: additionalProperties false on every object", () => {
    const walk = (o: unknown): void => {
      if (!o || typeof o !== "object") return;
      const rec = o as Record<string, unknown>;
      if (rec.type === "object") expect(rec.additionalProperties).toBe(false);
      for (const v of Object.values(rec)) walk(v);
    };
    walk(ISSUE_DOC_JSON_SCHEMA);
  });

  test("FIXTURE_ISSUE_DOC builds a schema-valid mock from dossier content only", () => {
    const doc = FIXTURE_ISSUE_DOC({
      month: "2026-07",
      asOf: "07/10/2026",
      news: [
        {
          headline: "Impact fees jump",
          url: "https://example.com/fees",
          publishedAt: "2026-07-03",
          summary: "Lee County approved higher fees.",
        },
      ],
      chartMenu: ["permits YoY by ZIP"],
    });
    const r = IssueDocSchema.safeParse(doc);
    expect(r.success).toBe(true);
    // The mock never free-types a figure: no digits outside as_of/slug/refs/sources.
    const prose = [
      ...doc.the_read,
      ...doc.stories.flatMap((s) => [s.what_happened, s.our_data, s.analog]),
      ...doc.forward_look.flatMap((f) => [f.claim, f.falsifier]),
    ].join(" ");
    expect(prose.replace(/\[\d+\]/g, "")).not.toMatch(/\d/);
  });
});
