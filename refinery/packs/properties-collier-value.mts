import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutputMetric,
  BrainOutputMetricSource,
  BrainOutputProducerResult,
} from "../types/brain-output.mts";
import {
  collierMarketSource,
  type CollierSummaryNormalized,
  type CollierSalesYearNormalized,
} from "../sources/collier-market-source.mts";
import { env } from "../config/env.mts";

/**
 * properties-collier-value — Collier County (FL) real-estate market direction read.
 *
 * Single source: data_lake.redfin_collier_market (Tier 2, populated by the
 * Redfin Data Center dlt pipeline — a free public county-tracker TSV filtered to
 * "Collier County, FL"). The source connector sums monthly HOMES_SOLD to
 * calendar-year totals so this pack reuses the SAME yearly z-score math as
 * properties-lee-value.
 *
 * Direction signal: homes-sold velocity z-score for the most recent COMPLETE
 * calendar year (year-1 relative to today) versus the trailing 3-year mean.
 *   bullish if z ≥ +1.0, bearish if z ≤ −1.0, neutral otherwise.
 *
 * Level metrics (no direction contribution):
 *   - collier_homes_sold_zscore        : current-year z vs trailing 3yr
 *   - collier_homes_sold_per_year      : current-year homes sold (count)
 *   - collier_median_sale_price_yoy    : latest-period median sale price YoY %
 *   - collier_months_of_supply         : latest-period months of supply
 *
 * Peer to (NOT a clone of) properties-lee-value: that brain is parcel-grain off
 * the LeePA appraiser and carries a Save-Our-Homes gap. Collier's source is
 * market-grain (Redfin) with NO assessed/taxable value, so there is no SOH gap
 * here. The two velocity numbers are also not strictly comparable (Lee = parcel
 * qualified-sale count; Collier = Redfin closed-sale count).
 *
 * Leaf brain (input_brains: []). Pure deterministic — no synthesis agent.
 */

const Z_BULL_THRESHOLD = 1.0;
const Z_BEAR_THRESHOLD = -1.0;
const BASELINE_YEAR_COUNT = 3;

interface CollierMarketAggregates {
  currentYear: number;
  baselineYears: number[];
  currentSalesCount: number | null;
  baselineSalesCounts: number[];
  baselineMean: number | null;
  baselineStd: number | null;
  zScore: number | null;
  yearsObserved: number;
  latestPeriod: string | null;
  medianSalePriceYoyPct: number | null;
  monthsOfSupply: number | null;
}

let lastAggregate: CollierMarketAggregates | null = null;
let lastFetchedAt: string | null = null;

function salesByYearFrom(fragments: RawFragment[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const f of fragments) {
    const n = f.normalized as unknown as CollierSalesYearNormalized;
    if (n?.kind !== "collier-sales-year") continue;
    out.set(n.year, n.homes_sold);
  }
  return out;
}

function summaryFrom(
  fragments: RawFragment[],
): CollierSummaryNormalized | null {
  for (const f of fragments) {
    const n = f.normalized as unknown as CollierSummaryNormalized;
    if (n?.kind === "collier-summary") return n;
  }
  return null;
}

function populationStd(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(sq);
}

function aggregate(
  salesByYear: Map<number, number>,
  summary: CollierSummaryNormalized | null,
): CollierMarketAggregates {
  const currentYear = new Date().getUTCFullYear() - 1;
  const baselineYears = Array.from(
    { length: BASELINE_YEAR_COUNT },
    (_, i) => currentYear - BASELINE_YEAR_COUNT + i,
  );

  // Missing baseline year = 0 sales (silence = low velocity, not "skip").
  // Missing CURRENT year = null (no signal at all → neutral direction).
  const currentSalesCount = salesByYear.has(currentYear)
    ? (salesByYear.get(currentYear) ?? 0)
    : null;
  const baselineSalesCounts = baselineYears.map((y) => salesByYear.get(y) ?? 0);

  const baselineMean =
    baselineSalesCounts.length === 0
      ? null
      : baselineSalesCounts.reduce((a, b) => a + b, 0) /
        baselineSalesCounts.length;
  const baselineStd = populationStd(baselineSalesCounts);
  const zScore =
    currentSalesCount != null && baselineMean != null && baselineStd > 0
      ? (currentSalesCount - baselineMean) / baselineStd
      : null;

  return {
    currentYear,
    baselineYears,
    currentSalesCount,
    baselineSalesCounts,
    baselineMean,
    baselineStd: baselineStd > 0 ? baselineStd : null,
    zScore,
    yearsObserved: salesByYear.size,
    latestPeriod: summary?.latest_period ?? null,
    medianSalePriceYoyPct: summary?.median_sale_price_yoy_pct ?? null,
    monthsOfSupply: summary?.months_of_supply ?? null,
  };
}

