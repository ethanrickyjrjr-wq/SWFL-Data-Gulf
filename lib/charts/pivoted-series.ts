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
