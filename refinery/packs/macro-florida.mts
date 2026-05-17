import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutput,
  BrainOutputDirection,
  BrainOutputMetric,
  BrainOutputMetricSource,
  BrainOutputProducerResult,
} from "../types/brain-output.mts";
import {
  macroFloridaSource,
  type MacroFloridaNormalized,
} from "../sources/macro-florida-source.mts";
import {
  makeBrainInputSource,
  type BrainInputNormalized,
} from "../sources/brain-input-source.mts";
import { env } from "../config/env.mts";

/**
 * macro-florida — state-level macro context for the Florida market.
 *
 * Mid-tier of the three-tier macro denominator chain:
 *   macro-us → macro-florida → macro-swfl.
 *
 * Branches: two FRED series — Florida unemployment (FLUR) and labor-force
 * participation (LBSSA12 → FLLFPR). Future planned branches: CBP (Census
 * county business patterns, aggregated to FL totals) and IRS SOI migration
 * (FL inflow/outflow). Each lands as another SourceConnector here.
 *
 * Upstream: macro-us, consumed via BrainInputSource for confidence
 * propagation and conclusion-line context. macro-florida emits only FL
 * metrics in key_metrics — downstream brains that also need national
 * metrics declare macro-us as a direct upstream.
 *
 * Pure deterministic — no synthesis agent. Every fact is computed in code
 * from typed fragments.
 */

let lastIndicators: MacroFloridaNormalized[] = [];
let lastFetchedAt: string | null = null;
let lastMacroUsOutput: BrainOutput | null = null;

function buildFredSource(
  indicator: MacroFloridaNormalized,
  fetched_at: string,
): BrainOutputMetricSource {
  const valueStr = Number.isInteger(indicator.value)
    ? String(indicator.value)
    : (Math.round(indicator.value * 100) / 100).toString();
  return {
    url: indicator.source_url,
    fetched_at,
    tier: 1,
    citation:
      `FRED ${indicator.label} (series_id ${indicator.series_id}) — ` +
      `latest observation ${valueStr}${indicator.unit ? " " + indicator.unit : ""} ` +
      `for period ${indicator.period}, ${indicator.direction} vs prior 6 periods. ` +
      `${indicator.context}`,
  };
}

const METRIC_MAP: Record<string, { metric: string; label: string }> = {
  FLUR: { metric: "fl_unemployment", label: "Florida unemployment rate" },
  FLLFPR: {
    metric: "fl_labor_participation",
    label: "Florida labor force participation",
  },
};

function indicatorsFrom(fragments: RawFragment[]): MacroFloridaNormalized[] {
  return fragments
    .map((f) => f.normalized as unknown as MacroFloridaNormalized)
    .filter((n) => n?.kind === "macro-indicator");
}

function brainInputFrom(
  fragments: RawFragment[],
  upstreamId: string,
): BrainOutput | null {
  for (const f of fragments) {
    const n = f.normalized as unknown as BrainInputNormalized;
    if (n?.kind === "brain-input" && n.upstream_id === upstreamId) {
      return n.output;
    }
  }
  return null;
}

const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString();

function macroFloridaCorpusSummary(
  allFragments: RawFragment[],
): SynthesisFact[] {
  const indicators = indicatorsFrom(allFragments);
  const macroUs = brainInputFrom(allFragments, "macro-us");

  lastIndicators = indicators;
  lastMacroUsOutput = macroUs;
  lastFetchedAt =
    allFragments.find(
      (f) =>
        (f.normalized as unknown as MacroFloridaNormalized)?.kind ===
        "macro-indicator",
    )?.fetched_at ?? null;

  if (indicators.length === 0) return [];

  const facts: SynthesisFact[] = [];

  const snapshot = indicators
    .map(
      (i) =>
        `${i.label} is ${fmt(i.value)}% (${i.direction}) as of ${i.period}`,
    )
    .join("; ");
  facts.push({
    topic: "macro_snapshot",
    fact: "Current Florida state-level macro context — labor market",
    value:
      `Florida macro snapshot: ${snapshot}. These series are the state baseline ` +
      `that regional brains (macro-swfl, future macro-tampa/macro-jax) read for gap math.`,
    source_fragment_ids: [],
  });

  for (const i of indicators) {
    const m = METRIC_MAP[i.series_id];
    if (!m) continue;
    facts.push({
      topic: `metric:${m.metric}`,
      fact: m.label,
      value: `${m.label} is ${fmt(i.value)}% (period ${i.period}, direction ${i.direction}). ${i.context}`,
      source_fragment_ids: [],
    });
  }

  return facts;
}

