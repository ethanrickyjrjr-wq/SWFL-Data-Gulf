import { describe, it, expect } from "vitest";
import { buildChartForIntent } from "./build-chart-for-intent.mts";

describe("buildChartForIntent", () => {
  it("returns a linted bar block for asking-rent", async () => {
    const r = await buildChartForIntent({ chart_type: "bar", scope: "asking-rent" });
    expect(r && "block" in r ? r.block.chart_type : null).toBe("bar");
  });

  it("asking-rent block passes lint (has title, columns, rows)", async () => {
    const r = await buildChartForIntent({ chart_type: "bar", scope: "asking-rent" });
    expect(r).not.toBeNull();
    if (!r || !("block" in r)) throw new Error("expected block");
    expect(typeof r.block.title).toBe("string");
    expect(r.block.columns.length).toBeGreaterThanOrEqual(2);
    expect(r.block.rows.length).toBeGreaterThanOrEqual(3);
  });

  it("returns a bar block for vacancy", async () => {
    const r = await buildChartForIntent({ chart_type: "bar", scope: "vacancy" });
    expect(r && "block" in r ? r.block.chart_type : null).toBe("bar");
  });

  it("returns a zhvi component marker with data array", async () => {
    const r = await buildChartForIntent({ chart_type: "area", scope: "zhvi" });
    expect(r && "component" in r ? r.component : null).toBe("zhvi");
    if (!r || !("component" in r) || r.component !== "zhvi") throw new Error("expected zhvi");
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length).toBeGreaterThanOrEqual(3);
  });

  it("zhvi data entries have month/cape_coral/fort_myers/naples", async () => {
    const r = await buildChartForIntent({ chart_type: "area", scope: "zhvi" });
    if (!r || !("component" in r) || r.component !== "zhvi") throw new Error("expected zhvi");
    const entry = r.data[0];
    expect(typeof entry.month).toBe("string");
    expect(typeof entry.cape_coral).toBe("number");
    expect(typeof entry.fort_myers).toBe("number");
    expect(typeof entry.naples).toBe("number");
  });

  it("returns a scatter component marker with JoinedCorridorRow data", async () => {
    const r = await buildChartForIntent({ chart_type: "scatter", scope: "corridor-scatter" });
    expect(r && "component" in r ? r.component : null).toBe("scatter");
    if (!r || !("component" in r) || r.component !== "scatter") throw new Error("expected scatter");
    expect(Array.isArray(r.data)).toBe(true);
    expect(r.data.length).toBeGreaterThanOrEqual(3);
  });

  it("scatter rows have id/name/submarket fields", async () => {
    const r = await buildChartForIntent({ chart_type: "scatter", scope: "corridor-scatter" });
    if (!r || !("component" in r) || r.component !== "scatter") throw new Error("expected scatter");
    const row = r.data[0];
    expect(typeof row.id).toBe("string");
    expect(typeof row.name).toBe("string");
    expect(typeof row.submarket).toBe("string");
  });

  it("returns null for deferred vitals", async () => {
    expect(
      await buildChartForIntent({ chart_type: "bar", scope: "vitals", corridor_slug: "x" }),
    ).toBeNull();
  });

  it("returns null for flood-aal (no env detail_tables)", async () => {
    expect(await buildChartForIntent({ chart_type: "bar", scope: "flood-aal" })).toBeNull();
  });
});
