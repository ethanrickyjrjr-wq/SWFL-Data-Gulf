import type { PackDefinition, PackOutput } from "../types/pack.mts";
import type { RawFragment } from "../types/fragment.mts";
import type { SynthesisFact } from "../types/event.mts";
import type {
  BrainOutput,
  BrainOutputMetric,
  BrainOutputMetricSource,
  BrainOutputProducerResult,
} from "../types/brain-output.mts";
import {
  fdotFreightSegmentsSource,
  AVG_PAYLOAD_TONS_PER_TRUCK,
  BASELINE_COEFFICIENT_OF_VARIATION,
  LATEST_FDOT_YEAR,
  type FreightSegmentNormalized,
  type ShockLogRow,
} from "../sources/fdot-freight-source.mts";
import {
  makeBrainInputSource,
  type BrainInputNormalized,
} from "../sources/brain-input-source.mts";
import { env } from "../config/env.mts";

/**
 * logistics-swfl-nowcast — daily freight-flow deviation read against
 * the FAF5 annual baseline. THIRTEENTH PACK in the brain factory.
 *
 * Thin pipe (v1.1 non-negotiable #1): this brain reads logistics-swfl's
 * `--- OUTPUT ---` block (one fact: inbound_freight_tons_swfl × 1000 anchors
 * the baseline_mu) and a fresh deterministic read off the FDOT freight-coded
 * segments. It never reaches into logistics-swfl's branches.
 *
 * Math (v1.1 non-negotiable #2 — deterministic, never LLM):
 *   current_tons   = Σ tons_per_segment_per_year (from fdot-freight-source)
 *   baseline_mu    = logistics-swfl.OUTPUT.key_metrics
 *                     .find(inbound_freight_tons_swfl).value × 1000
 *   baseline_sigma = baseline_mu × COEFFICIENT_OF_VARIATION (0.10, FHWA FAF5 §3.2)
 *   deviation_z    = (current_tons - baseline_mu) / baseline_sigma
 *
 * shock_state state machine (locked):
 *   |z| <= 3                                  → "normal"
 *   |z| > 3 for >= 3 consecutive days         → "anomaly"
 *   |z| > 3 for >= 30 consecutive days        → "structural_break"
 *   |z| > 3 for >= 90 consecutive days        → baseline_validity_flag
 *                                               flips to "stale-structural" (sticky)
 *
 * Stale-upstream cascade (CLAUDE.md non-negotiable #5): handled by Stage 4's
 * Lane 2E machinery — this pack does NOT need to detect or surface the
 * upstream-stale caveat itself. When logistics-swfl is stale at build time,
 * `harvestUpstreams()` appends the verbatim caveat and caps this brain's
 * confidence at min(self, upstream.confidence).
 */

// ---------------------------------------------------------------------
// Constants & thresholds (locked from blueprint §5).
// ---------------------------------------------------------------------

const BASELINE_UPSTREAM_ID = "logistics-swfl";
const BASELINE_METRIC = "inbound_freight_tons_swfl";

// inbound_freight_tons_swfl is published in THOUSAND tons; the conversion
// multiplier brings it onto the same unit basis as the FDOT-derived tonnage
// the connector produces.
const THOUSAND_TONS_TO_TONS = 1000;

const Z_BREACH_THRESHOLD = 3;
const ANOMALY_CONSECUTIVE_DAYS = 3;
const STRUCTURAL_BREAK_CONSECUTIVE_DAYS = 30;
const STALE_STRUCTURAL_CONSECUTIVE_DAYS = 90;

export type ShockState = "normal" | "anomaly" | "structural_break";
export type BaselineValidityFlag = "valid" | "stale-structural";

// ---------------------------------------------------------------------
// Per-pipeline-run state — populated by corpusSummary, read by producer.
// (Same pattern as macro-swfl / master / cre-swfl.)
// ---------------------------------------------------------------------

interface NowcastSnapshot {
  segments: FreightSegmentNormalized[];
  priorShockLog: ShockLogRow[];
  baselineOutput: BrainOutput | null;
  fetched_at: string;
}

