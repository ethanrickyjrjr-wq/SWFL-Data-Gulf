import { test, expect, describe } from "bun:test";
import {
  buildRenderModel,
  type Narrative,
  type SnapshotItem,
  type ExhibitSlot,
  type BrandingSlot,
  type SectionSlot,
} from "./templates";

// ---------------------------------------------------------------------------
// Fixed test fixtures — identical across all assertions (determinism tests
// need byte-for-byte identical inputs)
// ---------------------------------------------------------------------------

const NARRATIVE: Narrative = {
  exec_summary: "Lee County vacancy is tightening. New supply is constrained.",
  sections: [
    { title: "Market Conditions", intro: "Vacancy has dropped 80bps YoY." },
    { title: "Value Drivers", intro: "Cap rate compression signals demand." },
  ],
  inference_notes: [
    "[INFERENCE] If vacancy falls below 5%, expect 10–15% rent growth (falsifier: new pipeline > 500k sqft).",
  ],
};

const BRANDING: Record<string, unknown> = { logo: "acme.svg", color: "#002D62" };

const ITEMS: SnapshotItem[] = [
  // resolved chart
  {
    kind: "chart",
    id: "item-chart-1",
    added_at: "2026-06-10T00:00:00Z",
    origin: "web",
    chart_id: "chart-abc",
    title: "Vacancy by Corridor",
    chart_block: {
      title: "Vacancy by Corridor",
      columns: ["Corridor", "Vacancy %"],
      rows: [
        ["Airport-Pulling", 4.2],
        ["Bonita", 5.1],
      ],
    },
  },
  // table_slice
  {
    kind: "table_slice",
    id: "item-table-1",
    added_at: "2026-06-10T00:00:00Z",
    origin: "web",
    report_id: "cre-swfl",
    title: "Absorption Summary",
    columns: ["Quarter", "Net SF"],
    rows: [
      ["Q1 2026", 12000],
      ["Q2 2026", 8500],
    ],
    source_url: "https://swfldatagulf.com/r/cre-swfl",
    freshness_token: "SWFL-7421-v5-20260610",
  },
  // metrics (3)
  {
    kind: "metric",
    id: "item-metric-1",
    added_at: "2026-06-10T00:00:00Z",
    origin: "web",
    report_id: "cre-swfl",
    label: "Asking Rent $/sqft",
    value: "$28.40",
    source_url: "https://swfldatagulf.com/r/cre-swfl",
    source_label: "CRE SWFL",
    freshness_token: "SWFL-7421-v5-20260610",
  },
  {
    kind: "metric",
    id: "item-metric-2",
    added_at: "2026-06-10T00:00:00Z",
    origin: "web",
    report_id: "cre-swfl",
    label: "Vacancy Rate",
    value: "4.8%",
    freshness_token: "SWFL-7421-v5-20260610",
  },
  {
    kind: "metric",
    id: "item-metric-3",
    added_at: "2026-06-10T00:00:00Z",
    origin: "mcp",
    report_id: "cre-swfl",
    label: "Cap Rate",
    value: "5.9%",
    freshness_token: "SWFL-7421-v5-20260610",
  },
  // qa
  {
    kind: "qa",
    id: "item-qa-1",
    added_at: "2026-06-10T00:00:00Z",
    origin: "mcp",
    report_id: "cre-swfl",
    question: "Is Lee County a good buy?",
    answer: "Fundamentals are tight. Absorption is outpacing new supply.",
    fact: "Net absorption Q1 2026: 12,000 sf",
    freshness_token: "SWFL-7421-v5-20260610",
  },
  // sources (2)
  {
    kind: "source",
    id: "item-source-1",
    added_at: "2026-06-10T00:00:00Z",
    origin: "web",
    table: "cre_swfl",
    url: "https://swfldatagulf.com/r/cre-swfl",
    label: "CRE SWFL Brain",
  },
  {
    kind: "source",
    id: "item-source-2",
    added_at: "2026-06-10T00:00:00Z",
    origin: "web",
    table: "macro_swfl",
    url: "https://swfldatagulf.com/r/macro-swfl",
    label: "Macro SWFL Brain",
  },
  // note
  {
    kind: "note",
    id: "item-note-1",
    added_at: "2026-06-10T00:00:00Z",
    origin: "web",
    text: "Client focus: office sector only.",
  },
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("buildRenderModel — one-pager", () => {
  test("yields ≤2 exhibit slots", () => {
    const model = buildRenderModel("one-pager", NARRATIVE, ITEMS, BRANDING);
    const exhibitSlots = model.slots.filter((s) => s.kind === "exhibit");
    expect(exhibitSlots.length).toBeLessThanOrEqual(2);
  });

  test("yields ≤3 stat slots", () => {
    const model = buildRenderModel("one-pager", NARRATIVE, ITEMS, BRANDING);
    const statSlots = model.slots.filter((s) => s.kind === "stat");
    expect(statSlots.length).toBeLessThanOrEqual(3);
  });

  test("has exactly 2 exhibit slots when 2 exhibits present (chart + table_slice)", () => {
    const model = buildRenderModel("one-pager", NARRATIVE, ITEMS, BRANDING);
    const exhibitSlots = model.slots.filter((s) => s.kind === "exhibit");
    // fixtures has exactly 2 exhibit-able items (1 chart + 1 table_slice)
    expect(exhibitSlots.length).toBe(2);
  });

  test("has exactly 3 stat slots when 3 metrics present", () => {
    const model = buildRenderModel("one-pager", NARRATIVE, ITEMS, BRANDING);
    const statSlots = model.slots.filter((s) => s.kind === "stat");
    expect(statSlots.length).toBe(3);
  });

  test("truncates exhibits to 2 when more than 2 exist", () => {
    // Add a third exhibit-able item
    const extraItems: SnapshotItem[] = [
      ...ITEMS,
      {
        kind: "table_slice",
        id: "item-table-extra",
        added_at: "2026-06-10T00:00:00Z",
        origin: "web",
        report_id: "extra",
        title: "Extra Table",
        columns: ["A"],
        rows: [["x"]],
        freshness_token: "SWFL-7421-v5-20260610",
      },
    ];
    const model = buildRenderModel("one-pager", NARRATIVE, extraItems, BRANDING);
    const exhibitSlots = model.slots.filter((s) => s.kind === "exhibit");
    expect(exhibitSlots.length).toBeLessThanOrEqual(2);
  });

  test("truncates stats to 3 when more than 3 metrics exist", () => {
    const extraItems: SnapshotItem[] = [
      ...ITEMS,
      {
        kind: "metric",
        id: "item-metric-4",
        added_at: "2026-06-10T00:00:00Z",
        origin: "web",
        report_id: "cre-swfl",
        label: "Extra Metric",
        value: "99%",
        freshness_token: "SWFL-7421-v5-20260610",
      },
    ];
    const model = buildRenderModel("one-pager", NARRATIVE, extraItems, BRANDING);
    const statSlots = model.slots.filter((s) => s.kind === "stat");
    expect(statSlots.length).toBeLessThanOrEqual(3);
  });
});

describe("buildRenderModel — bov-lite", () => {
  test("branding slot is first", () => {
    const model = buildRenderModel("bov-lite", NARRATIVE, ITEMS, BRANDING);
    expect(model.slots[0].kind).toBe("branding");
  });

  test("branding slot carries the supplied branding object", () => {
    const model = buildRenderModel("bov-lite", NARRATIVE, ITEMS, BRANDING);
    const brandSlot = model.slots[0] as BrandingSlot;
    expect(brandSlot.branding).toEqual(BRANDING);
  });

  test("branding slot is first even with no branding supplied", () => {
    const model = buildRenderModel("bov-lite", NARRATIVE, ITEMS);
    expect(model.slots[0].kind).toBe("branding");
  });

  test("exec_summary follows branding", () => {
    const model = buildRenderModel("bov-lite", NARRATIVE, ITEMS, BRANDING);
    expect(model.slots[1].kind).toBe("exec_summary");
  });
});

describe("buildRenderModel — determinism", () => {
  test("identical inputs produce deeply-equal output for market-overview", () => {
    const a = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    const b = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    expect(a).toEqual(b);
  });

  test("identical inputs produce deeply-equal output for bov-lite", () => {
    const a = buildRenderModel("bov-lite", NARRATIVE, ITEMS, BRANDING);
    const b = buildRenderModel("bov-lite", NARRATIVE, ITEMS, BRANDING);
    expect(a).toEqual(b);
  });

  test("identical inputs produce deeply-equal output for client-email", () => {
    const a = buildRenderModel("client-email", NARRATIVE, ITEMS, BRANDING);
    const b = buildRenderModel("client-email", NARRATIVE, ITEMS, BRANDING);
    expect(a).toEqual(b);
  });

  test("identical inputs produce deeply-equal output for one-pager", () => {
    const a = buildRenderModel("one-pager", NARRATIVE, ITEMS, BRANDING);
    const b = buildRenderModel("one-pager", NARRATIVE, ITEMS, BRANDING);
    expect(a).toEqual(b);
  });
});

describe("buildRenderModel — market-overview", () => {
  test("includes one section slot per narrative.sections entry", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    const sectionSlots = model.slots.filter((s) => s.kind === "section") as SectionSlot[];
    expect(sectionSlots.length).toBe(NARRATIVE.sections.length);
  });

  test("section slot titles match narrative sections in order", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    const sectionSlots = model.slots.filter((s) => s.kind === "section") as SectionSlot[];
    for (let i = 0; i < NARRATIVE.sections.length; i++) {
      expect(sectionSlots[i].title).toBe(NARRATIVE.sections[i].title);
    }
  });

  test("surfaces ALL exhibits (2 in fixture)", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    const exhibitSlots = model.slots.filter((s) => s.kind === "exhibit") as ExhibitSlot[];
    // fixture has chart + table_slice = 2 exhibits
    expect(exhibitSlots.length).toBe(2);
  });

  test("exhibits include the resolved chart", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    const exhibitSlots = model.slots.filter((s) => s.kind === "exhibit") as ExhibitSlot[];
    const chartExhibit = exhibitSlots.find((e) => e.exhibit_kind === "chart");
    expect(chartExhibit).toBeDefined();
    expect(chartExhibit?.chart_block?.title).toBe("Vacancy by Corridor");
  });

  test("starts with exec_summary slot", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    expect(model.slots[0].kind).toBe("exec_summary");
  });

  test("inference_notes passed through to model", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    expect(model.inference_notes).toEqual(NARRATIVE.inference_notes);
  });
});

