import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutputDirection,
  BrainOutputMetric,
  BrainOutputMetricSource,
  BrainOutputProducerResult,
} from "../types/brain-output.mts";
import {
  fdleCrimeSource,
  type FdleCrimeNormalized,
} from "../sources/fdle-crime-source.mts";

/**
 * safety-swfl — SWFL (Lee + Collier) property crime rate, FBI CDE NIBRS.
 *
 * Source: public.fdle_crime_swfl (ingest/pipelines/fdle_crime_swfl, quarterly cron).
 *   2022+ comes from the FBI Crime Data Explorer (NIBRS; FL agencies → FDLE → FBI),
 *   which exposes participated_population so the county rate is coverage-matched and
 *   lands at the UCR baseline (Lee ~10/1k) — it replaces the unfit FIBRS county
 *   aggregation that undercounted ~2.3x (issue #59).
 * Data: UCR property crime — burglary, larceny-theft, motor vehicle theft — per 1,000
 *   residents. Annual grain; ~6–9 month publication lag. Quarterly ingest cadence.
 *
 * Tier-1 Reporter: no opinions, cited facts only.
 *
 * Direction polarity: falling crime rate → bullish (safer investment environment).
 *   |YoY SWFL Δ| ≥ 3%: bullish (falling) or bearish (rising). < 3%: neutral.
 *
 * Key metrics:
 *   safety_property_crime_per_1k_lee      — Lee County per-1k rate, latest year
 *   safety_property_crime_per_1k_collier  — Collier County per-1k rate, latest year
 *   safety_property_crime_per_1k_swfl     — population-weighted SWFL combined rate
 *   safety_property_crime_yoy_pct_swfl    — SWFL YoY % change (direction signal)
 *   safety_property_crime_yoy_pct_lee     — Lee YoY % change
 *   safety_property_crime_yoy_pct_collier — Collier YoY % change
 *   safety_total_property_crimes_lee      — Lee raw incident count, latest year
 *   safety_total_property_crimes_collier  — Collier raw incident count, latest year
 */

// ── Closure state ─────────────────────────────────────────────────────────────

let lastRows: FdleCrimeNormalized[] = [];
let lastFetchedAt: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function rowsFromFragments(fragments: RawFragment[]): FdleCrimeNormalized[] {
  return fragments
    .map((f) => f.normalized as unknown as FdleCrimeNormalized)
    .filter((r): r is FdleCrimeNormalized => r?.kind === "fdle-crime");
}

function latestYear(rows: FdleCrimeNormalized[]): number {
  return Math.max(...rows.map((r) => r.data_year), 0);
}

function rowFor(
  rows: FdleCrimeNormalized[],
  county: string,
  year: number,
): FdleCrimeNormalized | null {
  return (
    rows.find(
      (r) =>
        r.county.toLowerCase() === county.toLowerCase() && r.data_year === year,
    ) ?? null
  );
}

function yoyPct(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return Number((((current - prior) / prior) * 100).toFixed(1));
}

// ── Tuning constants (all cited in SOURCED.md) ─────────────────────────────────

/**
 * Direction threshold: |YoY rate Δ| ≥ this percent flips bullish/bearish; below it,
 * neutral. Engineering estimate — see SOURCED.md#safety-swfl-direction-threshold.
 */
const DIRECTION_THRESHOLD_PCT = 3;

/**
 * Magnitude normalizer: magnitude = min(1, |YoY %| / this). A 15% YoY swing saturates
 * to full magnitude. Engineering estimate — see SOURCED.md#safety-swfl-magnitude-divisor.
 */
const MAGNITUDE_YOY_DIVISOR = 15;

