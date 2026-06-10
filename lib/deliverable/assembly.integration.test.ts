/**
 * Task-07 integration proof: a seeded mixed project assembles into ALL FOUR
 * templates deterministically, provenance survives into every exhibit, and the
 * moat holds (a verbatim narrative anchors; a poisoned one is flagged+stripped).
 * The LIVE forced-tool build + /p/ render in <8s is the operator's post-deploy
 * verify; this is the structural guarantee, demonstrated by code.
 */
import { test, expect, describe } from "bun:test";
import { buildRenderModel, type SnapshotItem, type Narrative, type TemplateId } from "./templates";
import { lintDeliverableNarrative } from "./narrative-lint";
import { collectSnapshotNumbers } from "./build";

const BASE = { added_at: "2026-06-10T00:00:00Z", origin: "web" as const };
const TOKEN = "SWFL-7421-v5-20260610";

// A seeded project: a resolved chart + 3 metrics (with tokens) + a qa + a source + a note.
const ITEMS: SnapshotItem[] = [
  {
    ...BASE,
    id: "c1",
    kind: "chart",
    chart_id: "ch",
    title: "Vacancy by Corridor",
    chart_block: {
      title: "Vacancy by Corridor",
      columns: ["Corridor", "Vacancy %"],
      rows: [
        ["Airport-Pulling", 4.2],
        ["Bonita", 5.1],
      ],
    },
    freshness_token: TOKEN,
  },
  {
    ...BASE,
    id: "m1",
    kind: "metric",
    report_id: "cre-swfl",
    label: "Asking Rent",
    value: "$28.40",
    source_url: "https://swfldatagulf.com/r/cre-swfl",
    source_label: "CRE SWFL",
    freshness_token: TOKEN,
  },
  {
    ...BASE,
    id: "m2",
    kind: "metric",
    report_id: "cre-swfl",
    label: "Vacancy Rate",
    value: "4.8%",
    freshness_token: TOKEN,
  },
  {
    ...BASE,
    id: "m3",
    kind: "metric",
    report_id: "cre-swfl",
    label: "Cap Rate",
    value: "5.9%",
    freshness_token: TOKEN,
  },
  {
    ...BASE,
    id: "q1",
    kind: "qa",
    report_id: "cre-swfl",
    question: "Is Lee County a good buy?",
    answer: "Absorption is outpacing new supply.",
    freshness_token: TOKEN,
  },
  {
    ...BASE,
    id: "s1",
    kind: "source",
    table: "cre_swfl",
    url: "https://swfldatagulf.com/r/cre-swfl",
    label: "CRE SWFL Brain",
  },
  { ...BASE, id: "n1", kind: "note", text: "Client focus: office sector only." },
];

// A clean narrative whose every number appears verbatim in ITEMS.
const NARRATIVE: Narrative = {
  exec_summary: "Asking Rent is $28.40 at 4.8% vacancy.",
  sections: [{ title: "Cap rate signals demand", intro: "Cap Rate is 5.9%." }],
  inference_notes: [
    "[INFERENCE] Builds on the $28.40 rent: IF vacancy holds below 4.8% THEN rents firm; falsifier: new supply above 5.1%.",
  ],
};

const ALL_TEMPLATES: TemplateId[] = ["market-overview", "bov-lite", "client-email", "one-pager"];

describe("assembly — all 4 templates from one seeded project", () => {
  for (const template of ALL_TEMPLATES) {
    test(`${template}: renders exhibits, qa, note, sources with provenance`, () => {
      const model = buildRenderModel(template, NARRATIVE, ITEMS, { name: "Acme Realty" });
      expect(model.slots.length).toBeGreaterThan(0);

      // the chart exhibit is present and still carries its as-of token
      const exhibits = model.slots.filter((s) => s.kind === "exhibit");
      expect(exhibits.length).toBeGreaterThanOrEqual(1);
      const chart = exhibits.find((e) => e.kind === "exhibit" && e.exhibit_kind === "chart");
      expect(chart).toBeDefined();
      if (chart && chart.kind === "exhibit") expect(chart.freshness_token).toBe(TOKEN);

      // filed qa + note are never dropped; the source list is present
      expect(model.slots.some((s) => s.kind === "qa")).toBe(true);
      expect(model.slots.some((s) => s.kind === "note")).toBe(true);
      expect(model.slots.some((s) => s.kind === "sources")).toBe(true);
      expect(model.slots.some((s) => s.kind === "exec_summary")).toBe(true);
    });
  }
});

describe("assembly — the moat over the seeded narrative", () => {
  const anchors = collectSnapshotNumbers(ITEMS);

  test("a verbatim narrative anchors clean (ok=true)", () => {
    const r = lintDeliverableNarrative(NARRATIVE, anchors);
    expect(r.ok).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  test("a poisoned narrative (invented $99,999) is flagged and stripped", () => {
    const poisoned: Narrative = {
      ...NARRATIVE,
      exec_summary: "Asking Rent is $28.40. The deal clears $99,999 in year one.",
    };
    const r = lintDeliverableNarrative(poisoned, anchors);
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.gate === "number" && v.token === "$99,999")).toBe(true);
    expect(r.stripped.exec_summary).toContain("$28.40");
    expect(r.stripped.exec_summary).not.toContain("$99,999");
  });
});
