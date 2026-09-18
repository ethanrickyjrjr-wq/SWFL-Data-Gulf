/** One-year seasonal baseline for a monthly numeric series. */
export interface MonthlyValue {
  period: string;
  value: number | null;
}

/**
 * Predict a month with the same calendar month's prior-year value.  A missing
 * reference stays ineligible; it is never replaced with a nearer observation.
 */
export function seasonalNaiveForecast(
  targetPeriod: string,
  observations: MonthlyValue[],
): number | null {
  const [year, month] = targetPeriod.split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`targetPeriod must be YYYY-MM, received ${targetPeriod}`);
  }
  const reference = `${String(year - 1).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  return observations.find((row) => row.period === reference)?.value ?? null;
}
