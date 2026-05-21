import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutputMetric,
  BrainOutputMetricSource,
  BrainOutputProducerResult,
} from "../types/brain-output.mts";
import {
  corridorSource,
  type CorridorNormalized,
  type CorridorMetricDirection,
} from "../sources/cre-source.mts";
import { env } from "../config/env.mts";

// --- CRE pack (cre-swfl) -------------------------------------------------

// Per-pipeline-run state for the cre producer. Same pattern as macro-swfl /
// sector-credit-swfl / master: typed values cannot survive in SynthesisFact.value,
// so the producer reads from closure state instead of re-parsing facts.
//
// P2 RETROFIT (Session 8 Part 3): cre-swfl is the second brain on the per-metric
// provenance contract (env-swfl was first). Every key_metric carries an inline
// `source` with the Brains Supabase PostgREST URL, the single-query fetched_at,
// trust tier 2 (verified editorial), and a citation that names every
// contributing corridor + its editorial source_url — a disputant can trace any
// median back to the exact rows that produced it.

let lastCorridors: CorridorNormalized[] = [];

let lastCorridorFetchedAt: string | null = null;

/**
 * Build a BrainOutputMetricSource for a cre-swfl aggregate metric.
 *
 * The URL is the reproducible PostgREST query against Brains Supabase
 * (`{BRAINS_SUPABASE_URL}/rest/v1/corridor_profiles?...`), filtered to the
 * same rows that fed the median — verified, non-deleted, and non-null for the
 * specific metric column. In fixture mode the URL collapses to the fixture
 * file path so the receipt still points at the actual data origin.
 *
 * The citation enumerates the contributing corridors with their editorial
 * `source_url`s (when present), so a reader can trace value → corridor → its
 * own source without leaving the OUTPUT block.
 */
function buildCreAggregateSource(
  field: "cap_rate_pct" | "vacancy_rate_pct",
  contributing: CorridorNormalized[],
  fetched_at: string,
): BrainOutputMetricSource {
  const url =
    env.source === "live" && env.supabaseUrl
      ? `${env.supabaseUrl}/rest/v1/corridor_profiles?select=*&verification_status=eq.verified&deleted_at=is.null&${field}=not.is.null`
      : "fixture://refinery/__fixtures__/corridor-profiles.sample.json";
  const named = contributing
    .map((c) => {
      const tail = c.source_url ? ` [${c.source_url}]` : "";
      return `${c.name} (${c.city}, ${c.county})${tail}`;
    })
    .join("; ");
  return {
    url,
    fetched_at,
    tier: 2,
    citation: `Brains Supabase corridor_profiles (verified, non-deleted) — median across ${contributing.length} corridors reporting ${field}: ${named}.`,
  };
}

// Number.EPSILON guard: without it (0.3 + 0.35) / 2 = 0.32499999999999996
// floors to 0.32 instead of rounding to 0.33.
const round2 = (n: number): string =>
  (Math.round((n + Number.EPSILON) * 100) / 100).toString();