let lastSnapshot: NowcastSnapshot | null = null;

// ---------------------------------------------------------------------
// Pure helpers (unit-tested).
// ---------------------------------------------------------------------

function segmentsFrom(fragments: RawFragment[]): FreightSegmentNormalized[] {
  return fragments
    .map((f) => f.normalized as unknown as FreightSegmentNormalized)
    .filter((n) => n?.kind === "fdot-freight-segment");
}

function shockLogFrom(fragments: RawFragment[]): ShockLogRow[] {
  return fragments
    .map((f) => f.normalized as unknown as ShockLogRow)
    .filter((n) => n?.kind === "fdot-freight-shock-log")
    .sort((a, b) => Date.parse(a.refined_at) - Date.parse(b.refined_at));
}

function baselineOutputFrom(fragments: RawFragment[]): BrainOutput | null {
  for (const f of fragments) {
    const n = f.normalized as unknown as BrainInputNormalized;
    if (n?.kind === "brain-input" && n.upstream_id === BASELINE_UPSTREAM_ID) {
      return n.output;
    }
  }
  return null;
}

/**
 * Compute the next consecutive_breach_days count given prior log + current z.
 * Pure function — exported for unit testing the state machine in isolation.
 *
 * Rule (locked):
 *   - Current run breaches if |z| > Z_BREACH_THRESHOLD.
 *   - If current run does NOT breach → counter resets to 0.
 *   - If current run breaches but the most recent prior log entry had z of
 *     OPPOSITE sign (or did not breach) → counter resets to 1 (this is the
 *     first day of a new streak).
 *   - Otherwise counter = (count of consecutive prior breaches with matching
 *     z sign, walking backwards from the most recent log entry) + 1.
 */
export function nextConsecutiveBreachDays(
  currentZ: number,
  priorLog: readonly ShockLogRow[],
): number {
  if (!Number.isFinite(currentZ)) return 0;
  if (Math.abs(currentZ) <= Z_BREACH_THRESHOLD) return 0;
  const currentSign = Math.sign(currentZ);
  // Walk priorLog backwards (most-recent-first). Each prior breach with
  // matching sign adds 1 to the streak. A break (no breach, sign flip, or
  // missing z) stops the count.
  let count = 1; // current run is day 1 by default
  for (let i = priorLog.length - 1; i >= 0; i--) {
    const entry = priorLog[i];
    if (entry.deviation_z == null) break;
    if (Math.abs(entry.deviation_z) <= Z_BREACH_THRESHOLD) break;
    if (Math.sign(entry.deviation_z) !== currentSign) break;
    count += 1;
  }
  return count;
}

/** Classify shock_state from a consecutive_breach_days count. Pure. */
export function classifyShockState(consecutiveBreachDays: number): ShockState {
  if (consecutiveBreachDays >= STRUCTURAL_BREAK_CONSECUTIVE_DAYS) {
    return "structural_break";
  }
  if (consecutiveBreachDays >= ANOMALY_CONSECUTIVE_DAYS) {
    return "anomaly";
  }
  return "normal";
}

/**
 * Decide baseline_validity_flag. Once a prior run flipped to "stale-structural"
 * the flag stays sticky for the duration of the chain — the log is the source
 * of truth, not in-memory state. A current 90-day streak ALSO flips the flag
 * even if no prior log entry was stale (first-time flip).
 */
export function decideBaselineValidityFlag(
  consecutiveBreachDays: number,
  priorLog: readonly ShockLogRow[],
): BaselineValidityFlag {
  if (consecutiveBreachDays >= STALE_STRUCTURAL_CONSECUTIVE_DAYS) {
    return "stale-structural";
  }
  for (const entry of priorLog) {
    if (entry.baseline_validity_flag === "stale-structural") {
      return "stale-structural";
    }
  }
  return "valid";
}

// ---------------------------------------------------------------------
// corpusSummary — pure deterministic, sets snapshot for the producer.
// ---------------------------------------------------------------------

