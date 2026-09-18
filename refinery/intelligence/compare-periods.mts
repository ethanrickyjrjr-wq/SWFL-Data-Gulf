import {
  observationSeriesIdentity,
  type ObservationFrequency,
  type ObservationStatus,
  type ObservationV1,
} from "./observation-contract.mts";

export type MovementDirection = "increase" | "decrease" | "no_change" | "insufficient";
export type EvidenceClassification = "agreement" | "divergence" | "insufficient_evidence";

export interface SeriesPeriodComparison {
  source_id: string;
  metric_id: string;
  definition_version: string;
  geo_type: string;
  geo_id: string;
  frequency: ObservationFrequency;
  unit: string;
  period_start: string;
  period_end: string;
  current_value: number | null;
  current_status: ObservationStatus;
  current_vintage_id: string | null;
  current_source_sha256: string | null;
  current_published_at: string | null;
  current_first_seen_at: string | null;
  current_retrieved_at: string | null;
  current_available_at: string | null;
  current_availability_basis: ObservationV1["availability_basis"];
  prior_period_start: string | null;
  prior_period_end: string | null;
  prior_value: number | null;
  prior_status: ObservationStatus | null;
  prior_vintage_id: string | null;
  absolute_change: number | null;
  percent_change: number | null;
  direction: MovementDirection;
  classification: "comparable" | "insufficient_evidence";
  gap_reason: string | null;
  quality_flags: string[];
}

export interface PeriodAssessment {
  period_start: string;
  period_end: string;
  frequency: ObservationFrequency;
  classification: EvidenceClassification;
  source_count: number;
  comparable_series_count: number;
  insufficient_series_count: number;
  directions: MovementDirection[];
  gap_reason: string | null;
}

export interface PriorYearComparisonResult {
  selection_policy: string;
  series: SeriesPeriodComparison[];
  periods: PeriodAssessment[];
}

const BPS_TOTAL_COMPONENTS = [
  "residential_one_unit_units",
  "residential_two_unit_units",
  "residential_three_four_unit_units",
  "residential_five_plus_unit_units",
] as const;

function aggregateStatus(rows: ObservationV1[]): ObservationStatus {
  if (rows.some((row) => row.status === "suppressed")) return "suppressed";
  if (rows.some((row) => row.status === "unavailable")) return "unavailable";
  return "missing";
}

