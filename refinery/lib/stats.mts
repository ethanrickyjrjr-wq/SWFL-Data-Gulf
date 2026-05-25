/** Median of a numeric array. Returns null on empty input. */
export function medianOf(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return xs.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Number.EPSILON guard: without it (0.3 + 0.35) / 2 = 0.32499999999999996
// floors to 0.32 instead of rounding to 0.33.
export const round2 = (n: number): string =>
  (Math.round((n + Number.EPSILON) * 100) / 100).toString();

/** Sorted "label (count)" breakdown of a string-keyed tally, count-descending. */
export function breakdown(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
}

export type MetricDirection = "rising" | "falling" | "stable";

export type DirectionSummary = {
  direction: MetricDirection;
  status: "modal" | "tied" | "no-data";
  counts: Record<MetricDirection, number>;
};

/**
 * Direction summary across a slice of metric direction reads. Returns the modal
 * direction PLUS a status tag the call site MUST surface differently in caveats:
 *   - "modal":   one bucket strictly wins — direction is a real signal.
 *   - "tied":    two or more buckets tie; "stable" is a schema-required tiebreak,
 *                not a consensus — caveats must disclose.
 *   - "no-data": every input was null; "stable" is a placeholder, not a reading.
 */
export function summarizeDirection(
  values: (MetricDirection | null)[],
): DirectionSummary {
  const counts: Record<MetricDirection, number> = {
    rising: 0,
    falling: 0,
    stable: 0,
  };
  for (const v of values) {
    if (v != null) counts[v] += 1;
  }
  const total = counts.rising + counts.falling + counts.stable;
  if (total === 0) return { direction: "stable", status: "no-data", counts };
  if (counts.falling > counts.rising && counts.falling > counts.stable)
    return { direction: "falling", status: "modal", counts };
  if (counts.rising > counts.falling && counts.rising > counts.stable)
    return { direction: "rising", status: "modal", counts };
  if (counts.stable > counts.rising && counts.stable > counts.falling)
    return { direction: "stable", status: "modal", counts };
  return { direction: "stable", status: "tied", counts };
}