function logisticsNowcastCorpusSummary(
  allFragments: RawFragment[],
): SynthesisFact[] {
  const segments = segmentsFrom(allFragments);
  const priorShockLog = shockLogFrom(allFragments);
  const baselineOutput = baselineOutputFrom(allFragments);
  const fetched_at =
    allFragments[0]?.fetched_at ??
    new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  lastSnapshot = { segments, priorShockLog, baselineOutput, fetched_at };

  const facts: SynthesisFact[] = [];
  const currentTons = segments.reduce((s, seg) => s + seg.tons_per_year, 0);
  facts.push({
    topic: "corpus_overview",
    fact: "FDOT freight-coded corpus — Lee + Collier interstates + US routes",
    value:
      `${segments.length} freight-coded FDOT segments (I-* + US-*) for Lee + Collier in year ${LATEST_FDOT_YEAR}. ` +
      `Connector pre-computed per-segment annualized tonnage; corpus total: ${Math.round(currentTons).toLocaleString("en-US")} tons/year. ` +
      `Prior shock-log entries available: ${priorShockLog.length}. Upstream baseline (logistics-swfl) available: ${baselineOutput ? "yes" : "no"}.`,
    source_fragment_ids: [],
  });

  if (baselineOutput) {
    const baselineMetric = baselineOutput.key_metrics.find(
      (m) => m.metric === BASELINE_METRIC,
    );
    if (baselineMetric) {
      facts.push({
        topic: "baseline_anchor",
        fact: "Upstream logistics-swfl baseline anchor",
        value:
          `logistics-swfl (confidence ${baselineOutput.confidence.toFixed(2)}, refined ${baselineOutput.refined_at.slice(0, 10)}) ` +
          `reports ${BASELINE_METRIC} = ${baselineMetric.value} thousand tons/year. Anchoring baseline_mu = ${(Number(baselineMetric.value) * THOUSAND_TONS_TO_TONS).toLocaleString("en-US")} tons/year.`,
        source_fragment_ids: [],
      });
    }
  }
  return facts;
}

// ---------------------------------------------------------------------
// outputProducer — does all the math + builds key_metrics + caveats.
// ---------------------------------------------------------------------

function buildFdotSource(
  fetched_at: string,
  segmentCount: number,
): BrainOutputMetricSource {
  const url =
    env.source === "live" && env.supabaseUrl
      ? `${env.supabaseUrl}/rest/v1/fdot_aadt_fl?select=year_,county,roadway,desc_frm,desc_to,aadt,tfctr,shape_length&county=in.(LEE,COLLIER)&year_=eq.${LATEST_FDOT_YEAR}`
      : "fixture://refinery/__fixtures__/logistics-swfl-nowcast.sample.json";
  return {
    url,
    fetched_at,
    tier: 2,
    citation:
      `FDOT AADT freight-coded segments (data_lake.fdot_aadt_fl filtered to I-* + US-* roadways, Lee + Collier, year ${LATEST_FDOT_YEAR}) — ` +
      `${segmentCount} segments contributed to the annualized current-flow tonnage proxy.`,
  };
}

function buildBrainInputSource(
  upstream: BrainOutput,
  fetched_at: string,
): BrainOutputMetricSource {
  return {
    url: `https://brain-platform-amber.vercel.app/api/b/${BASELINE_UPSTREAM_ID}`,
    fetched_at,
    tier: upstream.trust_tier,
    citation:
      `Upstream brain ${BASELINE_UPSTREAM_ID} (confidence ${upstream.confidence.toFixed(2)}, ` +
      `refined ${upstream.refined_at.slice(0, 10)}) — anchors baseline_mu via ${BASELINE_METRIC} × 1000.`,
  };
}