/**
 * Coverage-shift suppression line. `population` here is the COVERED population — the
 * sum of the participated populations of the agencies that reported NIBRS (via CDE)
 * that year, which is the per-1k denominator. Organic county growth is ~1–3%/yr, so a
 * YoY move larger than this percent can only mean an agency entered or left the roster
 * (Cape Coral PD, ~25% of Lee, was absent in 2021 and entered in 2022). When that
 * happens the YoY rate compares two different geographies, so we force the direction to
 * neutral and caveat it. See SOURCED.md#safety-swfl-coverage-shift-threshold.
 */
const COVERAGE_SHIFT_SUPPRESS_PCT = 10;

/** Property crime is INVERSE: a falling rate signals an improving investment environment. */
function crimeDirection(yoyPct: number | null): BrainOutputDirection {
  if (yoyPct == null) return "neutral";
  if (yoyPct <= -DIRECTION_THRESHOLD_PCT) return "bullish";
  if (yoyPct >= DIRECTION_THRESHOLD_PCT) return "bearish";
  return "neutral";
}

function rateTrend(yoyPct: number | null): "falling" | "rising" | "stable" {
  if (yoyPct == null) return "stable";
  if (yoyPct <= -DIRECTION_THRESHOLD_PCT) return "falling";
  if (yoyPct >= DIRECTION_THRESHOLD_PCT) return "rising";
  return "stable";
}

/**
 * |YoY %| change in covered population. null when either year is missing or zero.
 * Used to detect a FIBRS agency-roster shift that would make the YoY rate misleading.
 */
function coverageShiftPct(
  current: number | null,
  prior: number | null,
): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return Math.abs(((current - prior) / prior) * 100);
}

function makeSource(
  fetchedAt: string,
  sourceUrl: string,
  year: number,
): BrainOutputMetricSource {
  return {
    url: sourceUrl || "https://cde.ucr.cjis.gov/",
    fetched_at: fetchedAt,
    tier: 1,
    citation: `FBI Crime Data Explorer (NIBRS) — property crime by county, ${year} annual data. Florida agencies reported via FDLE to the FBI UCR program; coverage-matched county rate.`,
  };
}

// ── corpusSummary ─────────────────────────────────────────────────────────────

function safetyCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  lastRows = [];
  lastFetchedAt = null;

  const rows = rowsFromFragments(allFragments);
  if (rows.length === 0) return [];

  lastRows = rows;
  lastFetchedAt = new Date().toISOString();

  const yr = latestYear(rows);
  return [
    {
      topic: "corpus_overview",
      fact: "FDLE UCR property crime corpus (Lee + Collier)",
      value: `${rows.length} county-year rows, latest year ${yr}.`,
      source_fragment_ids: [],
    },
  ];
}

// ── outputProducer ────────────────────────────────────────────────────────────

function safetyOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const fetched_at = lastFetchedAt ?? new Date().toISOString();

  if (lastRows.length === 0) {
    return {
      conclusion:
        "safety-swfl: no FDLE UCR rows available this build. Verify fdle_crime_swfl table has been populated via the fdle_crime_swfl ingest pipeline.",
      key_metrics: [],
      caveats: [
        "Zero rows from fdle_crime_swfl. Run: python -m ingest.pipelines.fdle_crime_swfl.pipeline --current",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const yr = latestYear(lastRows);
  const priorYr = yr - 1;

  const leeNow = rowFor(lastRows, "Lee", yr);
  const leePrior = rowFor(lastRows, "Lee", priorYr);
  const collierNow = rowFor(lastRows, "Collier", yr);
  const collierPrior = rowFor(lastRows, "Collier", priorYr);

  const leeRate = leeNow?.property_crime_per_1k ?? null;
  const collierRate = collierNow?.property_crime_per_1k ?? null;
  const leePriorRate = leePrior?.property_crime_per_1k ?? null;
  const collierPriorRate = collierPrior?.property_crime_per_1k ?? null;

  const leeYoy = yoyPct(leeRate, leePriorRate);
  const collierYoy = yoyPct(collierRate, collierPriorRate);

  // Population-weighted SWFL combined rate
  const leePop = leeNow?.population ?? null;
  const collierPop = collierNow?.population ?? null;
  let swflRate: number | null = null;
  if (leeRate !== null && collierRate !== null && leePop && collierPop) {
    const totalPop = leePop + collierPop;
    swflRate = Number(
      ((leeRate * leePop + collierRate * collierPop) / totalPop).toFixed(2),
    );
  } else if (leeRate !== null) {
    swflRate = leeRate;
  } else if (collierRate !== null) {
    swflRate = collierRate;
  }

  // SWFL YoY (population-weighted when both counties available)
  const leePriorPop = leePrior?.population ?? null;
  const collierPriorPop = collierPrior?.population ?? null;
  let swflYoy: number | null = null;
  if (
    leePriorRate !== null &&
    collierPriorRate !== null &&
    leePriorPop &&
    collierPriorPop
  ) {
    const priorTotalPop = leePriorPop + collierPriorPop;
    const priorSwfl = Number(
      (
        (leePriorRate * leePriorPop + collierPriorRate * collierPriorPop) /
        priorTotalPop
      ).toFixed(2),
    );
    swflYoy = yoyPct(swflRate, priorSwfl);
  } else {
    const available = [leeYoy, collierYoy].filter(
      (y): y is number => y !== null,
    );
    swflYoy =
      available.length > 0
        ? Number(
            (available.reduce((a, b) => a + b, 0) / available.length).toFixed(
              1,
            ),
          )
        : null;
  }

  // ── Coverage-shift guard ───────────────────────────────────────────────────
  // `population` is the COVERED population (sum of reporting-agency populations).
  // A >COVERAGE_SHIFT_SUPPRESS_PCT YoY move means the FIBRS roster changed (an agency
  // entered or left), so the YoY rate compares two different geographies — suppress
  // the affected county's trend to neutral rather than report a fabricated direction.
  const leeCovShift = coverageShiftPct(leePop, leePriorPop);
  const collierCovShift = coverageShiftPct(collierPop, collierPriorPop);
  const leeRosterShift =
    leeCovShift != null && leeCovShift > COVERAGE_SHIFT_SUPPRESS_PCT;
  const collierRosterShift =
    collierCovShift != null && collierCovShift > COVERAGE_SHIFT_SUPPRESS_PCT;
  const swflRosterShift = leeRosterShift || collierRosterShift;

  const leeTrend = leeRosterShift ? "stable" : rateTrend(leeYoy);
  const collierTrend = collierRosterShift ? "stable" : rateTrend(collierYoy);
  const swflTrend = swflRosterShift ? "stable" : rateTrend(swflYoy);

  const direction = swflRosterShift ? "neutral" : crimeDirection(swflYoy);
  const magnitude = swflRosterShift
    ? 0
    : Math.min(1, Math.abs(swflYoy ?? 0) / MAGNITUDE_YOY_DIVISOR);

  const archiveUrl = "https://cde.ucr.cjis.gov/";
  const leeSource = makeSource(
    fetched_at,
    leeNow?.source_url || archiveUrl,
    yr,
  );
  const collierSource = makeSource(
    fetched_at,
    collierNow?.source_url || archiveUrl,
    yr,
  );
  const swflSource = makeSource(
    fetched_at,
    leeNow?.source_url || archiveUrl,
    yr,
  );

  const key_metrics: BrainOutputMetric[] = [];

  if (leeRate !== null) {
    key_metrics.push({
      metric: "safety_property_crime_per_1k_lee",
      value: leeRate,
      direction: leeTrend,
      label: `Lee County property crime rate — ${yr} UCR, Part I offenses per 1,000 residents`,
      variable_type: "intensive",
      units: "per 1,000 population",
      display_format: "raw",
      source: leeSource,
    });
  }

  if (collierRate !== null) {
    key_metrics.push({
      metric: "safety_property_crime_per_1k_collier",
      value: collierRate,
      direction: collierTrend,
      label: `Collier County property crime rate — ${yr} UCR, Part I offenses per 1,000 residents`,
      variable_type: "intensive",
      units: "per 1,000 population",
      display_format: "raw",
      source: collierSource,
    });
  }

  if (swflRate !== null) {
    key_metrics.push({
      metric: "safety_property_crime_per_1k_swfl",
      value: swflRate,
      direction: swflTrend,
      label: `SWFL (Lee + Collier) population-weighted property crime rate — ${yr} UCR, Part I offenses per 1,000 residents`,
      variable_type: "intensive",
      units: "per 1,000 population",
      display_format: "raw",
      source: swflSource,
    });
  }

  if (swflYoy !== null) {
    key_metrics.push({
      metric: "safety_property_crime_yoy_pct_swfl",
      value: swflYoy,
      direction: swflTrend,
      label: `SWFL property crime rate YoY — ${priorYr} to ${yr}, percent change`,
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: swflSource,
    });
  }

  if (leeYoy !== null) {
    key_metrics.push({
      metric: "safety_property_crime_yoy_pct_lee",
      value: leeYoy,
      direction: leeTrend,
      label: `Lee County property crime rate YoY — ${priorYr} to ${yr}, percent change`,
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: leeSource,
    });
  }

  if (collierYoy !== null) {
    key_metrics.push({
      metric: "safety_property_crime_yoy_pct_collier",
      value: collierYoy,
      direction: collierTrend,
      label: `Collier County property crime rate YoY — ${priorYr} to ${yr}, percent change`,
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: collierSource,
    });
  }

  if (leeNow?.total_property_crimes != null) {
    key_metrics.push({
      metric: "safety_total_property_crimes_lee",
      value: leeNow.total_property_crimes,
      direction: "stable",
      label: `Lee County total Part I property crime incidents — ${yr} UCR`,
      variable_type: "extensive",
      units: "incidents",
      display_format: "count",
      source: leeSource,
    });
  }

  if (collierNow?.total_property_crimes != null) {
    key_metrics.push({
      metric: "safety_total_property_crimes_collier",
      value: collierNow.total_property_crimes,
      direction: "stable",
      label: `Collier County total Part I property crime incidents — ${yr} UCR`,
      variable_type: "extensive",
      units: "incidents",
      display_format: "count",
      source: collierSource,
    });
  }

  // ── Conclusion prose ──────────────────────────────────────────────────────

  const parts: string[] = [];

  if (swflRate !== null) {
    const trendPhrase =
      swflYoy != null
        ? `, ${swflYoy >= 0 ? "+" : ""}${swflYoy}% YoY`
        : " (no prior-year comparison available)";
    parts.push(
      `SWFL property crime: ${swflRate.toFixed(1)} Part I offenses per 1,000 residents (${yr} UCR)${trendPhrase}.`,
    );
  }

  if (
    leeRate !== null &&
    collierRate !== null &&
    Math.abs(leeRate - collierRate) > 1
  ) {
    const higher = leeRate > collierRate ? "Lee" : "Collier";
    const lower = leeRate > collierRate ? "Collier" : "Lee";
    const higherVal = leeRate > collierRate ? leeRate : collierRate;
    const lowerVal = leeRate > collierRate ? collierRate : leeRate;
    parts.push(
      `${higher} (${higherVal.toFixed(1)}/1k) runs ${(higherVal - lowerVal).toFixed(1)} points above ${lower} (${lowerVal.toFixed(1)}/1k).`,
    );
  }

  const caveats: string[] = [
    `Property crime data is annual (${yr}) with ~6–9 month publication lag; quarterly incident granularity is not available at county level.`,
  ];

  const missing = (["Lee", "Collier"] as const).filter(
    (c) => !rowFor(lastRows, c, yr),
  );
  if (missing.length > 0) {
    caveats.push(
      `${missing.join(", ")} County data absent for ${yr}; the FBI may not yet have published ${yr} NIBRS data.`,
    );
  }

  if (swflYoy == null) {
    caveats.push(
      `Prior-year (${priorYr}) data not in table — YoY comparison unavailable.`,
    );
  }

  // Coverage caveat — the per-1k denominator is the COVERED population (sum of the
  // participated populations of the agencies that reported NIBRS via CDE that year).
  // From 2022 the big-three Lee agencies (Sheriff, Cape Coral, Fort Myers) all report,
  // so Lee covers ~the full county and the rate sits at the UCR baseline; in Collier,
  // Naples PD does not report, so its ~20k residents are outside the denominator.
  caveats.push(
    "Rate is per 1,000 residents covered by the agencies reporting NIBRS to the FBI that " +
      "year (the denominator is the sum of those agencies' participated populations). Lee " +
      "coverage is near-complete from 2022; in Collier, Naples PD does not report, so the " +
      "Collier rate reflects the Sheriff + Marco Island footprint.",
  );

  if (leeRosterShift) {
    caveats.push(
      `Lee's NIBRS reporting footprint changed >${COVERAGE_SHIFT_SUPPRESS_PCT}% from ${priorYr} to ${yr} ` +
        `(covered population ${leePriorPop?.toLocaleString()} → ${leePop?.toLocaleString()}); an agency entered ` +
        `or left the roster, so the Lee year-over-year direction is suppressed (reported as neutral).`,
    );
  }
  if (collierRosterShift) {
    caveats.push(
      `Collier's NIBRS reporting footprint changed >${COVERAGE_SHIFT_SUPPRESS_PCT}% from ${priorYr} to ${yr} ` +
        `(covered population ${collierPriorPop?.toLocaleString()} → ${collierPop?.toLocaleString()}); the Collier ` +
        `year-over-year direction is suppressed (reported as neutral).`,
    );
  }

  return {
    conclusion:
      parts.length > 0
        ? parts.join(" ")
        : `safety-swfl: FDLE UCR property crime data for Lee + Collier (${yr}).`,
    key_metrics,
    caveats,
    direction,
    magnitude,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

export const safetySwfl: PackDefinition = {
  id: "safety-swfl",
  brain_id: "safety-swfl",
  public_label: "Public Safety",
  domain: "real-estate",
  scope:
    "SWFL (Lee + Collier) property crime rate from FBI Crime Data Explorer NIBRS — " +
    "property offenses (burglary, larceny-theft, motor vehicle theft) per 1,000 residents, " +
    "coverage-matched to reporting agencies. Annual grain, quarterly ingest cadence; " +
    "data lags ~6–9 months.",
  ttl_seconds: 7_776_000, // 90 days — matches quarterly source cadence
  sources: [fdleCrimeSource],
  input_brains: [],
  fitScore: () => 10,
  skipTriageAgent: true,
  skipSynthesisAgent: true,
  corpusSummary: safetyCorpusSummary,
  outputProducer: safetyOutputProducer,
  preferences: [
    "Property crime rate is an underwriting input: rising crime is a headwind for occupancy and rent growth in commercial corridors.",
    "Lee vs. Collier divergence in crime trajectory is decision-relevant for corridor-level site selection.",
    "UCR data is annual; do not cross-compare to sub-county or monthly figures from other sources without normalizing the grain.",
  ],
  activeProject:
    "safety-swfl: FDLE UCR property crime baseline for Lee + Collier as a real-estate underwriting input.",
  prompts: {
    triageContext:
      "A FDLE UCR record is decision-relevant when it is a Part I property crime count for Lee or Collier County. Violent crime counts are context only — this brain tracks property crime exclusively.",
    synthesisContext:
      "Report the property_crime_per_1k rate by county and the SWFL population-weighted combined rate. Quote the UCR year and the data lag. Surface the YoY trend direction explicitly — a falling rate is bullish for the investment environment; a rising rate is bearish.",
  },
};
