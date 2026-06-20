// lib/report/zip-choropleth-data.ts
//
// Build ZipChoropleth `data` from a brain's per-ZIP detail table (e.g. housing-swfl's
// `housing_by_zip`). Pure — no I/O. The page already loads the table, so the map needs
// no extra fetch. Values are min-max normalized to 0–1 (what ZipChoropleth's color
// scale expects); the label is the human-readable figure.

import type { ZipValue } from "@/components/charts/ZipChoropleth";

/** A detail-table row: stable ZIP key + a cell bag. */
export interface ZipRow {
  key: string;
  cells: Record<string, unknown>;
}

export interface ChoroplethBuild {
  data: Record<string, ZipValue>;
  /** Count of ZIPs with a finite value (0 → caller should hide the map). */
  count: number;
  min: number;
  max: number;
}

const ZIP_RE = /^\d{5}$/;

/** Default money formatter: "$1,234,567" (rounded). */
function usd(v: number): string {
  return `$${Math.round(v).toLocaleString()}`;
}

/**
 * Normalize a per-ZIP metric into ZipChoropleth `data`. When every value is equal
 * (min === max) each ZIP gets value 0.5 (a flat mid-tone) rather than NaN.
 */
export function buildZipChoropleth(
  rows: ZipRow[],
  metricKey: string,
  opts: { format?: (v: number) => string } = {},
): ChoroplethBuild {
  const fmt = opts.format ?? usd;
  const pairs: Array<{ zip: string; v: number }> = [];
  for (const r of rows) {
    if (!ZIP_RE.test(r.key)) continue;
    const raw = r.cells[metricKey];
    // Number(null) and Number("") are 0 (finite) — reject those explicitly so a
    // missing cell never colors a ZIP as $0.
    if (raw === null || raw === undefined || raw === "") continue;
    const v = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(v)) continue;
    pairs.push({ zip: r.key, v });
  }

  if (pairs.length === 0) return { data: {}, count: 0, min: 0, max: 0 };

  const values = pairs.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  const data: Record<string, ZipValue> = {};
  for (const { zip, v } of pairs) {
    data[zip] = { value: span === 0 ? 0.5 : (v - min) / span, label: fmt(v) };
  }
  return { data, count: pairs.length, min, max };
}