function emptyProducerResult(reason: string): BrainOutputProducerResult {
  return {
    conclusion: `logistics-swfl-nowcast could not compute a freight deviation read: ${reason}`,
    key_metrics: [],
    caveats: [
      reason,
      "Run `npm run refinery logistics-swfl` first if the baseline is missing; check the FDOT freight connector if segments are missing.",
    ],
    direction: "neutral",
    magnitude: 0,
    drivers: [],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

function logisticsNowcastOutputProducer(
  _out: PackOutput,
): BrainOutputProducerResult {
  const snap = lastSnapshot;
  if (!snap) {
    return emptyProducerResult("no fragments received");
  }
  const { segments, priorShockLog, baselineOutput, fetched_at } = snap;

  if (!baselineOutput) {
    return emptyProducerResult(
      `upstream baseline brain '${BASELINE_UPSTREAM_ID}' was unavailable — cannot anchor baseline_mu`,
    );
  }
  if (segments.length === 0) {
    return emptyProducerResult(
      "FDOT freight connector returned no segments — cannot compute current_tons",
    );
  }
  const baselineMetric = baselineOutput.key_metrics.find(
    (m) => m.metric === BASELINE_METRIC,
  );
  if (!baselineMetric || typeof baselineMetric.value !== "number") {
    return emptyProducerResult(
      `upstream baseline brain '${BASELINE_UPSTREAM_ID}' did not expose the '${BASELINE_METRIC}' metric as a number`,
    );
  }

  // ----- Deterministic math -----
  const currentTons = segments.reduce((s, seg) => s + seg.tons_per_year, 0);
  const baselineMu = baselineMetric.value * THOUSAND_TONS_TO_TONS;
  const baselineSigma = baselineMu * BASELINE_COEFFICIENT_OF_VARIATION;
  const deviationZ =
    baselineSigma === 0 ? 0 : (currentTons - baselineMu) / baselineSigma;
  const deviationPct =
    baselineMu === 0 ? 0 : ((currentTons - baselineMu) / baselineMu) * 100;

  // ----- State-machine reads -----
  const consecutiveBreachDays = nextConsecutiveBreachDays(
    deviationZ,
    priorShockLog,
  );
  const shockState = classifyShockState(consecutiveBreachDays);
  const baselineValidityFlag = decideBaselineValidityFlag(
    consecutiveBreachDays,
    priorShockLog,
  );

  const fdotSourceMeta = buildFdotSource(fetched_at, segments.length);
  const baselineSourceMeta = buildBrainInputSource(baselineOutput, fetched_at);

  const key_metrics: BrainOutputMetric[] = [
    {
      metric: "baseline_flow_tons_year",
      value: Math.round(baselineMu),
      direction: "stable",
      label: `FAF5-anchored baseline freight tonnage (annualized, year ${LATEST_FDOT_YEAR})`,
      variable_type: "extensive",
      units: "tons/year",
      display_format: "count",
      source: baselineSourceMeta,
    },
    {
      metric: "current_flow_tons_year",
      value: Math.round(currentTons),
      direction: currentTons >= baselineMu ? "rising" : "falling",
      label: `Current-state freight tonnage proxy from FDOT AADT × tfctr × payload × shape_length (annualized)`,
      variable_type: "extensive",
      units: "tons/year",
      display_format: "count",
      source: fdotSourceMeta,
    },
    {
      metric: "deviation_z",
      value: Math.round(deviationZ * 100) / 100,
      direction:
        deviationZ > 0.5 ? "rising" : deviationZ < -0.5 ? "falling" : "stable",
      label: "Deviation z-score: (current_tons − baseline_mu) / baseline_sigma",
      variable_type: "intensive",
      units: "z-score",
      display_format: "ratio",
      source: fdotSourceMeta,
    },
    {
      metric: "deviation_pct",
      value: Math.round(deviationPct * 10) / 10,
      direction:
        deviationPct > 1 ? "rising" : deviationPct < -1 ? "falling" : "stable",
      label: "Deviation as percent of baseline_mu",
      variable_type: "intensive",
      units: "percent",
      display_format: "percent",
      source: fdotSourceMeta,
    },
    {
      metric: "shock_state",
      value: shockState,
      direction: "stable",
      label: "Shock-state classifier (normal | anomaly | structural_break)",
      variable_type: "categorical",
      source: fdotSourceMeta,
    },
    {
      metric: "baseline_validity_flag",
      value: baselineValidityFlag,
      direction: "stable",
      label:
        "Baseline-validity flag (valid | stale-structural, sticky once stale)",
      variable_type: "categorical",
      source: fdotSourceMeta,
    },
    {
      metric: "consecutive_breach_days",
      value: consecutiveBreachDays,
      direction:
        consecutiveBreachDays > 0
          ? deviationZ > 0
            ? "rising"
            : "falling"
          : "stable",
      label:
        "Consecutive prior refines (incl. this one) where |z| > 3 with matching sign",
      variable_type: "extensive",
      units: "days",
      display_format: "count",
      source: fdotSourceMeta,
    },
    {
      metric: "freight_segment_count",
      value: segments.length,
      direction: "stable",
      label: "Freight-coded FDOT segments contributing to current_flow",
      variable_type: "extensive",
      units: "segments",
      display_format: "count",
      source: fdotSourceMeta,
    },
    {
      metric: "avg_payload_tons_per_truck",
      value: AVG_PAYLOAD_TONS_PER_TRUCK,
      direction: "stable",
      label:
        "Assumed combination-truck average payload — FHWA Highway Statistics 2023, Table VM-1",
      variable_type: "intensive",
      units: "tons/truck",
      display_format: "raw",
      source: {
        url: "https://www.fhwa.dot.gov/policyinformation/statistics/2023/vm1.cfm",
        fetched_at,
        tier: 1,
        citation:
          "FHWA Highway Statistics 2023, Table VM-1 — combination-truck average payload assumption (16.0 tons).",
      },
    },
  ];

  // ----- Conclusion (deterministic narrative) -----
  const conclusionParts: string[] = [];
  conclusionParts.push(
    `Current freight flow (annualized from ${segments.length} freight-coded FDOT segments) is ${Math.round(currentTons).toLocaleString("en-US")} tons/year ` +
      `against a ${Math.round(baselineMu).toLocaleString("en-US")} tons/year FAF5-anchored baseline — deviation z = ${(Math.round(deviationZ * 100) / 100).toFixed(2)} (${(Math.round(deviationPct * 10) / 10).toFixed(1)}%).`,
  );
  conclusionParts.push(
    `Shock-state: ${shockState}. Baseline-validity flag: ${baselineValidityFlag}. Consecutive breach days: ${consecutiveBreachDays}.`,
  );
  if (shockState === "anomaly") {
    conclusionParts.push(
      "Anomaly state means |z| has stayed > 3 with matching sign for at least 3 consecutive refines — short-window deviation worth investigating.",
    );
  } else if (shockState === "structural_break") {
    conclusionParts.push(
      "Structural-break state means |z| has stayed > 3 with matching sign for at least 30 consecutive refines — the baseline and the live signal have diverged at multi-month timescales.",
    );
  }

  // ----- Caveats -----
  const caveats: string[] = [
    `Daily-cadence shock detection uses a synthetic per-day denominator (annual tons_per_year ÷ 365) because Tier 2 carries only annual FDOT AADT. 30d / 90d escalation thresholds will rarely fire from current Tier 2 data alone — true daily AADT-equivalent (FDOT continuous-count stations) is reserved for v2 ingest.`,
    `Conversion math: tons_per_segment_per_year = AADT × tfctr × ${AVG_PAYLOAD_TONS_PER_TRUCK} × 365 × (shape_length_m / 1609.344). The 16.0 tons/truck payload is FHWA HS 2023 Table VM-1 (combination trucks); commodity-mix shifts (heavy gravel vs light electronics) are not modeled in v1.`,
    `Baseline_sigma derived as baseline_mu × ${BASELINE_COEFFICIENT_OF_VARIATION} (FHWA FAF5 §3.2 freight-flow uncertainty bands at ~±10%).`,
    `Scheduled FDOT construction closures look mathematically identical to genuine slowdowns; v1 has no calendar-aware filter to separate the two.`,
  ];
  if (baselineValidityFlag === "stale-structural") {
    caveats.unshift(
      `Baseline validity flag flipped to stale-structural at ${new Date().toISOString().slice(0, 10)}: |z|>3 sustained for 90+ consecutive days against the logistics-swfl FAF5 baseline. The FAF5 baseline should be considered structurally divergent from observed freight flow — request a baseline-refresh before consuming downstream.`,
    );
  }
  if (env.source === "fixture") {
    caveats.unshift(
      "FDOT freight segments and shock-log entries in this build are synthetic fixture data — unset REFINERY_SOURCE or set it to `live` to query data_lake.fdot_aadt_fl + data_lake.fdot_freight_nowcast_shock_log.",
    );
  }

  // ----- Direction / magnitude (deterministic) -----
  // Convention: a negative deviation (current < baseline) reads bearish for
  // freight throughput; a positive deviation reads bullish. shock_state ramps
  // magnitude — anomaly is half a signal, structural_break is full.
  let direction: BrainOutputProducerResult["direction"] = "neutral";
  if (deviationZ <= -Z_BREACH_THRESHOLD) direction = "bearish";
  else if (deviationZ >= Z_BREACH_THRESHOLD) direction = "bullish";

  let magnitude = Math.min(1, Math.abs(deviationZ) / 6);
  if (shockState === "anomaly") magnitude = Math.max(magnitude, 0.6);
  if (shockState === "structural_break") magnitude = Math.max(magnitude, 0.8);
  if (baselineValidityFlag === "stale-structural") {
    // Once the baseline is stale-structural we are LESS confident in the
    // deviation read (we are comparing live signal against a baseline we
    // ourselves flagged as wrong). Dampen.
    magnitude = Math.min(magnitude, 0.3);
  }

  return {
    conclusion: conclusionParts.join(" "),
    key_metrics,
    caveats,
    direction,
    magnitude,
    drivers: [BASELINE_UPSTREAM_ID],
    overrides: [],
    contradicts: [],
    exogenous_signals: [],
  };
}

// ---------------------------------------------------------------------
// PackDefinition export.
// ---------------------------------------------------------------------

const logisticsNowcastPreferences = [
  "The user reads the nowcast as a fast deviation gauge — annual FAF5 is the audited baseline; AADT-derived tonnage is the live deviator.",
  "The user understands shock_state is a deterministic z-score classifier, not an LLM judgment.",
  "The user knows baseline_validity_flag flips sticky once a 90-day structural break is detected — at which point the FAF5 baseline itself should be re-examined.",
];

export const logisticsSwflNowcast: PackDefinition = {
  id: "logistics-swfl-nowcast",
  brain_id: "logistics-swfl-nowcast",
  domain: "logistics",
  scope:
    "Current-state freight-flow nowcast for SWFL — derives a daily freight-tons proxy from FDOT AADT × tfctr × payload, compares against logistics-swfl's FAF5 annual baseline, and classifies shock_state + baseline_validity_flag.",
  ttl_seconds: 86400, // 24h — FDOT refreshes nightly in production
  sources: [
    fdotFreightSegmentsSource,
    makeBrainInputSource(BASELINE_UPSTREAM_ID),
  ],
  input_brains: [{ id: BASELINE_UPSTREAM_ID, edge_type: "input" }],
  fitScore: () => 8,
  compositeCutoff: 0,
  skipTriageAgent: true,
  skipSynthesisAgent: true,
  corpusSummary: logisticsNowcastCorpusSummary,
  outputProducer: logisticsNowcastOutputProducer,
  synthesisStrategy: "deterministic",
  preferences: logisticsNowcastPreferences,
  activeProject:
    "logistics-swfl-nowcast: daily freight-flow deviation read against the FAF5 baseline.",
  prompts: {
    triageContext:
      "Fragments are (a) one BrainInput OUTPUT from logistics-swfl, (b) per-segment freight-tons readings derived from FDOT AADT × tfctr × payload, and (c) prior shock-log rows that drive the consecutive-day breach counter.",
    synthesisContext:
      "Pure deterministic — outputProducer computes current_tons, deviation_z, the shock_state state machine, and the baseline_validity_flag from prior log entries. No LLM in the output path.",
  },
};
