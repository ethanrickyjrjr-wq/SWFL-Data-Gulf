/**
 * Metric-observations logger — prediction grading loop (Goal 9, Phase 1, step 1c).
 *
 * One row per NUMERIC key_metric, per brain, per refine, snapshotted to Supabase
 * `metric_observations`. Unlike `predictions-log` (master-only), this fires for
 * EVERY pack: the deterministic grader reads window-end values from here, and a
 * slug must stay observable even if master's curated key_metrics later drop it.
 *
 * Two invariants the grader depends on:
 *   • `observed_at` is the brain's DATA VINTAGE (`refined_at`), never wall-clock.
 *   • the (slug, brain_id, observed_at) unique index makes re-runs idempotent —
 *     we upsert with ignoreDuplicates (ON CONFLICT DO NOTHING). Master's
 *     re-surfaced copy of a leaf slug coexists with the leaf's own row; the
 *     grader resolves the owning leaf at read time.
 *
 * Silent no-op when Supabase env is unset (local `.md` is the artifact — same
 * pattern as `predictions-log`). Categorical/string metrics are skipped: they
 * are non-numeric and therefore ungradeable.
 */

import { createClient } from "@supabase/supabase-js";
import type { BrainOutput } from "../types/brain-output.mts";

export interface MetricObservationRow {
  slug: string;
  brain_id: string;
  value: number;
  /** Data vintage — the brain's refined_at, NOT wall-clock. */
  observed_at: string;
  source_url: string | null;
}

/**
 * Build the numeric metric-observation rows for a brain output. Pure function —
 * exposed for tests. Skips any key_metric whose value is non-numeric
 * (categorical labels) or non-finite.
 */
export function buildMetricObservationRows(
  brainOutput: BrainOutput,
): MetricObservationRow[] {
  const rows: MetricObservationRow[] = [];
  for (const m of brainOutput.key_metrics) {
    if (typeof m.value !== "number" || !Number.isFinite(m.value)) continue;
    rows.push({
      slug: m.metric,
      brain_id: brainOutput.brain_id,
      value: m.value,
      observed_at: brainOutput.refined_at,
      source_url: m.source?.url ?? null,
    });
  }
  return rows;
}

export type MetricObservationLogResult =
  | { kind: "skipped"; reason: "no-supabase-env" | "no-numeric-metrics" }
  | { kind: "inserted"; count: number }
  | { kind: "error"; message: string };

export interface LogMetricObservationsOpts {
  brainOutput: BrainOutput;
  /** Optional injection points for tests. */
  supabaseUrl?: string;
  supabaseKey?: string;
}

/**
 * Snapshot a brain's numeric key_metrics to `metric_observations`. Errors are
 * returned as `kind: "error"` rather than thrown — a refine that wrote its `.md`
 * must not be retroactively aborted by a telemetry insert failure.
 */
export async function logMetricObservations(
  opts: LogMetricObservationsOpts,
): Promise<MetricObservationLogResult> {
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
  const rows = buildMetricObservationRows(opts.brainOutput);
  if (rows.length === 0) {
    return { kind: "skipped", reason: "no-numeric-metrics" };
  }
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await sb.from("metric_observations").upsert(rows, {
    onConflict: "slug,brain_id,observed_at",
    ignoreDuplicates: true,
  });
  if (error) {
    return { kind: "error", message: error.message };
  }
  return { kind: "inserted", count: rows.length };
}