function deriveBpsTotalUnits(observations: ObservationV1[]): ObservationV1[] {
  const candidates = observations.filter(
    (row) =>
      row.source_id === "census_bps_county" &&
      BPS_TOTAL_COMPONENTS.includes(row.metric_id as (typeof BPS_TOTAL_COMPONENTS)[number]),
  );
  const groups = new Map<string, ObservationV1[]>();
  for (const row of candidates) {
    const key = [
      row.source_id,
      row.geo_type,
      row.geo_id,
      row.period_start,
      row.period_end,
      row.vintage_id ?? "<missing-vintage>",
    ].join("|");
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const derived: ObservationV1[] = [];
  for (const rows of groups.values()) {
    const byMetric = new Map(rows.map((row) => [row.metric_id, row]));
    if (!BPS_TOTAL_COMPONENTS.every((metric) => byMetric.has(metric))) continue;
    const components = BPS_TOTAL_COMPONENTS.map((metric) => byMetric.get(metric)!);
    const first = components[0];
    if (
      components.some(
        (row) =>
          row.frequency !== first.frequency ||
          row.unit !== first.unit ||
          row.source_sha256 !== first.source_sha256 ||
          row.source_url !== first.source_url,
      )
    ) {
      throw new Error(
        `Cannot derive BPS total for ${first.geo_id}/${first.period_start}: component provenance, unit, or frequency mismatch`,
      );
    }
    const complete = components.every((row) => row.status === "observed" && row.value !== null);
    const valueBases = new Set(components.map((row) => row.value_basis));
    derived.push({
      ...first,
      metric_id: "residential_units_authorized_monthly",
      definition_version: "census_bps_total_units_monthly_v1",
      value: complete ? components.reduce((sum, row) => sum + row.value!, 0) : null,
      status: complete ? "observed" : aggregateStatus(components),
      value_basis: valueBases.size === 1 ? components[0].value_basis : "mixed",
      quality_flags: [
        ...new Set([
          ...components.flatMap((row) => row.quality_flags),
          "derived_sum_of_four_mutually_exclusive_bps_unit_categories",
        ]),
      ].sort(),
    });
  }
  return derived;
}

export function prepareHistoryComparisonObservations(
  observations: ObservationV1[],
): ObservationV1[] {
  const rsw = observations.filter(
    (row) =>
      row.source_id === "rsw_lcpa_monthly" &&
      row.metric_id === "total_passengers" &&
      row.geo_type === "airport" &&
      row.geo_id === "RSW",
  );
  const directBps = observations.filter(
    (row) =>
      row.source_id === "census_bps_county" &&
      row.metric_id === "residential_units_authorized_monthly",
  );
  const bps = directBps.length > 0 ? directBps : deriveBpsTotalUnits(observations);
  return [...rsw, ...bps];
}

function revisionRank(observation: ObservationV1): string {
  const evidenceTime =
    observation.available_at ??
    observation.published_at ??
    observation.first_seen_at ??
    observation.retrieved_at ??
    "";
  return [evidenceTime, observation.vintage_id ?? "", observation.source_sha256 ?? ""].join("|");
}

function periodSeriesIdentity(observation: ObservationV1): string {
  return `${observationSeriesIdentity(observation)}|${observation.period_start}|${observation.period_end}`;
}

export function selectLatestVintages(observations: ObservationV1[]): ObservationV1[] {
  const selected = new Map<string, ObservationV1>();
  for (const observation of observations) {
    const key = periodSeriesIdentity(observation);
    const previous = selected.get(key);
    if (!previous || revisionRank(observation) > revisionRank(previous)) {
      selected.set(key, observation);
    }
  }
  return [...selected.values()].sort((a, b) => {
    const aKey = `${a.period_start}|${observationSeriesIdentity(a)}|${a.period_end}`;
    const bKey = `${b.period_start}|${observationSeriesIdentity(b)}|${b.period_end}`;
    return aKey.localeCompare(bKey);
  });
}

function isValidDate(dateString: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === dateString;
}

function periodEndFor(start: string, frequency: ObservationFrequency): string | null {
  const [year, month] = start.split("-").map(Number);
  if (frequency === "daily") return isValidDate(start) ? start : null;
  if (frequency === "monthly") {
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  }
  if (frequency === "quarterly") {
    return new Date(Date.UTC(year, month + 2, 0)).toISOString().slice(0, 10);
  }
  return `${year}-12-31`;
}

function priorPeriod(
  observation: ObservationV1,
): { period_start: string; period_end: string } | null {
  const priorStart = `${Number(observation.period_start.slice(0, 4)) - 1}${observation.period_start.slice(4)}`;
  if (!isValidDate(priorStart)) return null;
  const priorEnd = periodEndFor(priorStart, observation.frequency);
  return priorEnd ? { period_start: priorStart, period_end: priorEnd } : null;
}

function round(value: number): number {
  return Number(value.toFixed(12));
}

function hasPartialFlag(observation: ObservationV1): boolean {
  return observation.quality_flags.some((flag) => /partial|incomplete/i.test(flag));
}

function comparisonFor(
  current: ObservationV1,
  prior: ObservationV1 | undefined,
  expectedPrior: { period_start: string; period_end: string } | null,
): SeriesPeriodComparison {
  const base = {
    source_id: current.source_id,
    metric_id: current.metric_id,
    definition_version: current.definition_version,
    geo_type: current.geo_type,
    geo_id: current.geo_id,
    frequency: current.frequency,
    unit: current.unit,
    period_start: current.period_start,
    period_end: current.period_end,
    current_value: current.value,
    current_status: current.status,
    current_vintage_id: current.vintage_id,
    current_source_sha256: current.source_sha256,
    current_published_at: current.published_at,
    current_first_seen_at: current.first_seen_at,
    current_retrieved_at: current.retrieved_at,
    current_available_at: current.available_at,
    current_availability_basis: current.availability_basis,
    prior_period_start: expectedPrior?.period_start ?? null,
    prior_period_end: expectedPrior?.period_end ?? null,
    prior_value: prior?.value ?? null,
    prior_status: prior?.status ?? null,
    prior_vintage_id: prior?.vintage_id ?? null,
    quality_flags: [...new Set([...current.quality_flags, ...(prior?.quality_flags ?? [])])].sort(),
  };

  let gapReason: string | null = null;
  if (!expectedPrior) {
    gapReason = `No exact prior-year calendar period exists for ${current.period_start}`;
  } else if (!prior) {
    gapReason = `Missing exact prior-year period ${expectedPrior.period_start} through ${expectedPrior.period_end}`;
  } else if (current.frequency !== prior.frequency) {
    gapReason = `Frequency mismatch: current=${current.frequency}, prior=${prior.frequency}`;
  } else if (current.unit !== prior.unit) {
    gapReason = `Unit mismatch: current=${current.unit}, prior=${prior.unit}`;
  } else if (current.status !== "observed" || current.value === null) {
    gapReason = `Current period is ${current.status}, not an observed finite value`;
  } else if (prior.status !== "observed" || prior.value === null) {
    gapReason = `Prior period is ${prior.status}, not an observed finite value`;
  } else if (hasPartialFlag(current) || hasPartialFlag(prior)) {
    gapReason = "Current or prior period is flagged partial/incomplete";
  }

  if (gapReason !== null || !prior || current.value === null || prior.value === null) {
    return {
      ...base,
      absolute_change: null,
      percent_change: null,
      direction: "insufficient",
      classification: "insufficient_evidence",
      gap_reason: gapReason ?? "Period is not comparable",
    };
  }

  const absoluteChange = round(current.value - prior.value);
  const percentChange = prior.value === 0 ? null : round((absoluteChange / prior.value) * 100);
  return {
    ...base,
    absolute_change: absoluteChange,
    percent_change: percentChange,
    direction: absoluteChange > 0 ? "increase" : absoluteChange < 0 ? "decrease" : "no_change",
    classification: "comparable",
    gap_reason:
      prior.value === 0 ? "Percent change is undefined because the prior value is zero" : null,
  };
}

function withinWindow(observation: ObservationV1, from: string, through: string): boolean {
  const month = observation.period_start.slice(0, 7);
  return month >= from && month <= through;
}

function assessPeriods(series: SeriesPeriodComparison[]): PeriodAssessment[] {
  const groups = new Map<string, SeriesPeriodComparison[]>();
  for (const item of series) {
    const key = `${item.period_start}|${item.period_end}|${item.frequency}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, items]) => {
      const comparable = items.filter((item) => item.classification === "comparable");
      const insufficientCount = items.length - comparable.length;
      const sourceCount = new Set(comparable.map((item) => item.source_id)).size;
      const directions = [...new Set(comparable.map((item) => item.direction))].sort();
      let classification: EvidenceClassification;
      let gapReason: string | null = null;
      if (sourceCount < 2) {
        classification = "insufficient_evidence";
        gapReason = "Fewer than two distinct sources are comparable for this period";
      } else if (directions.length === 1) {
        classification = "agreement";
        if (insufficientCount > 0) {
          gapReason = `${insufficientCount} additional series lacks a complete exact prior-year comparison`;
        }
      } else {
        classification = "divergence";
        if (insufficientCount > 0) {
          gapReason = `${insufficientCount} additional series lacks a complete exact prior-year comparison`;
        }
      }
      return {
        period_start: items[0].period_start,
        period_end: items[0].period_end,
        frequency: items[0].frequency,
        classification,
        source_count: sourceCount,
        comparable_series_count: comparable.length,
        insufficient_series_count: insufficientCount,
        directions,
        gap_reason: gapReason,
      };
    });
}

export function comparePriorYearPeriods(
  observations: ObservationV1[],
  window: { from: string; through: string },
): PriorYearComparisonResult {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(window.from)) {
    throw new Error(`from must be YYYY-MM, received ${window.from}`);
  }
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(window.through)) {
    throw new Error(`through must be YYYY-MM, received ${window.through}`);
  }
  if (window.from > window.through) throw new Error("from must not be after through");

  const selected = selectLatestVintages(observations);
  const bySeriesPeriod = new Map(selected.map((item) => [periodSeriesIdentity(item), item]));
  const currentRows = selected.filter((item) => withinWindow(item, window.from, window.through));
  const series = currentRows.map((current) => {
    const expectedPrior = priorPeriod(current);
    const prior = expectedPrior
      ? bySeriesPeriod.get(
          `${observationSeriesIdentity(current)}|${expectedPrior.period_start}|${expectedPrior.period_end}`,
        )
      : undefined;
    return comparisonFor(current, prior, expectedPrior);
  });

  return {
    selection_policy:
      "latest_evidenced_vintage: max(available_at, published_at, first_seen_at, retrieved_at), then vintage_id and source_sha256 lexical tie-break",
    series,
    periods: assessPeriods(series),
  };
}
