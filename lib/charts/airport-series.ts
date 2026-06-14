import type { ChartRow } from "@/types/viz";

/** Raw row from public.rsw_airport_monthly (only the columns the chart selects). */
export interface AirportMonthRow {
  report_month: string; // PostgREST serializes a DATE as an ISO string, e.g. "2026-04-01"
  value: number | null;
}

export interface PassengerSeries {
  /** Chart-ready rows, oldest → newest. */
  entries: ChartRow[];
  /** Latest covered month ("YYYY-MM"), or undefined when nothing is renderable. */
  asOf?: string;
  /** Rows the query returned, before the null filter — for the provenance line. */
  rowCount: number;
}

/**
 * Trailing moving average over an array of values. Returns null for positions
 * that don't yet have a full window, and null when any value in the window is
 * null (a gap breaks the average). Computed over the FULL series before any
 * range-slice so short time-range views (6M/1Y/2Y) still carry the correct
 * trend value on each row.
 */
export function movingAverage(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < window - 1) return null;
    const slice = values.slice(i - window + 1, i + 1);
    if (slice.some((v) => v == null)) return null;
    return (slice as number[]).reduce((acc, v) => acc + v, 0) / window;
  });
}

/**
 * Maps total_passengers rows to { month, passengers, trend } where `trend` is
 * the 12-month trailing mean (null until month 12). The trend lives on each row
 * so MetroAreaChart's range-slice (6M/1Y/2Y/ALL) preserves it without a
 * re-compute. Rows with a missing `trend` key plot a gap in recharts, which is
 * the correct behavior for the startup window.
 */
export function mapAirportTotalWithTrend(
  rows: AirportMonthRow[] | null | undefined,
): PassengerSeries {
  if (!rows || rows.length === 0) {
    return { entries: [], asOf: undefined, rowCount: 0 };
  }

  const valid = rows
    .filter((r): r is AirportMonthRow & { value: number } => r.value != null && !!r.report_month)
    .sort((a, b) => a.report_month.localeCompare(b.report_month));

  const trends = movingAverage(
    valid.map((r) => r.value),
    12,
  );

  const entries: ChartRow[] = valid.map((r, i) => {
    const row: ChartRow = { month: r.report_month.slice(0, 7), passengers: r.value };
    if (trends[i] !== null) row.trend = Math.round(trends[i]!);
    return row;
  });

  const asOf = entries.length > 0 ? String(entries[entries.length - 1].month) : undefined;
  return { entries, asOf, rowCount: rows.length };
}

/** Series key the legacy single-series airport panel uses; kept for the existing test. */
const PASSENGER_KEY = "passengers";

/**
 * Pure mapper: raw airport rows → single-series chart rows. Normalizes the DATE
 * to a "YYYY-MM" month string (matching the pivoted-view shape so one component
 * renders both), drops rows with a null value, sorts ascending, and anchors
 * `asOf` to the newest month. Tolerates null/empty so a failed read degrades to
 * an empty chart instead of throwing.
 */
export function mapAirportRows(rows: AirportMonthRow[] | null | undefined): PassengerSeries {
  if (!rows || rows.length === 0) {
    return { entries: [], asOf: undefined, rowCount: 0 };
  }

  const entries: ChartRow[] = rows
    .filter((r): r is AirportMonthRow & { value: number } => r.value != null && !!r.report_month)
    .map((r) => ({ month: r.report_month.slice(0, 7), [PASSENGER_KEY]: r.value }))
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const asOf = entries.length > 0 ? String(entries[entries.length - 1].month) : undefined;

  return { entries, asOf, rowCount: rows.length };
}
