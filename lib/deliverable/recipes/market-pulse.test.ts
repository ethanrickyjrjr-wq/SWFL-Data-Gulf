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
  auditConnective,
  auditRead,
  biggestMover,
  chartCaption,
  chartTitleFor,
  composePulseRead,
  fmtMom,
  momChartSpec,
  movesForZips,
  publicCitation,
  pulseSystemPrompt,
  pulseUserMessage,
  resolveArea,
  settledPulseFacts,
  tally,
} from "./market-pulse";
import { CLAIM_PROHIBITION } from "@/lib/deliverable/claims";
import type { RecipeBuildContext } from "./index";
import type { ZipMove } from "./market-pulse";
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

  test("given MORE than 8 real ZIP moves, momChartSpec's own items are capped at 8 — not just the title", () => {
    // Build 12 synthetic moves reusing the fixture's shape/columns; only the
    // COUNT matters here, not realism of the values (title-truncation is
    // already covered by the "top 8 of 12" test above).
    const twelveMoves: ZipMove[] = Array.from({ length: 12 }, (_, i) => ({
      zip: `3390${i}`,
      city: "Naples",
      value: 300000 + i,
      mom: -0.1,
      period: "2026-04-30",
    }));
    const projectedTable: BrainOutputDetailTable = {
      ...TABLE,
      rows: twelveMoves.map((m) => ({ key: m.zip, cells: TABLE.rows[0]?.cells ?? {} })),
    };
    const spec = momChartSpec(OUTPUT, projectedTable, twelveMoves, "Naples");
    const items = spec?.options?.items as Array<unknown>;
    expect(items.length).toBe(8);
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

// ── THE CLAIM GATE ────────────────────────────────────────────────────────────
//
// THE DEFECT: given the six real Cape Coral rows and told in plain English not to
// count them, Sonnet wrote "Five of those six ZIPs" — and the answer was FOUR.
//
// A MIXED month is what exposes it, so the block below builds one: the six REAL Cape
// rows with the signs of two flipped. It is a CONSTRUCTED scenario, not a claim about
// Cape Coral — it exists so the true count (4 fell, 2 rose) is a number a wrong answer
// can actually be wrong about. Six rows all falling cannot catch an off-by-one.
const MIXED: Array<[string, number, number]> = [
  // [zip, home_value_zhvi, value_mom_pct] — real values; 33904 and 33914 flipped positive.
  ["33904", 342030, +0.05],
  ["33909", 298038, -0.31],
  ["33914", 422133, +0.12],
  ["33990", 325571, -0.22],
  ["33991", 361732, -0.19],
  ["33993", 330214, -0.39],
];
const MIXED_TABLE: BrainOutputDetailTable = {
  ...TABLE,
  rows: MIXED.map(([zip, value, mom]) => ({
    key: zip,
    label: zip,
    cells: {
      city: "Cape Coral",
      latest_period: "2026-04-30",
      home_value_zhvi: value,
      value_yoy_pct: -7.5,
      value_mom_pct: mom,
    },
  })),
};

describe("the claim gate — CODE counts, and the narrator is never given a set to count", () => {
  const moves = movesForZips(
    MIXED_TABLE,
    MIXED.map(([z]) => z),
  );
  const settled = settledPulseFacts({
    place: "Cape Coral",
    moves,
    requested: 6,
    shown: 6,
    asOf: "04/30/2026",
  });
  const sentences = settled.map((s) => s.sentence);

  test("the tally is an integer filter, not a model's guess", () => {
    // 33909, 33990, 33991, 33993 fell = FOUR. 33904, 33914 rose = TWO. 4 + 2 = 6.
    expect(tally(moves)).toEqual({ total: 6, fell: 4, rose: 2, flat: 0, uniform: false });
  });

  test("THE DEFECT, FIXED: the settled count says FOUR — the number the model wrote was five", () => {
    expect(sentences).toContain("4 of 6 ZIPs tracked here moved lower this month.");
    expect(sentences).toContain("2 of 6 ZIPs tracked here moved higher this month.");
    // The falsehood that shipped. It must exist NOWHERE in what the narrator is handed.
    expect(sentences.join(" ")).not.toContain("5 of 6");
    expect(pulseUserMessage("Cape Coral", settled).toLowerCase()).not.toContain("five");
  });

  test("a zero-count direction is omitted, not stated as a fact ('0 of 6 rose' is noise)", () => {
    const allFell = settledPulseFacts({
      place: "Cape Coral",
      moves: movesForZips(
        TABLE,
        CAPE.map(([z]) => z),
      ),
      requested: 6,
      shown: 6,
      asOf: "04/30/2026",
    }).map((s) => s.sentence);
    expect(allFell).toContain("All 6 ZIPs tracked here moved lower this month.");
    expect(allFell.some((s) => s.includes("0 of 6"))).toBe(false);
  });

  test("the ranking is CODE's — the mover is a selection, the spread a min/max", () => {
    // |−0.39| is the largest of {0.05, 0.31, 0.12, 0.22, 0.19, 0.39} → 33993.
    expect(sentences).toContain("The largest monthly move was ZIP 33993, at −0.39%.");
    // The spread runs from the true min (−0.39) to the true max (+0.12), signs intact.
    expect(sentences).toContain("The monthly moves span −0.39% to +0.12%.");
    // The HIGHEST-VALUE ZIP is a STAT CELL, not a sentence. A read that recites the
    // stat row is the recipe's own definition of a failed read.
    expect(sentences.join(" ")).not.toContain("highest home value");
  });

  test("the as-of is stated once, MM/DD/YYYY, and its digits anchor the prose", () => {
    expect(sentences).toContain("These figures are as of 04/30/2026.");
  });

  // ── THE DONE-CONDITION: THE NARRATOR RECEIVES NO RAW SET ────────────────────
  test("THE NARRATOR RECEIVES NO RAW SET — no unsettled ZIP, value, or move reaches it", () => {
    const msg = pulseUserMessage("Cape Coral", settled);
    const settledNumerals = new Set(settled.flatMap((s) => s.anchors));
    // Every numeral in the entire prompt is one CODE settled. Nothing else got in.
    for (const n of msg.match(/\d[\d,.]*/g) ?? []) {
      expect(settledNumerals.has(n.replace(/[.,]$/, ""))).toBe(true);
    }
    // Concretely: the mid-pack rows are INVISIBLE to the model. It cannot compare,
    // rank or count them, because it was never given them.
    for (const hidden of ["298038", "298,038", "325,571", "361,732", "342,030", "33990", "33991"]) {
      expect(msg).not.toContain(hidden);
    }
  });

  test("the model's own sentence may carry NO quantity — not even a true one", () => {
    // auditConnective runs the gate with an EMPTY settled set: nothing is exempt and no
    // digit is anchored. Every number in this read is CODE's, including the true ones.
    expect(auditConnective("The moves were narrow across the board.")).toEqual([]);
    expect(
      auditConnective("4 of 6 ZIPs tracked here moved lower this month.").some(
        (x) => x.kind === "unanchored-number",
      ),
    ).toBe(true);
    expect(auditConnective("The market is cooling.").some((x) => x.kind === "trajectory")).toBe(
      true,
    );
    expect(auditConnective("Most ZIPs slipped.").some((x) => x.kind === "word-count")).toBe(true);
  });

  test("the spine ships even when the model's sentence is thrown away", () => {
    const spineOnly = composePulseRead(settled, null);
    expect(spineOnly).toContain("4 of 6 ZIPs tracked here moved lower this month.");
    // And a code-authored spine ALWAYS passes the assembled gate — it is verbatim by
    // construction, so nothing in it can be flagged as a model-derived relation.
    expect(auditRead(spineOnly, settled)).toEqual([]);
  });

  test("a clean closing sentence composes onto the spine and the whole thing passes", () => {
    const read = composePulseRead(settled, "It was a split month, and one month is a level.");
    expect(auditRead(read, settled)).toEqual([]);
    expect(read.endsWith("It was a split month, and one month is a level.")).toBe(true);
  });

  test("the prohibition the lint enforces is printed into the system prompt", () => {
    const sys = pulseSystemPrompt(6);
    expect(sys).toContain(CLAIM_PROHIBITION);
    expect(sys).toContain("YOU HAVE NOT BEEN GIVEN THE ZIP ROWS");
  });

  // ── THE FAIL-CLOSED BACKSTOP ────────────────────────────────────────────────
  test("THE LIVE FALSEHOOD is caught: 'Five of those six ZIPs' (the answer was four)", () => {
    const v = auditRead("Five of those six ZIPs moved lower this month.", settled);
    expect(v.some((x) => x.kind === "word-count")).toBe(true);
  });

  test("a count spelled out around the settled noun is still caught", () => {
    // The hole a padded noun would open: "four of the six ZIPs tracked here". The
    // quantifier sits directly before "ZIPs", so WORD_COUNT still sees it.
    expect(
      auditRead("Four of the six ZIPs tracked here moved lower.", settled).some(
        (x) => x.kind === "word-count",
      ),
    ).toBe(true);
    expect(
      auditRead("Most ZIPs slipped this month.", settled).some((x) => x.kind === "word-count"),
    ).toBe(true);
  });

  test("a number no settled fact anchors is caught (a rounded figure is still invented)", () => {
    const v = auditRead("Values slipped about 0.3% across the city.", settled);
    expect(v.some((x) => x.kind === "unanchored-number" && x.match === "0.3")).toBe(true);
  });

  test("an invented TRAJECTORY is caught — one month is a level, not a direction", () => {
    expect(
      auditRead("The market is cooling across the city.", settled).some(
        (x) => x.kind === "trajectory",
      ),
    ).toBe(true);
  });

  test("a settled sentence restated VERBATIM passes — that is the narrator's whole job", () => {
    expect(auditRead(sentences.join(" "), settled)).toEqual([]);
  });

  test("a settled sentence retyped with an ASCII hyphen still passes (a glyph is not a claim)", () => {
    // Our sentences carry a U+2212 minus. A model that retypes it as an ASCII hyphen has
    // restated the SAME fact — dropping an honest paragraph over a dash would be the gate
    // eating true prose.
    const retyped = "The largest monthly move was ZIP 33993, at -0.39%.";
    expect(auditRead(retyped, settled)).toEqual([]);
  });
});

describe("coverage — the copy never claims 'every ZIP' while we hold fewer", () => {
  test("a coverage gap is stated as a count: Fort Myers spans 9, the index publishes 8", () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({
      zip: `3390${i}`,
      city: "Fort Myers",
      value: 200000 + i * 1000,
      mom: -0.1 - i / 100,
      period: "2026-04-30",
    }));
    const s = settledPulseFacts({
      place: "Fort Myers",
      moves: eight,
      requested: 9,
      shown: 8,
      asOf: "04/30/2026",
    }).map((x) => x.sentence);
    expect(s).toContain("8 of 9 ZIPs in Fort Myers carry a published home value this month.");
    expect(s.join(" ")).not.toContain("every ZIP");
  });

  test("TRUNCATION is stated too — the frame draws 8 bars, so a 12-ZIP place says so", () => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({
      zip: `341${String(i).padStart(2, "0")}`,
      city: "Naples",
      value: 500000 + i * 1000,
      mom: -0.1,
      period: "2026-04-30",
    }));
    const s = settledPulseFacts({
      place: "Naples",
      moves: twelve,
      requested: 12,
      shown: 8,
      asOf: "04/30/2026",
    }).map((x) => x.sentence);
    expect(s).toContain("The chart shows 8 of the 12 ZIPs tracked here, ranked by home value.");
  });

  test("a single-ZIP subject gets a singular sentence, never 'All 1 ZIPs'", () => {
    const one = movesForZips(TABLE, ["33993"]);
    const s = settledPulseFacts({
      place: "33993",
      moves: one,
      requested: 1,
      shown: 1,
      asOf: "04/30/2026",
    });
    expect(s.map((x) => x.sentence)).toContain("ZIP 33993 moved lower this month, at −0.39%.");
    expect(s.map((x) => x.sentence).join(" ")).not.toContain("All 1");
    // And it still composes into a shippable read that passes the gate.
    expect(auditRead(composePulseRead(s, null), s)).toEqual([]);
  });

  test("FULL coverage states no coverage sentence — the direction count carries the denominator", () => {
    const s = settledPulseFacts({
      place: "Cape Coral",
      moves: movesForZips(
        TABLE,
        CAPE.map(([z]) => z),
      ),
      requested: 6,
      shown: 6,
      asOf: "04/30/2026",
    }).map((x) => x.sentence);
    expect(s.join(" ")).not.toContain("carry a published home value");
    expect(s).toContain("All 6 ZIPs tracked here moved lower this month.");
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
