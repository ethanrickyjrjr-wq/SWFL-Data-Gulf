// lib/email/insiders/lint.test.ts
import { describe, expect, test } from "bun:test";
import { lintIssueProse } from "./lint";
import type { IssueDoc } from "./schema";

const ALLOWED = new Set(["https://example.com/fees", "https://www.swfldatagulf.com/"]);
const ANCHORS = ["$9,800", "12.5%", "412,000"];

function doc(overrides: Partial<IssueDoc> = {}): IssueDoc {
  return {
    issue_slug: "2026-07",
    subject: "The impact-fee squeeze",
    as_of: "07/10/2026",
    the_read: ["Fees rose to $9,800 per unit [1].", "Permits were already sliding."],
    stories: [
      {
        headline: "Impact fees jump",
        what_happened: "Commissioners approved the increase [1].",
        our_data: "Permits fell 12.5% before the vote [2].",
        analog: "The pattern echoes an earlier fee cycle in 2021 [1].",
      },
      {
        headline: "Second story",
        what_happened: "Another development happened [1].",
        our_data: "Median value sits at 412,000 [2].",
        analog: "Comparable markets behaved the same way [1].",
      },
    ],
    dashboard: [
      { question: "permits YoY by ZIP", why: "exposure" },
      { question: "median home value trend", why: "context" },
      { question: "tourism occupancy trend", why: "season" },
    ],
    forward_look: [
      { claim: "Permits fall further.", base_source_n: 2, falsifier: "September permits rise." },
      { claim: "Values hold.", base_source_n: 2, falsifier: "Median drops below the held base." },
    ],
    sources: [
      { n: 1, url: "https://example.com/fees", label: "News-Press" },
      { n: 2, url: "https://www.swfldatagulf.com/", label: "SWFL Data Gulf" },
    ],
    ...overrides,
  };
}

describe("lintIssueProse", () => {
  test("fully-anchored prose passes; [n] refs and bare years are not figures", () => {
    const r = lintIssueProse(doc(), ANCHORS, [], ALLOWED);
    expect(r.violations).toEqual([]);
    expect(r.ok).toBe(true);
  });

  test("an unanchored figure blocks, naming section and token", () => {
    const bad = doc({ the_read: ["Prices rose 14.7% this month.", "Second paragraph."] });
    const r = lintIssueProse(bad, ANCHORS, [], ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.section === "the_read[0]" && v.token === "14.7%")).toBe(true);
  });

  test("a figure present only in a chart grounding note anchors", () => {
    const withChartFig = doc({ the_read: ["Occupancy hit 61.4% in June [1].", "Second."] });
    const notes = ["Beach hotels occupancy: 61.4% (June)"];
    expect(lintIssueProse(withChartFig, ANCHORS, notes, ALLOWED).ok).toBe(true);
    expect(lintIssueProse(withChartFig, ANCHORS, [], ALLOWED).ok).toBe(false);
  });

  test("system nouns in reader-facing prose block", () => {
    const jargon = doc({ the_read: ["The master brain says so.", "Second paragraph."] });
    const r = lintIssueProse(jargon, ANCHORS, [], ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.message.includes("system noun"))).toBe(true);
  });

  test("as-of restated in prose blocks (stated once, by the renderer)", () => {
    const restate = doc({
      the_read: ["As of 07/10/2026, everything changed.", "Second paragraph."],
    });
    const r = lintIssueProse(restate, ANCHORS, [], ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.message.includes("as-of"))).toBe(true);
  });

  test("a source url outside the dossier blocks (the model cannot mint URLs)", () => {
    const minted = doc({
      sources: [
        { n: 1, url: "https://example.com/fees", label: "News-Press" },
        { n: 2, url: "https://invented.example.net/report", label: "Ghost source" },
      ],
    });
    const r = lintIssueProse(minted, ANCHORS, [], ALLOWED);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.token === "https://invented.example.net/report")).toBe(true);
  });
});
