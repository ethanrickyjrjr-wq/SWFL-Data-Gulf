// lib/deliverable/recipes/market-pulse.test.ts
//
// R12 · MONTHLY MARKET PULSE — the pure half of the builder.
//
// What these pin is the moat, not the prose: the subject resolves from a real
// crosswalk, every plotted number is copied out of a held brain row, the chart's
// chip is the MONTH-over-month column (never the YoY column sitting next to it),
// the caption's as-of is the DATA's period (never the build date), and the title
// never claims "every ZIP" when the frame can only draw eight.
//
// Row values below are the REAL 07/13/2026 bytes of brains/home-values-swfl.md
// (Cape Coral, period 2026-04-30) — a fixture that lies is worse than no fixture.

import { describe, expect, test } from "bun:test";
import {
  allowedNumbers,
  biggestMover,
  chartCaption,
  chartTitleFor,
  fmtMom,
  momChartSpec,
  movesForZips,
  publicCitation,
  readViolations,
  resolveArea,
  tally,
} from "./market-pulse";
import type { RecipeBuildContext } from "./index";
import type { BrainOutput, BrainOutputDetailTable } from "@/refinery/types/brain-output.mts";

// The six real Cape Coral rows, verbatim from the brain's home_values_by_zip table.
const CAPE: Array<[string, number, number, number]> = [
  // [zip, home_value_zhvi, value_yoy_pct, value_mom_pct]
  ["33904", 342030, -8.34, -0.05],
  ["33909", 298038, -8.16, -0.31],
  ["33914", 422133, -6.84, -0.12],
  ["33990", 325571, -7.17, -0.22],
  ["33991", 361732, -6.52, -0.19],
  ["33993", 330214, -8.02, -0.39],
];

const TABLE: BrainOutputDetailTable = {
  id: "home_values_by_zip",
  title: "Home values by ZIP",
  grain: "zip",
  columns: [
    { id: "city", label: "City" },
    { id: "latest_period", label: "Latest period" },
    { id: "home_value_zhvi", label: "Home value (USD)", display_format: "currency" },
    { id: "value_yoy_pct", label: "Value YoY %", display_format: "percent" },
    { id: "value_mom_pct", label: "Value MoM %", display_format: "percent" },
  ],
  rows: CAPE.map(([zip, value, yoy, mom]) => ({
    key: zip,
    label: zip,
    cells: {
      city: "Cape Coral",
      latest_period: "2026-04-30",
      home_value_zhvi: value,
      value_yoy_pct: yoy,
      value_mom_pct: mom,
    },
  })),
  source: {
    url: "https://files.zillowstatic.com/research/public_csvs/zhvi/Zip_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv",
    fetched_at: "2026-06-12T02:19:57Z",
    tier: 3,
    citation: "Zillow Home Value Index (ZHVI), ZIP-level all-homes.",
  },
};

// bindRankedDeltaSpec reads only refined_at + detail_tables.
const OUTPUT = {
  refined_at: "2026-06-12T02:19:58Z",
  detail_tables: [TABLE],
} as unknown as BrainOutput;

const ctx = (over: Partial<RecipeBuildContext>): RecipeBuildContext =>
  ({
    prompt: "",
    currentDoc: { globalStyle: {}, blocks: [] },
    facts: null,
    resolved: false,
    ...over,
  }) as RecipeBuildContext;

describe("subject — resolved once, from a real record", () => {
  test("a multi-ZIP city resolves to EVERY ZIP it spans (Cape Coral is six, not one)", () => {
    const area = resolveArea(ctx({ prompt: "Build a monthly market-pulse email for Cape Coral" }));
    expect(area?.place).toBe("Cape Coral");
    expect(area?.zips.length).toBeGreaterThanOrEqual(6);
    expect(area?.zips).toContain("33914");
    expect(area?.zips).toContain("33993");
  });

  test("a ZIP handed in by a door wins over the prompt", () => {
    const area = resolveArea(ctx({ prompt: "...for Cape Coral", zip: "33901" }));
    expect(area).toEqual({ place: "33901", zips: ["33901"] });
  });

  test("no place named → null (degrade to the generic author, never a fake subject)", () => {
    expect(resolveArea(ctx({ prompt: "Build me something nice" }))).toBeNull();
  });
});