const fmt1 = (n: number): string =>
  Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString();

export function directionFromZScore(
  z: number | null,
): "bullish" | "bearish" | "neutral" {
  if (z == null) return "neutral";
  if (z >= Z_BULL_THRESHOLD) return "bullish";
  if (z <= Z_BEAR_THRESHOLD) return "bearish";
  return "neutral";
}

function buildSource(fetched_at: string): BrainOutputMetricSource {
  const url =
    env.source === "live" && env.supabaseUrl
      ? `${env.supabaseUrl}/rest/v1/redfin_collier_market?select=period_end,homes_sold,median_sale_price_yoy,months_of_supply&property_type=eq.All%20Residential`
      : "fixture://refinery/__fixtures__/properties-collier-value.sample.json";
  const provenance =
    env.source === "live"
      ? `Redfin Data Center county market tracker via data_lake.redfin_collier_market ` +
        `(free public TSV filtered to "Collier County, FL"; monthly homes-sold summed to ` +
        `calendar-year velocity, "All Residential" property type).`
      : `Redfin Collier County market tracker (fixture; ` +
        `refinery/__fixtures__/properties-collier-value.sample.json).`;
  return { url, fetched_at, tier: 2, citation: provenance };
}

function collierCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  const salesByYear = salesByYearFrom(allFragments);
  const summary = summaryFrom(allFragments);
  lastAggregate = aggregate(salesByYear, summary);
  lastFetchedAt = allFragments[0]?.fetched_at ?? null;

  const agg = lastAggregate;
  if (agg.yearsObserved === 0) return [];

  const facts: SynthesisFact[] = [];

  facts.push({
    topic: "corpus_overview",
    fact: "Collier County market snapshot — Redfin county tracker (All Residential)",
    value:
      `Collier County, FL closed-sale velocity from Redfin, monthly homes-sold ` +
      `summed to calendar years. Baseline window ${agg.baselineYears[0]}-${agg.baselineYears[agg.baselineYears.length - 1]}, ` +
      `current year ${agg.currentYear}. Latest period observed: ${agg.latestPeriod ?? "n/a"}.`,
    source_fragment_ids: [],
  });

  if (agg.currentSalesCount != null) {
    facts.push({
      topic: "metric:homes_sold_per_year",
      fact: `Collier homes sold (year ${agg.currentYear})`,
      value: `${agg.currentSalesCount} residential closings recorded by Redfin for Collier County in ${agg.currentYear}.`,
      source_fragment_ids: [],
    });
  }

  if (agg.zScore != null) {
    facts.push({
      topic: "metric:homes_sold_zscore",
      fact: "Collier homes-sold z-score (current year vs trailing 3yr)",
      value:
        `Baseline counts ${agg.baselineYears.map((y, i) => `${y}=${agg.baselineSalesCounts[i]}`).join(", ")}; ` +
        `mean ${agg.baselineMean != null ? fmt1(agg.baselineMean) : "n/a"}, ` +
        `population std ${agg.baselineStd != null ? fmt1(agg.baselineStd) : "n/a"}. ` +
        `Current ${agg.currentSalesCount}. z = ${fmt1(agg.zScore)}.`,
      source_fragment_ids: [],
    });
  }

  if (agg.medianSalePriceYoyPct != null) {
    facts.push({
      topic: "metric:median_sale_price_yoy",
      fact: `Collier median sale price YoY (${agg.latestPeriod ?? "latest"})`,
      value: `${agg.medianSalePriceYoyPct > 0 ? "+" : ""}${fmt1(agg.medianSalePriceYoyPct)}% year-over-year (Redfin median sale price, All Residential).`,
      source_fragment_ids: [],
    });
  }

  if (agg.monthsOfSupply != null) {
    facts.push({
      topic: "metric:months_of_supply",
      fact: `Collier months of supply (${agg.latestPeriod ?? "latest"})`,
      value: `${fmt1(agg.monthsOfSupply)} months of supply — inventory vs sales pace (lower = tighter, seller-favorable).`,
      source_fragment_ids: [],
    });
  }

  return facts;
}

function collierOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const agg = lastAggregate;
  const fetched_at =
    lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  if (!agg || agg.yearsObserved === 0) {
    return {
      conclusion:
        "properties-collier-value could not resolve any Collier County market rows — no velocity/price context available this build.",
      key_metrics: [],
      caveats: [
        `No rows returned by ${env.source === "fixture" ? "fixture" : "live data_lake.redfin_collier_market query"}. ` +
          "If live, confirm the dlt pipeline ran (python -m ingest.pipelines.redfin_collier.pipeline) and that " +
          "docs/sql/redfin_collier_grant.sql was applied.",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const sourceMeta = buildSource(fetched_at);
  const key_metrics: BrainOutputMetric[] = [];

  if (agg.zScore != null) {
    key_metrics.push({
      metric: "collier_homes_sold_zscore",
      value: Math.round(agg.zScore * 100) / 100,
      direction:
        agg.zScore >= Z_BULL_THRESHOLD
          ? "rising"
          : agg.zScore <= Z_BEAR_THRESHOLD
            ? "falling"
            : "stable",
      label: `Collier homes-sold z-score, year ${agg.currentYear} vs trailing ${BASELINE_YEAR_COUNT}yr (${agg.baselineYears[0]}-${agg.baselineYears[agg.baselineYears.length - 1]})`,
      variable_type: "intensive",
      units: "z-score",
      display_format: "ratio",
      source: sourceMeta,
    });
  }
  if (agg.currentSalesCount != null) {
    key_metrics.push({
      metric: "collier_homes_sold_per_year",
      value: agg.currentSalesCount,
      direction: "stable",
      label: `Collier residential homes sold, year ${agg.currentYear} (Redfin closed sales, All Residential)`,
      variable_type: "extensive",
      units: "home sales",
      display_format: "count",
      source: sourceMeta,
    });
  }
  if (agg.medianSalePriceYoyPct != null) {
    key_metrics.push({
      metric: "collier_median_sale_price_yoy",
      value: agg.medianSalePriceYoyPct,
      direction:
        agg.medianSalePriceYoyPct > 0
          ? "rising"
          : agg.medianSalePriceYoyPct < 0
            ? "falling"
            : "stable",
      label: `Collier median sale price YoY (${agg.latestPeriod ?? "latest"}, Redfin All Residential)`,
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: sourceMeta,
    });
  }
  if (agg.monthsOfSupply != null) {
    key_metrics.push({
      metric: "collier_months_of_supply",
      value: Math.round(agg.monthsOfSupply * 10) / 10,
      direction: "stable",
      label: `Collier months of supply (${agg.latestPeriod ?? "latest"}, Redfin All Residential)`,
      variable_type: "intensive",
      units: "months",
      display_format: "ratio",
      source: sourceMeta,
    });
  }

  const direction = directionFromZScore(agg.zScore);
  const magnitude =
    agg.zScore == null ? 0.3 : Math.min(1, Math.abs(agg.zScore) / 3);

  const conclusionParts: string[] = [];
  conclusionParts.push(
    `Collier County had ${agg.currentSalesCount ?? 0} residential closings recorded by Redfin for ${agg.currentYear}.`,
  );
  if (agg.zScore != null && agg.baselineMean != null) {
    conclusionParts.push(
      `Trailing ${BASELINE_YEAR_COUNT}yr baseline (${agg.baselineYears[0]}-${agg.baselineYears[agg.baselineYears.length - 1]}) averaged ${fmt1(agg.baselineMean)} sales/yr; current year sits at z = ${fmt1(agg.zScore)} — ${direction} read on Collier transaction velocity.`,
    );
  } else if (agg.currentSalesCount == null) {
    conclusionParts.push(
      `No closings recorded for ${agg.currentYear} yet — direction is neutral until the next Redfin refresh lands.`,
    );
  } else {
    conclusionParts.push(
      `Trailing baseline has zero variance (all ${BASELINE_YEAR_COUNT} years identical), so z-score is undefined; direction is neutral.`,
    );
  }
  if (agg.medianSalePriceYoyPct != null) {
    conclusionParts.push(
      `Median sale price ${agg.medianSalePriceYoyPct > 0 ? "+" : ""}${fmt1(agg.medianSalePriceYoyPct)}% YoY (${agg.latestPeriod ?? "latest"})${agg.monthsOfSupply != null ? `, ${fmt1(agg.monthsOfSupply)} months of supply` : ""}.`,
    );
  }

  const caveats: string[] = [
    `Collier County only — Lee (see properties-lee-value) and Charlotte are NOT included.`,
    `Market-grain, not parcel-grain: this brain reads Redfin closed-sale aggregates, which carry NO assessed/taxable value, so there is no Save-Our-Homes gap here (that metric is tax-roll-only and lives in the Lee parcel brain).`,
    `Velocity is monthly Redfin HOMES_SOLD summed to calendar years; the current-year count is final only after the year closes and Redfin's revisions settle (recent months are revised upward as late-recorded sales land — treat the most recent year as a soft floor).`,
    `Not directly comparable to properties-lee-value's velocity: Lee counts LeePA qualified parcel sales; Collier counts Redfin closed sales. Compare direction (z-score sign/magnitude), not raw counts.`,
    `Direction thresholds: bullish if z ≥ +${Z_BULL_THRESHOLD.toFixed(1)}σ; bearish if z ≤ ${Z_BEAR_THRESHOLD.toFixed(1)}σ; neutral otherwise. Standard deviation is population std over ${BASELINE_YEAR_COUNT} baseline years; if variance is zero z is undefined and direction is neutral.`,
  ];
  if (env.source === "fixture") {
    caveats.unshift(
      "Collier market rows in this build are synthetic fixture data — unset REFINERY_SOURCE or set it to `live` to query data_lake.redfin_collier_market.",
    );
  }

  return {
    conclusion: conclusionParts.join(" "),
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

export const propertiesCollierValue: PackDefinition = {
  id: "properties-collier-value",
  brain_id: "properties-collier-value",
  public_label: "Collier County Properties",
  domain: "real-estate",
  scope:
    "Collier County (FL) real-estate market direction read — homes-sold velocity z-score (current year vs trailing 3yr) plus median sale price YoY and months of supply, from the Redfin Data Center county market tracker.",
  ttl_seconds: 2592000, // 30 days — Redfin refreshes monthly
  sources: [collierMarketSource],
  input_brains: [],
  fitScore: (): number => 8,
  compositeCutoff: 0,
  skipTriageAgent: true,
  skipSynthesisAgent: true,
  corpusSummary: collierCorpusSummary,
  outputProducer: collierOutputProducer,
  preferences: [
    "The user reads Collier-specific real-estate signals as a county-scoped peer to properties-lee-value; divergence between Lee and Collier direction is itself a signal worth surfacing.",
    "The user treats homes-sold velocity as the leading direction indicator, with price YoY and months of supply as level metrics describing the market's temperature.",
    "The user understands Collier is market-grain (Redfin) and Lee is parcel-grain (LeePA) — comparisons are by direction, not raw counts, and Collier carries no Save-Our-Homes gap.",
  ],
  activeProject:
    "properties-collier-value: standing snapshot of Collier County real-estate market direction — homes-sold velocity z-score + price YoY + months of supply, leaf brain feeding master.",
  prompts: {
    triageContext:
      "These fragments are pre-aggregated per-year homes-sold counts plus a single-row latest-period summary from data_lake.redfin_collier_market. They are all decision-relevant by construction; the pack is pure deterministic aggregation.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). Every fact is produced deterministically by collierCorpusSummary and the BrainOutput is built by collierOutputProducer.",
  },
};
