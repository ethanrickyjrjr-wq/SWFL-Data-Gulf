import { describe, expect, it } from "bun:test";
import { wantsCustomChart, buildHeldChartBlock, type Menu, type MenuPoint } from "./compose-chart";

describe("wantsCustomChart", () => {
  it("fires on explicit chart verbs", () => {
    expect(wantsCustomChart("Chart vacancy across the corridors")).toBe(true);
    expect(wantsCustomChart("plot median price for these ZIPs")).toBe(true);
    expect(wantsCustomChart("graph permits by month")).toBe(true);
    expect(wantsCustomChart("visualize the rent trend")).toBe(true);
  });
  it("stays off for ordinary analytical questions (no LLM cost)", () => {
    expect(wantsCustomChart("What's the bottom line on SWFL real estate?")).toBe(false);
    expect(wantsCustomChart("How are home values in Naples?")).toBe(false);
    expect(wantsCustomChart("")).toBe(false);
  });
});

describe("buildHeldChartBlock — the structural moat (select rows, never emit cells)", () => {
  // A menu where each corridor carries TWO metrics, so a wrong-COLUMN mispair is
  // even expressible in principle — and we prove the select-rows design can't make one.
  const points: MenuPoint[] = [
    { id: "p0", entity: "Estero", metric: "Vacancy", value: 0.4, unit: "percent", format: "percent", brain: "cre-swfl" }, // prettier-ignore
    { id: "p1", entity: "Cape Coral", metric: "Vacancy", value: 2.2, unit: "percent", format: "percent", brain: "cre-swfl" }, // prettier-ignore
    { id: "p2", entity: "North Fort Myers", metric: "Vacancy", value: 2.6, unit: "percent", format: "percent", brain: "cre-swfl" }, // prettier-ignore
    { id: "p3", entity: "Estero", metric: "Asking Rent", value: 28.5, unit: "usd", format: "usd", brain: "cre-swfl" }, // prettier-ignore
  ];
  const menu: Menu = {
    points,
    byId: new Map(points.map((p) => [p.id, p])),
    numbers: new Set(points.map((p) => p.value)),
    asOf: "2026-06-20",
    citation: "SWFL Data Gulf — cre-swfl",
  };

  it("builds a clean single-metric series from selected ids", () => {
    const block = buildHeldChartBlock(
      { title: "Vacancy by corridor", category_label: "Corridor", point_ids: ["p0", "p1", "p2"], chart_type: "bar" }, // prettier-ignore
      menu,
    );
    expect(block).not.toBeNull();
    expect(block!.rows).toEqual([
      ["Estero", 0.4],
      ["Cape Coral", 2.2],
      ["North Fort Myers", 2.6],
    ]);
    expect(block!.columns[1]).toBe("Vacancy (percent)");
    expect(block!.value_format).toBe("percent");
  });

  it("binds every value to ITS OWN entity — mispairing is not expressible", () => {
    // The model wants Estero=2.6 (North Fort Myers' number). It cannot: it can only
    // select an id, and id p2 is North Fort Myers. Selecting it yields the RIGHT pair.
    const block = buildHeldChartBlock(
      { title: "x", category_label: "Corridor", point_ids: ["p2"], chart_type: "bar" },
      menu,
    );
    expect(block!.rows).toEqual([["North Fort Myers", 2.6]]); // never ["Estero", 2.6]
  });

  it("keeps the wrong-COLUMN value pinned to its true metric", () => {
    // Estero's rent (28.5) and Estero's vacancy (0.4) are DISTINCT points. Selecting
    // the rent point can only produce the rent value — never vacancy's 0.4 in a rent
    // column. Mixed metrics → neutral axis + metric-qualified labels.
    const block = buildHeldChartBlock(
      { title: "x", category_label: "Corridor", point_ids: ["p0", "p3"], chart_type: "bar" },
      menu,
    );
    expect(block!.rows).toEqual([
      ["Estero — Vacancy", 0.4],
      ["Estero — Asking Rent", 28.5],
    ]);
    expect(block!.value_format).toBe("number"); // never claims one $/% across mixed units
  });

  it("drops unknown ids and dedupes", () => {
    const block = buildHeldChartBlock(
      { title: "x", category_label: "Corridor", point_ids: ["p0", "ghost", "p0", "p1"], chart_type: "bar" }, // prettier-ignore
      menu,
    );
    expect(block!.rows).toEqual([
      ["Estero", 0.4],
      ["Cape Coral", 2.2],
    ]);
  });

  it("returns null when no valid point is selected (caller falls back to canned)", () => {
    expect(
      buildHeldChartBlock(
        { title: "x", category_label: "Corridor", point_ids: ["ghost", "nope"], chart_type: "bar" },
        menu,
      ),
    ).toBeNull();
    expect(
      buildHeldChartBlock(
        { title: "x", category_label: "Corridor", point_ids: [], chart_type: "bar" },
        menu,
      ),
    ).toBeNull();
  });
});