describe("cells — every number is copied out of a held row", () => {
  test("movesForZips returns only ZIPs the brain actually covers", () => {
    const moves = movesForZips(TABLE, ["33914", "33993", "99999"]);
    expect(moves.map((m) => m.zip)).toEqual(["33914", "33993"]);
    // verbatim, not re-derived
    expect(moves[0]).toMatchObject({ value: 422133, mom: -0.12, city: "Cape Coral" });
  });

  test("a row missing its value or its move is DROPPED, never plotted as zero", () => {
    const holey: BrainOutputDetailTable = {
      ...TABLE,
      rows: [
        { key: "33901", label: "33901", cells: { home_value_zhvi: 264506, value_mom_pct: null } },
        { key: "33905", label: "33905", cells: { home_value_zhvi: null, value_mom_pct: -0.27 } },
        { key: "33907", label: "33907", cells: { home_value_zhvi: 207438, value_mom_pct: -0.57 } },
      ],
    };
    const moves = movesForZips(holey, ["33901", "33905", "33907"]);
    expect(moves.map((m) => m.zip)).toEqual(["33907"]);
    expect(moves.some((m) => m.mom === 0 || m.value === 0)).toBe(false);
  });

  test("the biggest mover is a SELECTION out of the rows (largest absolute move)", () => {
    const moves = movesForZips(
      TABLE,
      CAPE.map(([z]) => z),
    );
    expect(biggestMover(moves)?.zip).toBe("33993");
    expect(biggestMover(moves)?.mom).toBe(-0.39);
    expect(biggestMover([])).toBeNull();
  });

  test("the sign of a move is never dropped", () => {
    expect(fmtMom(-0.39)).toBe("−0.39%");
    expect(fmtMom(0.21)).toBe("+0.21%");
    expect(fmtMom(0)).toBe("0.00%");
  });
});

describe("chart — zip-mom-move, and it must be the MONTH column", () => {
  const moves = movesForZips(
    TABLE,
    CAPE.map(([z]) => z),
  );

  test("the chip is the MoM move, NOT the YoY sitting next to it in the table", () => {
    const spec = momChartSpec(OUTPUT, TABLE, moves, "Cape Coral");
    const items = spec?.options?.items as Array<{ label: string; value: number; delta: number }>;
    const cape93 = items.find((i) => i.label === "33993")!;
    expect(cape93.value).toBe(330214);
    // The month-over-month move — the whole point of this recipe.
    expect(cape93.delta).toBe(-0.39);
    // The YoY value for 33993 is -8.02. If THAT leaked into the chip, the email
    // would show a year's decline under a "month-over-month" headline.
    expect(items.some((i) => i.delta === -8.02)).toBe(false);
  });

  test("every plotted bar traces to a held row — no bar the brain didn't publish", () => {
    const spec = momChartSpec(OUTPUT, TABLE, moves, "Cape Coral");
    const items = spec?.options?.items as Array<{ label: string; value: number; delta: number }>;
    const held = new Map(CAPE.map(([z, v, , m]) => [z, { v, m }]));
    for (const i of items) {
      expect(held.has(i.label)).toBe(true);
      expect(i.value).toBe(held.get(i.label)!.v);
      expect(i.delta).toBe(held.get(i.label)!.m);
    }
    expect(items.length).toBe(6);
  });

  test("as-of is the DATA's period, not the day we rebuilt the brain", () => {
    const spec = momChartSpec(OUTPUT, TABLE, moves, "Cape Coral");
    // refined_at is 2026-06-12; the ZHVI period is 2026-04-30. The reader is told
    // when the MARKET was measured.
    expect(spec?.asOf).toBe("2026-04-30");
  });

  test("the chart carries its real source citation", () => {
    const spec = momChartSpec(OUTPUT, TABLE, moves, "Cape Coral");
    expect(spec?.source?.citation).toContain("Zillow Home Value Index");
  });

  test("no rows → no chart (a bonus, never a blocker; never an empty box)", () => {
    expect(momChartSpec(OUTPUT, TABLE, [], "Cape Coral")).toBeNull();
  });
});