describe("buildRenderModel — client-email", () => {
  test("first slot is a section (subject line)", () => {
    const model = buildRenderModel("client-email", NARRATIVE, ITEMS, BRANDING);
    expect(model.slots[0].kind).toBe("section");
  });

  test("exec_summary is second slot (pyramid-first)", () => {
    const model = buildRenderModel("client-email", NARRATIVE, ITEMS, BRANDING);
    expect(model.slots[1].kind).toBe("exec_summary");
  });
});

describe("buildRenderModel — sources slot", () => {
  test("sources slot present in market-overview output", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    const sourcesSlot = model.slots.find((s) => s.kind === "sources");
    expect(sourcesSlot).toBeDefined();
  });

  test("sources slot collects explicit source items", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    const sourcesSlot = model.slots.find((s) => s.kind === "sources");
    if (!sourcesSlot || sourcesSlot.kind !== "sources") throw new Error("no sources slot");
    const urls = sourcesSlot.sources.map((s) => s.url);
    expect(urls).toContain("https://swfldatagulf.com/r/cre-swfl");
    expect(urls).toContain("https://swfldatagulf.com/r/macro-swfl");
  });
});

describe("buildRenderModel — filed qa + note are never dropped", () => {
  const TEMPLATES = ["market-overview", "bov-lite", "client-email", "one-pager"] as const;

  for (const template of TEMPLATES) {
    test(`${template}: filed qa surfaces as a qa slot with its provenance`, () => {
      const model = buildRenderModel(template, NARRATIVE, ITEMS, BRANDING);
      const qaSlot = model.slots.find((s) => s.kind === "qa");
      expect(qaSlot).toBeDefined();
      if (!qaSlot || qaSlot.kind !== "qa") throw new Error("no qa slot");
      expect(qaSlot.question).toBe("Is Lee County a good buy?");
      expect(qaSlot.answer).toContain("Absorption is outpacing new supply");
      // citation must survive into the deliverable
      expect(qaSlot.freshness_token).toBe("SWFL-7421-v5-20260610");
      expect(qaSlot.report_id).toBe("cre-swfl");
    });

    test(`${template}: filed note surfaces as a note slot`, () => {
      const model = buildRenderModel(template, NARRATIVE, ITEMS, BRANDING);
      const noteSlot = model.slots.find((s) => s.kind === "note");
      expect(noteSlot).toBeDefined();
      if (!noteSlot || noteSlot.kind !== "note") throw new Error("no note slot");
      expect(noteSlot.text).toBe("Client focus: office sector only.");
    });
  }

  test("qa/note slots land before the sources slot (when sources exist)", () => {
    const model = buildRenderModel("market-overview", NARRATIVE, ITEMS, BRANDING);
    const qaIdx = model.slots.findIndex((s) => s.kind === "qa");
    const srcIdx = model.slots.findIndex((s) => s.kind === "sources");
    expect(qaIdx).toBeGreaterThanOrEqual(0);
    expect(srcIdx).toBeGreaterThanOrEqual(0);
    expect(qaIdx).toBeLessThan(srcIdx);
  });
});