function macroFloridaOutputProducer(
  _out: PackOutput,
): BrainOutputProducerResult {
  const indicators = lastIndicators;
  const macroUs = lastMacroUsOutput;
  const fetched_at =
    lastFetchedAt ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const key_metrics: BrainOutputMetric[] = indicators
    .map((i): BrainOutputMetric | null => {
      const m = METRIC_MAP[i.series_id];
      if (!m) return null;
      return {
        metric: m.metric,
        value: i.value,
        direction: i.direction,
        label: m.label,
        source: buildFredSource(i, fetched_at),
      };
    })
    .filter((m): m is BrainOutputMetric => m !== null);

  const conclusionParts: string[] = [];
  if (indicators.length > 0) {
    const flur = indicators.find((i) => i.series_id === "FLUR");
    const lfpr = indicators.find((i) => i.series_id === "FLLFPR");
    const tone: string[] = [];
    if (flur) {
      tone.push(
        `Florida unemployment at ${fmt(flur.value)}% (${flur.direction})`,
      );
    }
    if (lfpr) {
      tone.push(`labor force participation at ${fmt(lfpr.value)}%`);
    }
    conclusionParts.push(
      `As of the latest reported periods, the Florida state-level labor market reads: ${tone.join(", ")}.`,
    );
    if (macroUs) {
      const sofr = macroUs.key_metrics.find((m) => m.metric === "sofr_rate");
      if (sofr) {
        conclusionParts.push(
          `Read against the national backdrop (macro-us, confidence ${macroUs.confidence.toFixed(2)}): SOFR at ${fmt(sofr.value)}% (${sofr.direction}).`,
        );
      }
    }
    conclusionParts.push(
      `Regional brains (macro-swfl, future macro-tampa/macro-jax) use this brain as the state baseline for gap math.`,
    );
  }

  const sourceCaveats: string[] =
    env.source === "fixture"
      ? [
          "Florida macro indicators in this build are synthetic fixture data (FRED-shaped) — unset REFINERY_SOURCE or set it to `live` for the live FRED API.",
        ]
      : [
          "FRED can revise recent observations within ~30 days of first publication — treat the most recent reading as directional, not final.",
        ];

  const vote = voteMacroDirection(indicators);

  return {
    conclusion: conclusionParts.join(" "),
    key_metrics,
    caveats: [...sourceCaveats, ...vote.caveats],
    direction: vote.direction,
    magnitude: vote.magnitude,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

type IndicatorVote = "bullish" | "bearish" | "neutral";

/**
 * Per-indicator vote. FLUR reads "rising = bearish" — softening labor market.
 * FLLFPR is omitted on purpose — participation direction is context-dependent
 * (could be retirees rejoining or working-age leaving) and not safely voteable.
 */
function voteMacroIndicator(i: MacroFloridaNormalized): IndicatorVote {
  if (i.direction === "stable") return "neutral";
  if (i.series_id !== "FLUR") return "neutral";
  return i.direction === "rising" ? "bearish" : "bullish";
}

function voteMacroDirection(indicators: MacroFloridaNormalized[]): {
  direction: BrainOutputDirection;
  magnitude: number;
  caveats: string[];
} {
  const votes = indicators.map(voteMacroIndicator);
  const total = votes.length;
  if (total === 0) return { direction: "neutral", magnitude: 0, caveats: [] };
  const bullish = votes.filter((v) => v === "bullish").length;
  const bearish = votes.filter((v) => v === "bearish").length;
  const neutral = votes.filter((v) => v === "neutral").length;

  if (bullish > 0 && bearish > 0) {
    return {
      direction: "mixed",
      magnitude: 0.5,
      caveats: [
        `Florida macro indicators split: ${bullish} bullish, ${bearish} bearish, ${neutral} neutral.`,
      ],
    };
  }
  if (bullish > bearish) {
    return { direction: "bullish", magnitude: bullish / total, caveats: [] };
  }
  if (bearish > bullish) {
    return { direction: "bearish", magnitude: bearish / total, caveats: [] };
  }
  return { direction: "neutral", magnitude: neutral / total, caveats: [] };
}

export const macroFlorida: PackDefinition = {
  id: "macro-florida",
  brain_id: "macro-florida",
  domain: "macro",
  scope:
    "Florida state-level macro context — labor market (FLUR, FL LFPR). Mid-tier of the three-tier macro denominator chain (macro-us → macro-florida → macro-swfl). Future branches: CBP, IRS SOI.",
  ttl_seconds: 86400,
  sources: [macroFloridaSource, makeBrainInputSource("macro-us")],
  input_brains: [{ id: "macro-us", edge_type: "input" }],
  fitScore: (): number => 8,
  compositeCutoff: 0,
  skipSynthesisAgent: true,
  corpusSummary: macroFloridaCorpusSummary,
  outputProducer: macroFloridaOutputProducer,
  preferences: [
    "The user is a Florida-market operator who reads state labor indicators as the denominator against which regional (SWFL, Tampa, Jax) actuals are compared.",
    "The user treats Florida unemployment as the headline labor-tightness read for any in-state opportunity sizing.",
    "The user pairs the FL macro snapshot with the national chain (macro-us) for cross-tier context and never bypasses the macro chain to read raw FRED.",
  ],
  activeProject:
    "macro-florida: standing FL state-level macro snapshot — the denominator brain for SWFL/Tampa/Jax gap math.",
  prompts: {
    triageContext:
      "These fragments are Florida state-level FRED indicators (FLUR, LBSSA12). They are all decision-relevant by construction; the pack is pure deterministic aggregation.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). Every fact is produced deterministically by macroFloridaCorpusSummary and the BrainOutput is built by macroFloridaOutputProducer.",
  },
};