describe("title — it never claims more ZIPs than the reader can see", () => {
  test("a fully covered, fully drawn set says 'by ZIP' (Cape Coral: 6 of 6)", () => {
    expect(chartTitleFor("Cape Coral", 6, 6, 6)).toBe("Cape Coral · month-over-month move by ZIP");
  });

  test("a COVERAGE gap says so — Fort Myers spans 9 ZIPs, the index publishes 8", () => {
    const t = chartTitleFor("Fort Myers", 8, 8, 9);
    expect(t).toContain("8 of 9 ZIPs");
    expect(t).not.toContain("every");
  });

  test("a TRUNCATED set says so — the frame draws 8 bars, so 12 ZIPs must not claim every", () => {
    const t = chartTitleFor("Naples", 8, 12, 12);
    expect(t).toContain("top 8 of 12");
    expect(t).not.toContain("every");
  });

  test("the title fits the PNG — rankedDeltaSvg would run it off a 600px canvas past ~50 chars", () => {
    expect(chartTitleFor("Bonita Springs", 8, 8, 9).length).toBeLessThanOrEqual(55);
  });
});

describe("prose gate — the model writes prose, never a number and never a count", () => {
  const moves = movesForZips(
    TABLE,
    CAPE.map(([z]) => z),
  );
  const t = tally(moves);
  const allowed = allowedNumbers(moves, t, "04/30/2026");

  test("the tally is computed in code, not counted by the model", () => {
    expect(t).toEqual({ total: 6, fell: 6, rose: 0, flat: 0, uniform: true });
  });

  test("a held figure quoted verbatim passes", () => {
    const ok = "ZIP 33993 fell −0.39% on a $330,214 base, as of 04/30/2026.";
    expect(readViolations(ok, allowed, t)).toEqual([]);
  });

  test("a number we never handed it is caught (a rounded figure is still invented)", () => {
    expect(readViolations("Values slipped about −0.3% across the city.", allowed, t)).toContain(
      "−0.3%",
    );
  });

  test("THE LIVE FAILURE: an invented word-count is caught ('five of the six ZIPs')", () => {
    // Sonnet wrote exactly this on 07/13/2026. The true answer was four. It carries no
    // digits, so a digit-only lint sails right past it.
    const bad = "Five of the six ZIPs fell between −0.05% and −0.22%.";
    expect(readViolations(bad, allowed, t).length).toBeGreaterThan(0);
  });

  test("vague grouping is caught — 'most ZIPs' is a count we never gave it", () => {
    expect(readViolations("Most ZIPs slipped this month.", allowed, t).length).toBeGreaterThan(0);
  });

  test("'every ZIP fell' is a FACT when every ZIP fell, and a fabrication when it didn't", () => {
    const claim = "Every ZIP moved lower.";
    expect(readViolations(claim, allowed, t)).toEqual([]); // uniform: all 6 fell
    const mixed = tally([...moves.slice(0, 5), { ...moves[5], mom: 0.4 }]);
    expect(mixed.uniform).toBe(false);
    expect(readViolations(claim, allowed, mixed).length).toBeGreaterThan(0);
  });
});

describe("citation — no internal system noun ever reaches a reader", () => {
  test("the lake's table name is scrubbed out of the citation (it is BURNED INTO the PNG)", () => {
    const raw =
      "Zillow Home Value Index (ZHVI), ZIP-level all-homes. Source: Zillow Research; Tier 2 cache: data_lake.zhvi_swfl.";
    const clean = publicCitation(raw);
    expect(clean).not.toContain("data_lake");
    expect(clean).not.toContain("Tier 2 cache");
    expect(clean).toContain("Zillow Home Value Index");
  });

  test("the caption never exceeds the EmailDoc schema's 200-char cap", () => {
    // A caption over 200 doesn't just lose the caption — EmailDocSchema rejects the
    // doc and the ENTIRE build silently falls through to the generic author.
    const cap = chartCaption(
      "Fort Myers · month-over-month move (8 of 9 ZIPs)",
      "Zillow Home Value Index (ZHVI), ZIP-level all-homes (SFR + Condo) middle-tier (0.33-0.67) seasonally-adjusted. Source: Zillow Research (files.zillowstatic.com)",
      "04/30/2026",
    );
    expect(cap.length).toBeLessThanOrEqual(200);
    // The title and the as-of are load-bearing — the citation takes the trim.
    expect(cap).toContain("8 of 9 ZIPs");
    expect(cap).toContain("as of 04/30/2026");
    expect(cap).toContain("Zillow Home Value Index");
  });
});
