import { describe, expect, it } from "vitest";
import { mapZipHeatmap, yoyBucket, YOY_BUCKET_COLORS } from "./zip-heatmap-series";

function synth(zips: string[], months: string[], value: (z: string, m: string) => number) {
  return zips.flatMap((z) =>
    months.map((m) => ({ zip_code: z, period_end: m, yoy_pct: value(z, m) })),
  );
}

const MONTHS = [
  "2025-06-30",
  "2025-07-31",
  "2025-08-31",
  "2025-09-30",
  "2025-10-31",
  "2025-11-30",
  "2025-12-31",
  "2026-01-31",
  "2026-02-28",
  "2026-03-31",
  "2026-04-30",
  "2026-05-31",
];

describe("yoyBucket (fixed diverging thresholds — months stay comparable)", () => {
  it("buckets by value, not quantile", () => {
    expect(yoyBucket(-12)).toBe(0); // ≤ −10
    expect(yoyBucket(-10)).toBe(0);
    expect(yoyBucket(-8)).toBe(1); // (−10, −5]
    expect(yoyBucket(-5)).toBe(1);
    expect(yoyBucket(-2)).toBe(2); // (−5, 0)
    expect(yoyBucket(0)).toBe(3); // [0, 5)
    expect(yoyBucket(4.9)).toBe(3);
    expect(yoyBucket(7)).toBe(4); // ≥ 5
  });

  it("five colors, one per bucket", () => {
    expect(YOY_BUCKET_COLORS).toHaveLength(5);
  });
});

describe("mapZipHeatmap", () => {
  it("selects both extremes of the latest month, columns sorted by latest YoY desc", () => {
    const zips = ["11111", "22222", "33333", "44444", "55555", "66666"];
    // extremes: 11111 most resilient (+6), 33333 deepest faller (−9); 44444/55555/66666 mild
    const rows = synth(zips, MONTHS, (z) =>
      z === "33333" ? -9 : z === "11111" ? 6 : z === "22222" ? 3 : 1,
    );
    const grid5 = mapZipHeatmap(rows, { zips: 5, months: 12 });
    expect(grid5!.zipLabels).toHaveLength(5);
    expect(grid5!.zipLabels[0]).toBe("11111"); // most resilient leftmost
    expect(grid5!.zipLabels[grid5!.zipLabels.length - 1]).toBe("33333"); // deepest faller last
    expect(grid5!.zipLabels).toContain("22222"); // top-3 resilient side included
    // ZIP-major: one column per ZIP, one bin per month (oldest → newest)
    expect(grid5!.columns).toHaveLength(5);
    expect(grid5!.columns[0].bins).toHaveLength(12);
    expect(grid5!.asOf).toBe("2026-05-31");
    expect(grid5!.monthLabels).toHaveLength(12);
    // bins carry the BUCKET level (vendored cells quantize counts 0-4);
    // the REAL YoY rides in values[column][row]
    expect(grid5!.columns[0].bins[11].count).toBe(4); // +6 → bucket 4 (≥ 5)
    expect(grid5!.values[0][11]).toBe(6);
  });

  it("carries bucket counts, real values, and a UTC date per month", () => {
    const rows = synth(["11111", "22222", "33333", "44444", "55555"], MONTHS, () => 2.5);
    const grid = mapZipHeatmap(rows, { zips: 5, months: 12 });
    expect(grid!.columns[0].bins[0].count).toBe(3); // 2.5 → bucket 3 ([0, 5))
    expect(grid!.values[0][0]).toBe(2.5);
    expect(grid!.columns[0].bins[0].date.toISOString().slice(0, 10)).toBe("2025-06-30");
  });

  it("excludes ZIPs missing any window month — no gap cells", () => {
    const zips = ["11111", "22222", "33333", "44444", "55555", "66666"];
    const rows = synth(zips, MONTHS, () => 1).filter(
      (r) => !(r.zip_code === "66666" && r.period_end === MONTHS[0]),
    );
    const grid = mapZipHeatmap(rows, { zips: 6, months: 12 });
    expect(grid!.zipLabels).not.toContain("66666");
    expect(grid!.zipLabels).toHaveLength(5);
  });

  it("hides the panel on thin data (fewer than 6 months or 5 ZIPs)", () => {
    expect(mapZipHeatmap(synth(["1", "2", "3", "4", "5"], MONTHS.slice(0, 3), () => 1))).toBeNull();
    expect(mapZipHeatmap(synth(["1", "2", "3"], MONTHS, () => 1))).toBeNull();
    expect(mapZipHeatmap([])).toBeNull();
    expect(mapZipHeatmap(null)).toBeNull();
  });
});
