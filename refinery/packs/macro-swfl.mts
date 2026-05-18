import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutput,
  BrainOutputProducerResult,
} from "../types/brain-output.mts";
import {
  makeBrainInputSource,
  type BrainInputNormalized,
} from "../sources/brain-input-source.mts";

/**
 * macro-swfl — regional macro context for the Southwest Florida market.
 *
 * Leaf tier of the three-tier macro denominator chain:
 *   macro-us → macro-florida → macro-swfl.
 *
 * Post-restructure (2026-05-17), macro-swfl is a PURE DELTA BRAIN. It has no
 * own sources — its only upstream is macro-florida, consumed via
 * BrainInputSource. SWFL-specific actuals will land later (county-level BLS
 * LAUS for Lee + Collier, payroll counts, etc.); until then this brain
 * intentionally emits no key_metrics and surfaces a clear caveat that the FL
 * state baseline is the best available proxy.
 *
 * Why this exists right now:
 *  - Reserves the brain id so the DAG slot is fixed (future county data
 *    drops in atomically without renaming consumers).
 *  - Carries macro-florida's freshness + confidence forward through the chain
 *    so any future regional brain that consumes macro-swfl gets accurate
 *    decay even before SWFL-specific data lands.
 *  - Documents the "no SWFL-specific data yet" state honestly inside the
 *    consumption-contract receipt rather than leaving it as missing data.
 *
 * Pure deterministic — no synthesis agent.
 */

let lastMacroFloridaOutput: BrainOutput | null = null;

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

function macroSwflCorpusSummary(allFragments: RawFragment[]): SynthesisFact[] {
  const macroFl = brainInputFrom(allFragments, "macro-florida");
  lastMacroFloridaOutput = macroFl;

  if (!macroFl) return [];

  const facts: SynthesisFact[] = [];

  const flMetricsLine = macroFl.key_metrics
    .map((m) => `${m.label} ${fmt(Number(m.value))}% (${m.direction})`)
    .join("; ");
  facts.push({
    topic: "macro_swfl_baseline",
    fact: "SWFL regional macro context — Florida state baseline used as proxy",
    value:
      `macro-swfl currently has no SWFL-specific sources of its own — county-level BLS LAUS ` +
      `for Lee + Collier and other regional indicators are planned but not yet ingested. ` +
      `The Florida state baseline (macro-florida, confidence ${macroFl.confidence.toFixed(2)}) ` +
      `is the best available proxy: ${flMetricsLine}.`,
    source_fragment_ids: [],
  });

  return facts;
}

function macroSwflOutputProducer(_out: PackOutput): BrainOutputProducerResult {
  const macroFl = lastMacroFloridaOutput;

  if (!macroFl) {
    return {
      conclusion:
        "macro-swfl could not resolve its upstream macro-florida brain — no SWFL macro context available.",
      key_metrics: [],
      caveats: [
        "Upstream macro-florida brain was unavailable. Run `npm run refinery macro-florida` first.",
      ],
      direction: "neutral",
      magnitude: 0,
      drivers: [],
      overrides: [],
      contradicts: [],
      exogenous_signals: [],
    };
  }

  const flSummary = macroFl.key_metrics
    .map((m) => `${m.label} ${fmt(Number(m.value))}% (${m.direction})`)
    .join(", ");

  const conclusion =
    `macro-swfl is a regional delta brain. It currently emits no SWFL-specific metrics — ` +
    `county-level BLS LAUS (Lee + Collier) and other hyperlocal series are the planned sources ` +
    `and have not yet been ingested. The Florida state baseline reads: ${flSummary} ` +
    `(via macro-florida, confidence ${macroFl.confidence.toFixed(2)}). ` +
    `Downstream consumers needing macro context today should declare macro-florida or macro-us as direct upstreams ` +
    `rather than routing through macro-swfl, until SWFL-specific data lands.`;

  return {
    conclusion,
    // Empty by design — see the brain header docstring. macro-swfl's value
    // today is in the chain position + freshness propagation, not in unique
    // metrics. When county-level LAUS lands, real SWFL metrics replace this.
    key_metrics: [],
    caveats: [
      "macro-swfl emits no SWFL-specific metrics today — the brain is a chain-position placeholder until county-level BLS LAUS for Lee + Collier is ingested. Downstream brains should declare macro-florida or macro-us as direct upstreams for macro context in the interim.",
    ],
    // Pass through the FL state direction as the best available regional read.
    direction: macroFl.direction,
    magnitude: macroFl.magnitude,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

export const macroSwfl: PackDefinition = {
  id: "macro-swfl",
  brain_id: "macro-swfl",
  domain: "macro",
  scope:
    "Regional macro context for Southwest Florida — leaf tier of the three-tier macro chain (macro-us → macro-florida → macro-swfl). Currently a pure delta brain pending county-level BLS LAUS ingest.",
  ttl_seconds: 86400,
  sources: [makeBrainInputSource("macro-florida")],
  input_brains: [{ id: "macro-florida", edge_type: "input" }],
  fitScore: (): number => 8,
  compositeCutoff: 0,
  skipSynthesisAgent: true,
  corpusSummary: macroSwflCorpusSummary,
  outputProducer: macroSwflOutputProducer,
  preferences: [
    "The user is an SWFL operator who reads regional macro context against the FL state baseline.",
    "The user treats county-level BLS LAUS for Lee + Collier as the planned-but-not-yet-ingested source for true SWFL macro metrics.",
    "The user knows macro-swfl is intentionally a chain-position placeholder until county-level data lands and routes around it (consuming macro-florida or macro-us directly) when macro metrics are needed today.",
  ],
  activeProject:
    "macro-swfl: chain-position placeholder for SWFL regional macro until county-level BLS LAUS lands.",
  prompts: {
    triageContext:
      "These fragments are upstream brain OUTPUTs (macro-florida). The pack is pure deterministic aggregation with no synthesis agent.",
    synthesisContext:
      "This pack runs no synthesis agent (skipSynthesisAgent). The BrainOutput is built by macroSwflOutputProducer as a thin pass-through that emits no own metrics until county-level data lands.",
  },
};