/** Median of a numeric array. Returns null on empty input. */
function medianOf(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Most-common direction across a slice of corridors (modal direction). */
function modalDirection(
  values: (CorridorMetricDirection | null)[],
): CorridorMetricDirection {
  const counts: Record<CorridorMetricDirection, number> = {
    rising: 0,
    falling: 0,
    stable: 0,
  };
  for (const v of values) {
    if (v != null) counts[v] += 1;
  }
  // Tiebreak: stable > falling > rising (descriptive over directional when tied).
  if (counts.falling > counts.rising && counts.falling > counts.stable) {
    return "falling";
  }
  if (counts.rising > counts.falling && counts.rising > counts.stable) {
    return "rising";
  }
  return "stable";
}

/** Sorted "label (count)" breakdown of a string-keyed tally, count-descending. */
function breakdown(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} (${v})`)
    .join(", ");
}

/**
 * Pack-fit for a CRE corridor fragment. Every corridor that arrives is already
 * verified, so nothing is hard-dropped — the score scales with how much
 * intelligence a corridor actually carries (narrative + ground-truth flags).
 */
function creFitScore(fragment: RawFragment): number {
  const c = fragment.normalized as unknown as CorridorNormalized;
  let score = 6; // every verified corridor belongs in the pack
  if (c.character) score += 2; // carries a narrative
  if (c.flags.length > 0) score += 2; // carries ground-truth flags
  return score;
}

/**
 * Deterministic corpus-level facts for the CRE pack — computed in code, never
 * by the LLM. Covers the five corridor aggregates: corridor count, count by
 * type, count by county, seasonal-index stats, and active-flag stats.
 */
function creCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  const corridors = allFragments.map(
    (f) => f.normalized as unknown as CorridorNormalized,
  );
  // Stash for creSwflOutputProducer — typed values + nullable metric fields can't
  // survive in SynthesisFact.value (string-only). Same pattern as macro-swfl.
  lastCorridors = corridors;
  // Single batch query — every fragment carries the same fetched_at. Stash it
  // for the producer's per-metric provenance receipts. Falls back to null if
  // the fragment array is somehow empty downstream of the early return.
  lastCorridorFetchedAt = allFragments[0]?.fetched_at ?? null;
  if (corridors.length === 0) return [];

  const byType: Record<string, number> = {};
  const byCounty: Record<string, number> = {};
  for (const c of corridors) {
    byType[c.corridor_type] = (byType[c.corridor_type] ?? 0) + 1;
    byCounty[c.county] = (byCounty[c.county] ?? 0) + 1;
  }

  const seasonal = corridors
    .map((c) => c.seasonal_index)
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  const mid = Math.floor(seasonal.length / 2);
  const median =
    seasonal.length === 0
      ? null
      : seasonal.length % 2 === 1
        ? seasonal[mid]
        : (seasonal[mid - 1] + seasonal[mid]) / 2;
  const avg =
    seasonal.length === 0
      ? null
      : seasonal.reduce((s, v) => s + v, 0) / seasonal.length;

  const flags = corridors.flatMap((c) => c.flags);
  const byFlagType: Record<string, number> = {};
  for (const fl of flags) byFlagType[fl.type] = (byFlagType[fl.type] ?? 0) + 1;
  const corridorsWithFlags = corridors.filter((c) => c.flags.length > 0).length;

  const facts: SynthesisFact[] = [
    {
      topic: "corpus_overview",
      fact: "Dataset scope — verified SWFL commercial real estate corridors",
      value:
        `${corridors.length} verified SWFL CRE corridors: ` +
        `${byCounty["Lee"] ?? 0} in Lee County, ${byCounty["Collier"] ?? 0} in Collier County` +
        `${byCounty["Unknown"] ? `, ${byCounty["Unknown"]} unmapped` : ""}, across ${Object.keys(byType).length} corridor types.`,
      source_fragment_ids: [],
    },
    {
      topic: "corridors_by_type",
      fact: "Verified corridor count by corridor type",
      value: `Corridor count by type: ${breakdown(byType)}.`,
      source_fragment_ids: [],
    },
    {
      topic: "corridors_by_county",
      fact: "Verified corridor count by county (derived from city)",
      value:
        `Corridor count by county, derived from city: ${breakdown(byCounty)}. ` +
        `County is not a column in the source — Naples maps to Collier, all other corpus cities to Lee.`,
      source_fragment_ids: [],
    },
  ];

  if (seasonal.length > 0 && median != null && avg != null) {
    facts.push({
      topic: "seasonal_index_stats",
      fact: "Seasonal-index distribution across the verified corridors",
      value:
        `Seasonal index across ${seasonal.length} corridors: min ${round2(seasonal[0])}, ` +
        `max ${round2(seasonal[seasonal.length - 1])}, median ${round2(median)}, average ${round2(avg)}. ` +
        `The scale runs 0 (no seasonality) to 1 (extreme seasonality).`,
      source_fragment_ids: [],
    });
  }

  if (flags.length > 0) {
    facts.push({
      topic: "active_flags_summary",
      fact: "Active corridor flags — the ground-truth intelligence layer",
      value:
        `${flags.length} active corridor flags across ${corridorsWithFlags} of ${corridors.length} corridors. ` +
        `By type: ${breakdown(byFlagType)}. These flags capture infrastructure, new-project, regulatory, ` +
        `construction, and status changes that are not visible in public listings.`,
      source_fragment_ids: [],
    });
  }

  // Cap-rate / vacancy-rate aggregates — tagged with `metric:` prefix so they
  // surface in SAVED FACTS alongside the producer's BrainOutput.key_metrics.
  const withCap = corridors.filter((c) => c.cap_rate_pct != null);
  const withVac = corridors.filter((c) => c.vacancy_rate_pct != null);
  const capMedian = medianOf(withCap.map((c) => c.cap_rate_pct as number));
  const vacMedian = medianOf(withVac.map((c) => c.vacancy_rate_pct as number));
  if (capMedian != null) {
    facts.push({
      topic: "metric:cap_rate_median",
      fact: "Median cap rate across SWFL CRE corridors with reported metrics",
      value: `Median cap rate is ${round2(capMedian)}% across ${withCap.length} of ${corridors.length} corridors that have reported metrics this period.`,
      source_fragment_ids: [],
    });
  }
  if (vacMedian != null) {
    facts.push({
      topic: "metric:vacancy_rate_median",
      fact: "Median vacancy rate across SWFL CRE corridors with reported metrics",
      value: `Median vacancy rate is ${round2(vacMedian)}% across ${withVac.length} of ${corridors.length} corridors that have reported metrics this period.`,
      source_fragment_ids: [],
    });
  }

  return facts;
}

/**
 * Per-corridor direction read from the (cap_rate, vacancy) signal pair:
 *   - any "falling" AND any "rising"           → "mixed" corridor (no clear read)
 *   - any "falling", no "rising"               → "bullish" (rates compressing
 *                                                 or space tightening — landlord
 *                                                 market)
 *   - any "rising", no "falling"               → "bearish" (yields widening or
 *                                                 vacancy climbing — distress)
 *   - both stable, or one stable + null        → "neutral"
 *   - both null                                → "no-data"
 */
type CorridorVote = "bullish" | "bearish" | "mixed" | "neutral" | "no-data";

function voteCorridor(c: CorridorNormalized): CorridorVote {
  const cap = c.cap_rate_direction;
  const vac = c.vacancy_rate_direction;
  if (cap == null && vac == null) return "no-data";
  const hasFalling = cap === "falling" || vac === "falling";
  const hasRising = cap === "rising" || vac === "rising";
  if (hasFalling && hasRising) return "mixed";
  if (hasFalling) return "bullish";
  if (hasRising) return "bearish";
  return "neutral"; // any combination of stable + null with no directional signal
}

/**
 * Brain-level CRE direction. Counts per-corridor votes among corridors that
 * have metrics, and applies the spec's 0.60 agreement floor — a single side
 * must hit ≥60% to claim the direction, else the brain reads "mixed".
 */
function voteCreDirection(corridors: CorridorNormalized[]): {
  direction: "bullish" | "bearish" | "mixed" | "neutral";
  magnitude: number;
  caveats: string[];
} {
  const votes = corridors.map(voteCorridor);
  const withData = votes.filter((v) => v !== "no-data");
  const noData = votes.length - withData.length;

  const caveats: string[] = [];
  if (noData > 0) {
    caveats.push(
      `${noData} of ${corridors.length} corridors have no cap_rate / vacancy_rate metrics — direction is read from the ${withData.length} corridors with data.`,
    );
  }
  if (withData.length === 0) {
    return { direction: "neutral", magnitude: 0, caveats };
  }

  const bullish = withData.filter((v) => v === "bullish").length;
  const bearish = withData.filter((v) => v === "bearish").length;
  const mixed = withData.filter((v) => v === "mixed").length;
  const neutral = withData.filter((v) => v === "neutral").length;
  const total = withData.length;

  const bullishRatio = bullish / total;
  const bearishRatio = bearish / total;

  if (bullishRatio >= 0.6) {
    return { direction: "bullish", magnitude: bullishRatio, caveats };
  }
  if (bearishRatio >= 0.6) {
    return { direction: "bearish", magnitude: bearishRatio, caveats };
  }
  // Any directional or mixed signal but no majority → mixed at brain level.
  if (bullish > 0 || bearish > 0 || mixed > 0) {
    return { direction: "mixed", magnitude: 0.5, caveats };
  }
  // All neutral (everything stable) — emit neutral with magnitude scaled by
  // how unanimous "stable" was (loudly neutral when every corridor is stable).
  return { direction: "neutral", magnitude: neutral / total, caveats };
}

/**
 * CRE producer — emits cap_rate_median + vacancy_rate_median as headline
 * key_metrics and votes a deterministic direction from the per-corridor
 * cap_rate_direction / vacancy_rate_direction signals.
 */
function creSwflOutputProducer(out: PackOutput): BrainOutputProducerResult {
  const corridors = lastCorridors;
  const withCap = corridors.filter((c) => c.cap_rate_pct != null);
  const withVac = corridors.filter((c) => c.vacancy_rate_pct != null);
  const capMedian = medianOf(withCap.map((c) => c.cap_rate_pct as number));
  const vacMedian = medianOf(withVac.map((c) => c.vacancy_rate_pct as number));

  // P2 provenance — single-query fetched_at shared across all corridors in
  // this run. If the closure capture missed (zero fragments), fall back to a
  // generated timestamp so the receipt is still well-formed.
  const fetched_at =
    lastCorridorFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const key_metrics: BrainOutputMetric[] = [];
  if (capMedian != null) {
    key_metrics.push({
      metric: "cap_rate_median",
      value: Math.round(capMedian * 100) / 100,
      direction: modalDirection(withCap.map((c) => c.cap_rate_direction)),
      label: `Median SWFL CRE cap rate (${withCap.length} of ${corridors.length} corridors)`,
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: buildCreAggregateSource("cap_rate_pct", withCap, fetched_at),
    });
  }
  if (vacMedian != null) {
    key_metrics.push({
      metric: "vacancy_rate_median",
      value: Math.round(vacMedian * 100) / 100,
      direction: modalDirection(withVac.map((c) => c.vacancy_rate_direction)),
      label: `Median SWFL CRE vacancy rate (${withVac.length} of ${corridors.length} corridors)`,
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: buildCreAggregateSource("vacancy_rate_pct", withVac, fetched_at),
    });
  }

  const vote = voteCreDirection(corridors);

  const conclusionParts: string[] = [];
  if (corridors.length > 0) {
    conclusionParts.push(
      `The SWFL CRE pack covers ${corridors.length} verified corridors across Lee and Collier counties.`,
    );
  }
  if (capMedian != null && vacMedian != null) {
    conclusionParts.push(
      `Median cap rate sits at ${round2(capMedian)}% (${modalDirection(withCap.map((c) => c.cap_rate_direction))}); median vacancy at ${round2(vacMedian)}% (${modalDirection(withVac.map((c) => c.vacancy_rate_direction))}).`,
    );
  } else {
    conclusionParts.push(
      "Cap-rate and vacancy metrics are not yet populated for enough corridors to anchor a median read.",
    );
  }
  if (vote.direction === "bullish") {
    conclusionParts.push(
      "Cap rates and vacancy are predominantly compressing — landlord-market read.",
    );
  } else if (vote.direction === "bearish") {
    conclusionParts.push(
      "Cap rates and vacancy are predominantly expanding — yield distress read.",
    );
  } else if (vote.direction === "mixed") {
    conclusionParts.push(
      "Corridor reads split between compressing and expanding — no consensus direction at the SWFL CRE level.",
    );
  }

  return {
    conclusion: conclusionParts.join(" "),
    key_metrics,
    caveats: vote.caveats,
    direction: vote.direction,
    magnitude: vote.magnitude,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

export const creSwfl: PackDefinition = {
  id: "cre-swfl",
  brain_id: "cre-swfl",
  domain: "real-estate",
  scope:
    "SWFL commercial real estate corridors — verified corridor intelligence (profiles, character, active flags)",
  ttl_seconds: 604800, // corridor intelligence is editorial, slow-moving
  sources: [corridorSource],
  input_brains: [],
  fitScore: creFitScore,
  corpusSummary: creCorpusSummary,
  outputProducer: creSwflOutputProducer,
  preferences: [
    "The user is a commercial real estate broker working Southwest Florida corridors — tenant rep, landlord rep, retail leasing.",
    "The user reads corridor intelligence to qualify tenants against what a corridor can actually support, and to arm the landlord-value conversation.",
    "The user treats the active-flags layer — infrastructure, new projects, regulatory shifts — as the on-the-ground intelligence that is not in public listings.",
  ],
  activeProject:
    "cre-swfl: standing reference on verified SWFL commercial real estate corridors.",
  prompts: {
    triageContext:
      "These fragments are SWFL CRE corridor profiles. Score how decision-relevant each corridor is to a commercial real estate broker working Southwest Florida. A corridor with a clear character narrative and active ground-truth flags is highly relevant. Score on substance, not length.",
    synthesisContext: [
      "Each fragment is a SWFL CRE corridor profile. Write every fact in descriptive third-person — never imperative, never second-person. Produce a per-corridor fact:",
      "- Lead with name, city, county, corridor_type, and seasonal_index (0-1; higher = more seasonal).",
      "- Weave in the character narrative, evolution_direction, and tenant_mix where present. Some corridors have a null character — omit it gracefully, never invent prose.",
      "- Surface the active_flags by name — they are the ground-truth intelligence layer (infrastructure, new projects, regulatory shifts, status changes a broker cannot get from public listings). This is the crown-jewel intel of the pack.",
      "",
      "Do NOT compute numeric cross-fragment aggregates — corridor counts, county splits, seasonal-index stats, and flag counts are all computed deterministically and prepended as separate facts. Qualitative observations (patterns and themes across corridors) are yours.",
    ].join("\n"),
  },
};
