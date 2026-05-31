/**
 * Predictions logger — roadmap §6.1.4.
 *
 * One row per successful master refine, written to Supabase `predictions`.
 * The hook is silent-no-op when Supabase env isn't configured (matches the
 * locked v1.1 decision #11 pattern: local .md is the artifact; registry is
 * metadata). Non-master packs are also a no-op — the spec scopes logging to
 * master only because master is the synthesized customer-facing call.
 *
 * The companion `outcomes` table (FK prediction_id) stays empty until an
 * analyst observes reality. We do not predict the outcome here.
 */

import { createClient } from "@supabase/supabase-js";
import { resolveGradeConfig } from "../vocab/loader.mts";
import type { BrainOutput, ConditionalClaim } from "../types/brain-output.mts";

/** Pack id that triggers the log. Master is the only synthesizer today. */
const MASTER_PACK_ID = "master";

/** What we persist into predictions.metadata — everything the SGD job or
 *  backtest harness might want later that isn't a first-class column. */
export interface PredictionMetadata {
  direction: BrainOutput["direction"];
  magnitude: BrainOutput["magnitude"];
  trust_tier: BrainOutput["trust_tier"];
  upstream_count: BrainOutput["upstream_count"];
  contradicts: BrainOutput["contradicts"];
  relevance_half_life_hours: number;
  /** Top key_metrics — bounded to keep the JSONB row size honest. */
  top_key_metrics: BrainOutput["key_metrics"];
  version: BrainOutput["version"];
}

/**
 * Grade fields derived at capture time (Goal 9 Phase 1d), persisted to the
 * columns the 20260531_grading_loop migration added to `predictions`. Pure,
 * sync, no-LLM — reads only fields master already emits.
 */
export interface GradeFields {
  /** master.conditional_claims verbatim — `[]` when there are none. */
  conditional_claims: ConditionalClaim[];
  /** The claim's first numeric driver slug (the one graded against), or null. */
  gradeable_slug: string | null;
  /** That slug's value at refine time — pinned, immutable. */
  baseline_value: number | null;
  /** bullish|bearish only; neutral/mixed/absent → null → ungradeable. */
  predicted_direction: "bullish" | "bearish" | null;
  /** refined_at + window_days (UTC, YYYY-MM-DD); null unless gradeable. */
  window_end_date: string | null;
  grade_status: "gradeable" | "ungradeable";
  grade_method: "machine" | "operator";
}

export interface PredictionRow extends GradeFields {
  brain_id: string;
  refined_at: string;
  conclusion: string;
  confidence: number;
  /** Master's authored revisit horizon (BrainOutput.prediction_window), or null
   *  when the synthesizer emitted none (empty/neutral read). */
  prediction_window: string | null;
  metadata: PredictionMetadata;
}

/** How many key_metrics to embed in metadata. The full metric list is in the
 *  rendered .md; metadata is for fast scan during backtest, not full replay. */
const MAX_METRICS_IN_METADATA = 5;

/**
 * Add `days` to an ISO-Z timestamp in UTC and return the `YYYY-MM-DD` date.
 * MUST be UTC: `refined_at` is a `…Z` instant and `window_end_date` is a DATE.
 * A local-time helper (`setDate`/`getDate`) would shift the result by a day
 * across a DST boundary and differ between a non-UTC dev box and the UTC CI
 * runner — silently changing when the grader picks the row up.
 */
