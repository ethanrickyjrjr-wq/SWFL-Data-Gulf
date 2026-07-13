// lib/concoctions/grain.test.ts — the 07/13/2026 corridor incident, as law.
//
// The bug: asking rent and vacancy are Cushman & Wakefield SUBMARKET figures
// stamped onto every corridor inside the submarket. Three Naples corridors all
// carry $60.84 / 1.8%. The lab crowned "Waterside Shops — $60.84" as the top
// corridor and charted three identical bars. Every distribution guard passed:
// spread, distinctness and null share were all fine. Spread is not grain.
import { describe, expect, it } from "bun:test";
import { collapseToGrain, evaluateGuards, topValueIsTied } from "./guards";
import { mapSliceToBlock } from "./materialize";
import type { ColumnSpec, ConcoctionDef, ConcoctionRow } from "./types";

// The real shape of the data, verbatim from the lake (07/13/2026).
const ROWS: ConcoctionRow[] = [
  { corridor_name: "Waterside Shops", submarket: "Naples", rent: 60.84, vac: 1.8 },
  { corridor_name: "Tamiami Naples", submarket: "Naples", rent: 60.84, vac: 1.8 },
  { corridor_name: "5th Ave South", submarket: "Naples", rent: 60.84, vac: 1.8 },
  { corridor_name: "Lee Blvd Lehigh Acres", submarket: "Lehigh Acres", rent: 35.08, vac: 0.2 },
  { corridor_name: "Joel Blvd Lehigh Acres", submarket: "Lehigh Acres", rent: 35.08, vac: 0.2 },
  { corridor_name: "Coconut Point Mall", submarket: "Estero", rent: 34.24, vac: 7.7 },
  { corridor_name: "Cleveland Ave", submarket: "City of Fort Myers", rent: 16.04, vac: 2.9 },
  // Matches no published submarket row and carries no source URL — uncitable.
  { corridor_name: "Pine Ridge Rd Naples", submarket: null, rent: 39.2, vac: 3.2 },
];

const RENT: ColumnSpec = {
  key: "rent",
  label: "Asking rent (per sqft)",
  kind: "measure",
  format: "usd",
  grain: "submarket",
  guards: { minDistinct: 4, minSpreadRatio: 0.2, maxNullShare: 0.3 },
};

const DEF = {
  id: "test-corridors",
  label: "Commercial rents & vacancy",
  sourceLine: "Cushman & Wakefield MarketBeat — Southwest Florida Retail, Q4 2025",
  columns: [
    { key: "submarket", label: "Submarket", kind: "dimension", format: "text" },
    { key: "corridor_name", label: "Corridor", kind: "dimension", format: "text" },
    RENT,
    { key: "vac", label: "Vacancy", kind: "measure", format: "percent", grain: "submarket" },
  ],
  asOf: () => "12/31/2025",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as unknown as ConcoctionDef<any>;

const ids = () => {
  let n = 0;
  return () => `b${n++}`;
};

describe("the guard that did NOT catch it", () => {
  it("distribution guards pass on the raw corridor rows — this is why grain is a separate law", () => {
    expect(evaluateGuards(ROWS, RENT).ok).toBe(true);
  });
});

describe("collapseToGrain", () => {
  it("collapses the three Naples corridors sharing one submarket figure into one row", () => {
    const out = collapseToGrain(ROWS, "submarket");
    expect(out.map((r) => r.submarket)).toEqual([
      "Naples",
      "Lehigh Acres",
      "Estero",
      "City of Fort Myers",
    ]);
    expect(out[0]._members).toBe(3); // Waterside + Tamiami + 5th Ave
    expect(out[1]._members).toBe(2); // Lee Blvd + Joel Blvd
  });

  it("drops the uncited corridor — a figure with no named source is not renderable", () => {
    const out = collapseToGrain(ROWS, "submarket");
    expect(out.some((r) => r.rent === 39.2)).toBe(false);
  });
});

describe("topValueIsTied", () => {
  it("is true on the raw corridors (three hold $60.84) and false once collapsed", () => {
    expect(topValueIsTied(ROWS, "rent")).toBe(true);
    expect(topValueIsTied(collapseToGrain(ROWS, "submarket"), "rent")).toBe(false);
  });
});

describe("the shapes, through the grain seam", () => {
  it("the hero names the SUBMARKET, never the corridor that merely shares its figure", () => {
    const block = mapSliceToBlock(
      DEF,
      ROWS,
      {
        type: "hero",
        slice: { measures: ["rent"], dimension: "corridor_name" },
        layout: { x: 0, y: 0, w: 12, h: 3 },
      },
      ids(),
    );
    const props = block!.props as { value: string; label: string };
    expect(props.value).toBe("$60.84");
    // THE REGRESSION: this said "Asking rent (per sqft) · Waterside Shops".
    expect(props.label).toContain("Naples");
    expect(props.label).not.toContain("Waterside");
  });

  it("the ranked list is one row per submarket — no duplicate bars, no invented order", () => {
    const block = mapSliceToBlock(
      DEF,
      ROWS,
      {
        type: "list",
        slice: { measures: ["rent", "vac"], dimension: "corridor_name", topN: 6 },
        layout: { x: 0, y: 0, w: 12, h: 5 },
      },
      ids(),
    );
    const items = (block!.props as { items: { text: string }[] }).items;
    expect(items).toHaveLength(4); // 4 submarkets, not 7 corridors
    expect(items[0].text).toContain("Naples");
    expect(items.filter((i) => i.text.includes("$60.84"))).toHaveLength(1);
  });

  it("a corridor's OWN measure still ranks corridor-by-corridor (no grain override)", () => {
    const seasonalDef = {
      ...DEF,
      columns: [
        ...DEF.columns,
        { key: "seasonal", label: "Seasonality", kind: "measure", format: "number" },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as unknown as ConcoctionDef<any>;
    const rows = ROWS.map((r, i) => ({ ...r, seasonal: (i + 1) / 10 }));
    const block = mapSliceToBlock(
      seasonalDef,
      rows,
      {
        type: "hero",
        slice: { measures: ["seasonal"], dimension: "corridor_name" },
        layout: { x: 0, y: 0, w: 12, h: 3 },
      },
      ids(),
    );
    // Seasonality is genuinely per-corridor, so crowning a corridor is honest.
    expect((block!.props as { label: string }).label).toContain("Pine Ridge");
  });
});
