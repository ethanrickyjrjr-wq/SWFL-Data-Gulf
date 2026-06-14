import type { PivotedCityMonth, MetroTrendEntry } from "@/types/viz";

/**
 * The result of turning raw `data_lake.*_pivoted` rows into a chart-ready series.
 * One shape for every pivoted-view panel on /charts so they all filter and anchor
 * the freshness date identically.
 */
export interface PivotedSeries {
  /** Months where every city has a value, oldest → newest. */
  entries: MetroTrendEntry[];
  /** Latest covered month ("YYYY-MM"), or undefined when nothing is renderable. */
  asOf?: string;
  /** Rows the view returned, before the completeness filter — for the provenance line. */
  rowCount: number;
}

/**
 * Derives 12-month year-over-year % change from raw ZHVI pivoted rows.
 * Drops any month missing a city in either the current or the prior-12 row.
 * Returns the same PivotedSeries shape so one MetroAreaChart renders both level
 * and momentum panels (the valueFormat token on the page distinguishes them).
 */
export function mapPivotedCityYoY(rows: PivotedCityMonth[] | null | undefined): PivotedSeries {
  if (!rows || rows.length === 0) {
    return { entries: [], asOf: undefined, rowCount: 0 };
  }

  const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
  const yoyEntries: MetroTrendEntry[] = [];

  for (let i = 12; i < sorted.length; i++) {
    const cur = sorted[i];
    const prior = sorted[i - 12];
    if (
      cur.cape_coral == null ||
      cur.fort_myers == null ||
      cur.naples == null ||
      prior.cape_coral == null ||
      prior.fort_myers == null ||
      prior.naples == null
    )
      continue;
    yoyEntries.push({
      month: cur.month,
      cape_coral: ((cur.cape_coral - prior.cape_coral) / prior.cape_coral) * 100,
      fort_myers: ((cur.fort_myers - prior.fort_myers) / prior.fort_myers) * 100,
      naples: ((cur.naples - prior.naples) / prior.naples) * 100,
    });
  }

  const asOf = yoyEntries.length > 0 ? yoyEntries[yoyEntries.length - 1].month : undefined;
  return { entries: yoyEntries, asOf, rowCount: rows.length };
}

/**
 * Pure mapper: raw pivoted-view rows → chart-ready series.
 *
 * Drops any month missing a city (an incomplete row would plot a gap), sorts
 * ascending by month, and anchors `asOf` to the newest complete month. `rowCount`
 * stays the count the view returned so a caller can show real provenance and
 * notice if completeness filtering dropped rows. Tolerates a null/empty read so a
 * failed query degrades to an empty chart instead of throwing.
 */
export function mapPivotedCityRows(rows: PivotedCityMonth[] | null | undefined): PivotedSeries {
  if (!rows || rows.length === 0) {
    return { entries: [], asOf: undefined, rowCount: 0 };
  }

  const entries = rows
    .filter(
      (m): m is MetroTrendEntry => m.cape_coral != null && m.fort_myers != null && m.naples != null,
    )
    .sort((a, b) => a.month.localeCompare(b.month));

  const asOf = entries.length > 0 ? entries[entries.length - 1].month : undefined;

  return { entries, asOf, rowCount: rows.length };
}
