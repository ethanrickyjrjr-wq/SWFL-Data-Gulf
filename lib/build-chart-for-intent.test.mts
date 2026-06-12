import { describe, it, expect } from "vitest";
import { buildChartForIntent } from "./build-chart-for-intent.mts";
import type { ZHVITrendEntry, JoinedCorridorRow } from "@/types/viz";

// buildChartForIntent now returns a ready ChartSpec (one normalization path).
// Frames that wrap a raw-array component carry the untouched typed array under
// `options.data` — these tests lock that the migration neither changed the data
// nor dropped fields (the regression target: scatter `permits.n_current`).

describe("buildChartForIntent → ChartSpec", () => {
  it("asking-rent → bar-table spec (bar, fixture keystone, >=3 rows)", async () => {
    const r = await buildChartForIntent({ chart_type: "bar", scope: "asking-rent" });
    expect(r).not.toBeNull();
    expect(r?.frameId).toBe("bar-table");
    expect(r?.chart_type).toBe("bar");
    expect(r?.asOf).toBe("2026-06-30");
    expect(typeof r?.title).toBe("string");
    expect(r?.columns.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(r?.rows.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("vacancy → bar-table spec", async () => {
    const r = await buildChartForIntent({ chart_type: "bar", scope: "vacancy" });
    expect(r?.frameId).toBe("bar-table");
    expect(r?.chart_type).toBe("bar");
  });

  it("zhvi → zhvi-area spec; raw series in options.data, all three columns", async () => {
    const r = await buildChartForIntent({ chart_type: "area", scope: "zhvi" });
    expect(r?.frameId).toBe("zhvi-area");
    const data = r?.options?.data as ZHVITrendEntry[] | undefined;
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length ?? 0).toBeGreaterThanOrEqual(3);
    const e = data![0];
    expect(typeof e.month).toBe("string");
    expect(typeof e.cape_coral).toBe("number");
    expect(typeof e.fort_myers).toBe("number");
    expect(typeof e.naples).toBe("number");
  });

  it("zhvi asOf is honest ISO derived from its own last month (not the corridor keystone)", async () => {
    const r = await buildChartForIntent({ chart_type: "area", scope: "zhvi" });
    expect(r?.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The zhvi fixture runs through Apr 2026 — it must NOT inherit the corridor
    // sample's Jun 2026 keystone (that would claim a vintage newer than the data).
    expect(r?.asOf).not.toBe("2026-06-30");
  });

  it("corridor-scatter → corridor-scatter spec; full rows untouched in options.data", async () => {
    const r = await buildChartForIntent({ chart_type: "scatter", scope: "corridor-scatter" });
    expect(r?.frameId).toBe("corridor-scatter");
    const data = r?.options?.data as JoinedCorridorRow[] | undefined;
    expect(Array.isArray(data)).toBe(true);
    expect(data?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("REGRESSION: scatter preserves permits.n_current (the field flat-columns dropped)", async () => {
    const r = await buildChartForIntent({ chart_type: "scatter", scope: "corridor-scatter" });
    const data = (r?.options?.data as JoinedCorridorRow[]) ?? [];
    const covered = data.find((row) => row.permits != null);
    expect(covered).toBeDefined();
    expect(typeof covered!.permits!.n_current).toBe("number");
    expect(typeof covered!.permits!.headline_z).toBe("number");
  });

  it("REGRESSION: scatter keeps no-coverage rows (permits === null) for the internal filter", async () => {
    const r = await buildChartForIntent({ chart_type: "scatter", scope: "corridor-scatter" });
    const data = (r?.options?.data as JoinedCorridorRow[]) ?? [];
    // The producer passes ALL rows; null-permits (Collier) corridors must survive
    // so the component's `permits != null` exclusion still has something to exclude.
    expect(data.some((row) => row.permits === null)).toBe(true);
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
