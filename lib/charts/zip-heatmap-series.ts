import type { HeatmapColumn } from "@/components/charts/vendor/bklit/heatmap/heatmap-context";

export interface ZipYoYRow {
  zip_code: string;
  period_end: string; // "YYYY-MM-DD" month end
  yoy_pct: number;
}

// NOTE: this shape crosses the RSC boundary (server loader → client wrapper) —
// serializable fields ONLY, never a function (a function prop aborts `next
// build` at prerender; see 07-charts-and-dataviz.md §6).
export interface ZipHeatmapData {
  /**
   * One column per ZIP, one bin per month (oldest top → newest bottom).
   * `bin.count` carries the BUCKET LEVEL (0–4), not the raw YoY — the vendored
   * cells quantize counts through GitHub-style `getHeatmapContributionLevel`
   * (0→0, 1→1, 2→2, 3→3, else 4), which is exactly the identity on bucket
   * indices; the real YoY % rides in `values` for the tooltip. ZIP-major so
   * 20 ZIPs run ACROSS the panel and 12 months down — a month-major grid of
   * square cells would be ~1,240px tall at full width.
   */
  columns: HeatmapColumn[];
  /** Real YoY % per [columnIndex][rowIndex] — the tooltip's number. */
  values: number[][];
  /** Column order, left → right (sorted by latest-month YoY desc). */
  zipLabels: string[];
  /** "Jun 25"-style labels, row order top → bottom (oldest first). */
  monthLabels: string[];
  /** Newest period_end in the grid ("YYYY-MM-DD"). */
  asOf: string;
}

/**
 * Fixed diverging buckets (NOT quantiles — two months must be comparable),
 * calibrated to residential YoY reality (checked against the live view
 * 07/10/2026: the current per-ZIP spread runs −17.5%..−0.2%, so ±5/±10 edges
 * with zero as the pivot discriminate; a coarser ±5-only cut painted every
 * cell one bucket): 0: ≤ −10 · 1: (−10, −5] · 2: (−5, 0) · 3: [0, 5) ·
 * 4: ≥ 5 (YoY %).
 */
export function yoyBucket(yoyPct: number): 0 | 1 | 2 | 3 | 4 {
  if (yoyPct <= -10) return 0;
  if (yoyPct <= -5) return 1;
  if (yoyPct < 0) return 2;
  if (yoyPct < 5) return 3;
  return 4;
}

/**
 * Diverging ramp from existing gulf tokens only: sunset-coral (falling, three
 * alpha steps — lightness monotonic by construction) flipping hue at zero to
 * gulf-teal (rising). Identity is never color-alone — the legend prints the
 * thresholds and the tooltip prints the exact value.
 */
export const YOY_BUCKET_COLORS = [
  "#E08158",
  "rgba(224,129,88,0.55)",
  "rgba(224,129,88,0.25)",
  "rgba(61,201,192,0.45)",
  "#3DC9C0",
] as const;

const MONTH_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/**
 * ZIP×month grid from zhvi_zip_yoy_monthly rows: trailing `months` rows × the
 * `zips` window-complete ZIPs at BOTH extremes of the latest month — half the
 * most-resilient (highest YoY), half the deepest-falling — displayed sorted by
 * latest YoY desc. In a uniformly-moving market the |biggest-movers| cut
 * collapses to one tail (checked live 07/10/2026: all 20 were ≤ −5%); the
 * SPREAD is the story. ZIPs missing any window month are excluded up front —
 * every cell is a real figure, no gap cells. Null (hide the panel) under 6
 * months or 5 ZIPs — a sliver grid would imply coverage it doesn't have.
 */
export function mapZipHeatmap(
  rows: ZipYoYRow[] | null | undefined,
  opts: { zips?: number; months?: number } = {},
): ZipHeatmapData | null {
  const wantZips = opts.zips ?? 20;
  const wantMonths = opts.months ?? 12;
  if (!rows || rows.length === 0) return null;

  const months = [...new Set(rows.map((r) => r.period_end))].sort().slice(-wantMonths);
  if (months.length < 6) return null;
  const latest = months[months.length - 1];

  const byKey = new Map(rows.map((r) => [`${r.zip_code}|${r.period_end}`, r.yoy_pct]));

  // Both extremes of the latest month — among ZIPs with a value for EVERY
  // window month — displayed sorted by latest YoY desc (resilient left,
  // deepest fallers right).
  const latestByZip = new Map(
    rows.filter((r) => r.period_end === latest).map((r) => [r.zip_code, r.yoy_pct]),
  );
  const complete = [...latestByZip.entries()]
    .filter(([zip]) => months.every((m) => byKey.has(`${zip}|${m}`)))
    .sort((a, b) => b[1] - a[1]);
  const nTop = Math.ceil(wantZips / 2);
  const nBottom = Math.floor(wantZips / 2);
  const picked = new Map([...complete.slice(0, nTop), ...complete.slice(-nBottom)]);
  const zips = [...picked.entries()].sort((a, b) => b[1] - a[1]).map(([zip]) => zip);
  if (zips.length < 5) return null;

  const values = zips.map((z) => months.map((m) => byKey.get(`${z}|${m}`) as number));
  const columns: HeatmapColumn[] = zips.map((z, ci) => ({
    bin: ci,
    bins: months.map((m, ri) => ({
      bin: ri,
      count: yoyBucket(values[ci][ri]),
      date: new Date(`${m}T00:00:00Z`),
    })),
  }));

  return {
    columns,
    values,
    zipLabels: zips,
    monthLabels: months.map((m) => MONTH_FMT.format(new Date(`${m}T00:00:00Z`))),
    asOf: latest,
  };
}
