/** ISO calendar date (YYYY-MM-DD), UTC. */
export function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Subtract `months` calendar months from `date` in UTC, snapping to
 * last-day-of-target-month when the original day-of-month doesn't exist
 * in the target month.
 *
 * JS's native `setUTCMonth(n)` overflows: `new Date('2026-08-31').setUTCMonth(1)`
 * yields 2026-03-03 (Feb 31 → Mar 3) rather than 2026-02-28. For windowing
 * math anchored on month-end dates this silently drifts boundaries by 1-3
 * days. This helper snaps instead.
 */
export function subtractMonthsUtc(date: Date, months: number): Date {
  const d = new Date(date);
  const originalDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(originalDay, lastDay));
  return d;
}

/**
 * Subtract `years` from `date` in UTC, snapping to last-day-of-target-month
 * when the source date is Feb 29 of a leap year and the target year isn't.
 * Without snapping, `setUTCFullYear(2023)` on a Feb 29 2024 date silently
 * rolls forward to Mar 1 2023, causing prior-year lookups against
 * non-leap data to miss.
 */
export function subtractYearsUtc(date: Date, years: number): Date {
  const d = new Date(date);
  const originalDay = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(originalDay, lastDay));
  return d;
}

/** ISO timestamp with second precision (no milliseconds), UTC. */
export function isoTimestamp(d: Date = new Date()): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * verified date + ttl seconds -> precomputed `expires` date.
 *
 * Spec v1.1 stores `expires` as a concrete date, not a `ttl` duration:
 * Phase 0 testing showed Claude reliably compares two dates but
 * unreliably computes `verified + 90d`. The Refinery does the math once.
 */
export function expiresDate(verified: string, ttlSeconds: number): string {
  const base = new Date(`${verified}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`expiresDate: invalid verified date "${verified}"`);
  }
  base.setUTCSeconds(base.getUTCSeconds() + ttlSeconds);
  return base.toISOString().slice(0, 10);
}