function addDaysUTC(isoZ: string, days: number): string {
  const d = new Date(isoZ);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Derive the gradeable structure `logPrediction` otherwise drops. No LLM.
 *
 * The dominant claim's FIRST numeric driver decides — we never substitute a
 * later (configured) basis_ref for an earlier (unconfigured) one. `basis_refs`
 * order encodes author intent (the primary driver is first); grading a
 * secondary driver and attributing it to the claim would corrupt the
 * calibration signal the flywheel exists to bank. A first numeric ref that is
 * unconfigured/unregistered is still recorded (slug + baseline anchor) but the
 * row is `ungradeable` — gradeability fills in later when a polarity block is
 * added, and the historical anchor is already pinned.
 */
export function deriveGradeFields(output: BrainOutput): GradeFields {
  const conditional_claims = output.conditional_claims ?? [];
  const claim = conditional_claims[0];

  const dir = claim?.then_direction;
  const predicted_direction =
    dir === "bullish" || dir === "bearish" ? dir : null;

  // slug -> numeric value, numeric key_metrics only (categorical/non-finite
  // dropped) — mirrors buildMetricObservationRows' coercion guard.
  const numericBySlug = new Map<string, number>();
  for (const m of output.key_metrics) {
    if (typeof m.value === "number" && Number.isFinite(m.value)) {
      numericBySlug.set(m.metric, m.value);
    }
  }

  // First basis_ref that is a numeric metric in THIS payload is the driver.
  // The same guard skips brain_id refs (they live in `drivers`, never in
  // key_metrics) and categorical metrics; the first survivor decides and stops.
  let gradeable_slug: string | null = null;
  let baseline_value: number | null = null;
  for (const ref of claim?.basis_refs ?? []) {
    if (!numericBySlug.has(ref)) continue;
    gradeable_slug = ref;
    baseline_value = numericBySlug.get(ref) ?? null;
    break;
  }

  const cfg = gradeable_slug ? resolveGradeConfig(gradeable_slug) : null;
  const isGradeable = Boolean(
    cfg?.gradeable && gradeable_slug && predicted_direction,
  );
  let window_end_date: string | null = null;
  if (isGradeable && cfg && cfg.window_days != null) {
    window_end_date = addDaysUTC(output.refined_at, cfg.window_days);
  }

  return {
    conditional_claims,
    gradeable_slug,
    baseline_value,
    predicted_direction,
    window_end_date,
    grade_status: isGradeable ? "gradeable" : "ungradeable",
    grade_method: isGradeable ? "machine" : "operator",
  };
}

/** Build the row Stage 4 would insert. Pure function — exposed for tests. */
export function buildPredictionRow(brainOutput: BrainOutput): PredictionRow {
  return {
    brain_id: brainOutput.brain_id,
    refined_at: brainOutput.refined_at,
    conclusion: brainOutput.conclusion,
    confidence: brainOutput.confidence,
    prediction_window: brainOutput.prediction_window ?? null,
    metadata: {
      direction: brainOutput.direction,
      magnitude: brainOutput.magnitude,
      trust_tier: brainOutput.trust_tier,
      upstream_count: brainOutput.upstream_count,
      contradicts: brainOutput.contradicts,
      relevance_half_life_hours: brainOutput.relevance.half_life_hours,
      top_key_metrics: brainOutput.key_metrics.slice(
        0,
        MAX_METRICS_IN_METADATA,
      ),
      version: brainOutput.version,
    },
    ...deriveGradeFields(brainOutput),
  };
}

export type LogResult =
  | { kind: "skipped"; reason: "not-master" | "no-supabase-env" }
  | { kind: "inserted"; row: PredictionRow }
  | { kind: "error"; message: string };

export interface LogPredictionOpts {
  packId: string;
  brainOutput: BrainOutput;
  /** Optional injection point for tests. */
  supabaseUrl?: string;
  supabaseKey?: string;
}

/**
 * Insert a master refine into `predictions`. Errors are surfaced as
 * `kind: "error"` rather than thrown — a refine that successfully wrote the
 * .md should not be retroactively aborted by a telemetry insert failure. The
 * caller decides whether to log/ignore/escalate.
 */
export async function logPrediction(
  opts: LogPredictionOpts,
): Promise<LogResult> {
  if (opts.packId !== MASTER_PACK_ID) {
    return { kind: "skipped", reason: "not-master" };
  }
  const url =
    opts.supabaseUrl ??
    process.env.SUPABASE_URL ??
    process.env.BRAINS_SUPABASE_URL;
  const key =
    opts.supabaseKey ??
    process.env.SUPABASE_SERVICE_KEY ??
    process.env.BRAINS_SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return { kind: "skipped", reason: "no-supabase-env" };
  }
  const row = buildPredictionRow(opts.brainOutput);
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.from("predictions").insert(row);
  if (error) {
    return { kind: "error", message: error.message };
  }
  return { kind: "inserted", row };
}
