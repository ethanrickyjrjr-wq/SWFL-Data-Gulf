// refinery/lib/resilient-build.mts
// Error CLASS only — no client is constructed here, so this stays off the paid
// surface (Gate 6 keys on `new Anthropic(` / ANTHROPIC_API_KEY, not on an import).
import { APIConnectionError } from "@anthropic-ai/sdk";
import type { PackDefinition } from "../types/pack.mts";
import type { BrainOutput } from "../types/brain-output.mts";
import type { OutputResult } from "../stages/4-output.mts";
import type { BrainOutputRead } from "./brain-output-reader.mts";
import { readBrainOutput } from "./brain-output-reader.mts";

// ── Eligibility constants (sourced 2026-06-01, verified against real TTLs) ──
// Formula: eligible iff age_days ≤ min(MAX, max(FLOOR, MULT × ttl_days))
export const LAST_GOOD_MIN_WINDOW_DAYS = 2; // floor: every brain gets ≥2 nights
export const LAST_GOOD_ELIGIBILITY_MULT = 1; // one full TTL cycle
export const LAST_GOOD_ABSOLUTE_MAX_DAYS = 14; // ceiling: 30-day env-swfl would otherwise serve 30-day-stale flood data

// ── Types ──────────────────────────────────────────────────────────────────

export interface BrainBuildOutcome {
  packId: string;
  status: "built" | "skipped-fresh" | "degraded" | "missing";
  /**
   * On a FAILURE outcome (`degraded` / `missing`), why the rebuild failed:
   *   - `"transient"`    — network/egress blip (socket/ECONNRESET/timeout/fetch).
   *                        Self-heals next run → quiet exit 2.
   *   - `"deterministic"` — a real defect that will NOT self-heal (orphan-concept,
   *                        spec-validator, type error, harvest throw, …). Must be
   *                        LOUD → `deriveExitCode` escalates it to exit 1.
   * Absent on `built` / `skipped-fresh` (not a failure). This is an ADDITIVE
   * field: the cross-repo ops consumer does an unchecked `as BuildReport` cast
   * and ignores unknown keys, so it lands without a coordinated ops deploy.
   */
  failureClass?: "deterministic" | "transient";
  reason?: string;
  /** ISO 8601 — present on `degraded` outcomes AND on `missing` outcomes where a
   *  prior build existed but its eligibility window has expired. ABSENT on
   *  never-built `missing` outcomes (the "not-yet-online" case). This distinction
   *  drives the HOLD decision: expired last-good → HOLD; never-built → no HOLD. */
  lastGoodRefinedAt?: string;
  version?: number;
  written: boolean;
  brainOutput?: BrainOutput;
  /** Reserved for issue #61 (volume guard / row-floor integration). Empty slot
   *  so that work plugs into this health model without a second type-lift. */
  dataIntegrity?: {
    rowsRead: number;
    rowsExpected?: number;
    sampled?: boolean;
  };
}

export interface BuildReport {
  target: string;
  timestamps: { started: string; finished: string };
  source: string;
  outcomes: BrainBuildOutcome[];
  exitCode: 0 | 1 | 2;
  masterDecision?: "published" | "held" | "skipped-fresh";
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/** Classify a build error as transient (retry eligible) or deterministic.
 *
 *  TYPE FIRST, then message. The Anthropic SDK's network failures are a real
 *  class, not a wording — matching only on substrings is what let the 07/13
 *  egress flake get stamped `deterministic` and HELD as a hard failure:
 *
 *    APIConnectionError        → message "Connection error."   (verified: SDK v0.106.0,
 *    APIConnectionTimeoutError → message "Request timed out."   node_modules/@anthropic-ai/
 *                                                               sdk/core/error.mjs:70-83)
 *
 *  NEITHER matched the old substring list ("socket closed" et al), so a network
 *  blip → failureClass=deterministic → classify-cron-failure's DETERMINISTIC_HOLD
 *  (rule 7) fired before its TRANSIENT rule (rule 10) and the run was held instead
 *  of self-healing. `APIConnectionTimeoutError extends APIConnectionError`, so the
 *  single `instanceof` below covers both.
 *
 *  Deliberately NOT transient: `RateLimitError` (429) and the 402 `billing_error`
 *  are plain `APIError`s, not `APIConnectionError`s — they stay deterministic/LOUD.
 *  Verified: `new RateLimitError(...) instanceof APIConnectionError === false`.
 *
 *  The substring arm is kept as a FALLBACK, not a replacement: the error can reach
 *  us flattened (re-thrown as a plain Error, or round-tripped through
 *  `_build-report.json`'s `reason` string), where the instance is long gone but the
 *  wording survives. Both arms, so neither hole reopens.
 */
export function isTransientError(err: unknown): boolean {
  // Structural: the real error class survives unwrapped from the SDK call through
  // runPipeline to buildOne (no re-wrapping layer in between).
  if (err instanceof APIConnectionError) return true;

  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("socket hang up") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("fetch failed") ||
    // Bun fetch: TCP connection dropped mid-response (external API or Supabase blip)
    msg.includes("socket connection was closed unexpectedly") ||
    msg.includes("socket closed") ||
    // Anthropic SDK wording, for the flattened/serialized case (see above).
    msg.includes("connection error") ||
    msg.includes("request timed out")
  );
}

/** Whether a prior brain read is within the eligibility window for use as a
 *  last-good degraded fallback. Uses pack.ttl_seconds as the reference TTL. */
export function isEligibleLastGood(pack: PackDefinition, refinedAt: string): boolean {
  const ttlDays = pack.ttl_seconds / 86400;
  const windowDays = Math.min(
    LAST_GOOD_ABSOLUTE_MAX_DAYS,
    Math.max(LAST_GOOD_MIN_WINDOW_DAYS, LAST_GOOD_ELIGIBILITY_MULT * ttlDays),
  );
  const ageDays = (Date.now() - Date.parse(refinedAt)) / 86400000;
  return ageDays <= windowDays;
}

/** Pure: classify a build failure given the existing last-good read.
 *  `failureClass` (computed by the caller from `isTransientError`) is carried
 *  onto the outcome so `deriveExitCode` can escalate deterministic failures to
 *  a loud exit 1 while transient ones stay a quiet exit 2.
 *  Exported for direct unit testing without file I/O. */
export function classifyFailure(
  pack: PackDefinition,
  err: unknown,
  read: BrainOutputRead,
  failureClass: "deterministic" | "transient",
): BrainBuildOutcome {
  const reason = err instanceof Error ? err.message : String(err);
  if (read.kind === "ok" && isEligibleLastGood(pack, read.output.refined_at)) {
    return {
      packId: pack.id,
      status: "degraded",
      failureClass,
      reason,
      lastGoodRefinedAt: read.output.refined_at,
      version: read.output.version,
      written: false,
    };
  }
  // `missing` with lastGoodRefinedAt → expired eligibility (HOLD trigger).
  // `missing` without it → never built ("not-yet-online", no HOLD).
  const lastGoodRefinedAt = read.kind === "ok" ? read.output.refined_at : undefined;
  return {
    packId: pack.id,
    status: "missing",
    failureClass,
    reason,
    lastGoodRefinedAt,
    written: false,
  };
}

/** Determine whether master should publish, be held, or was skipped fresh.
 *  A critical upstream is a HOLD trigger only when it has an expired last-good
 *  (lastGoodRefinedAt set on a `missing` outcome) — a brain that never built
 *  is "not-yet-online" and must NOT block master. */
export function computeMasterDecision(
  masterPack: PackDefinition,
  outcomes: BrainBuildOutcome[],
): "published" | "held" {
  const outcomeById = new Map(outcomes.map((o) => [o.packId, o]));
  for (const edge of masterPack.input_brains ?? []) {
    if (!edge.critical) continue;
    const outcome = outcomeById.get(edge.id);
    if (outcome && outcome.status === "missing" && outcome.lastGoodRefinedAt !== undefined) {
      return "held";
    }
  }
  return "published";
}

/** Pure: is master TTL-fresh-but-behind its inputs? True iff any upstream brain
 *  was refined STRICTLY AFTER master's last synthesis — master is carrying a
 *  stale snapshot of a leaf that has since moved (e.g. cre-swfl rebuilt to v47
 *  on 06-05 while master sat at v68/06-03). The CLI uses this to override a
 *  "skipped-fresh" master decision so the nightly re-synthesizes the moment a
 *  leaf updates, instead of waiting out master's own 7-day TTL. Equal timestamps
 *  are NOT stale (a same-run rebuild already yields a current master). An
 *  unparseable upstream timestamp is ignored (NaN comparison is false) so junk
 *  never forces a spurious rebuild. Exported for direct unit testing. */
export function masterIsStaleVsUpstreams(
  masterRefinedAt: string,
  upstreamRefinedAts: readonly string[],
): boolean {
  const masterMs = Date.parse(masterRefinedAt);
  return upstreamRefinedAts.some((ts) => Date.parse(ts) > masterMs);
}

/** Pure: is a LEAF brain behind its own ingest? True iff any of the leaf's ingest
 *  sources landed data STRICTLY AFTER the leaf's last synthesis. The leaf↔ingest
 *  twin of `masterIsStaleVsUpstreams` (which is brain↔brain): a leaf can sit
 *  within its own TTL yet already serve a stale snapshot because its Tier-1
 *  source ingested a fresher period — e.g. seller-stress-swfl's Redfin sources
 *  land ~monthly while the leaf's TTL is shorter, so the nightly skipped it as
 *  "fresh" and it served the Mar 2026 period for weeks after the 07/15 ingest.
 *  The CLI uses this to override a "skipped-fresh" leaf so the nightly rebuilds
 *  it the moment its data moves, instead of waiting out the TTL.
 *
 *  Compare against `leafRefinedAt` (the BUILD time), NEVER the served data
 *  period — a leaf whose period lags its build would otherwise re-fire this
 *  trigger every single night. A successful rebuild advances `refined_at` past
 *  the landing time, so the trigger clears and fires exactly once per landing.
 *  Equal timestamps are NOT stale (a same-run rebuild already yields a current
 *  leaf). An unparseable landing time is ignored (NaN comparison is false) so
 *  junk never forces a spurious rebuild. Exported for direct unit testing. */
export function leafIsStaleVsIngest(
  leafRefinedAt: string,
  sourceLandedAts: readonly string[],
): boolean {
  const refinedMs = Date.parse(leafRefinedAt);
  return sourceLandedAts.some((ts) => Date.parse(ts) > refinedMs);
}

/**
 * Pure: derive the process exit code from the full outcome set + master decision.
 *
 * Exit semantics:
 *   - 0 — clean: everything built or skipped-fresh.
 *   - 2 — degraded-but-complete: at least one failure, but EVERY failure is
 *         `transient` (a network blip that self-heals next run). Quiet/YELLOW.
 *   - 1 — LOUD (red + notify). ANY of:
 *         · master HELD (a critical upstream re-darkened), OR
 *         · any `deterministic` failure anywhere — a real defect that will not
 *           self-heal (this is the silent-freeze kill: the orphan/spec/type
 *           error that used to hide as a quiet exit 2), OR
 *         · master "published" yet its own outcome is `built` but `written:false`
 *           outside dry-run — i.e. the Stage-4 master gate refused the write
 *           without throwing (the exit-0 silent-freeze path).
 *
 * The transient-vs-deterministic split is the whole point: resilience for blips,
 * an alarm for bugs. A deterministic failure still serves last-good (the answer
 * keeps flowing) — `deriveExitCode` only changes how loudly we report it.
 */
export function deriveExitCode(
  outcomes: BrainBuildOutcome[],
  masterDecision: BuildReport["masterDecision"],
  opts: { dryRun: boolean },
): 0 | 1 | 2 {
  const masterHeld = masterDecision === "held";
  const hasDeterministicFailure = outcomes.some((o) => o.failureClass === "deterministic");
  // Stage-4 master gate HOLD: outcome is `built` (runPipeline returned, no throw)
  // but the gate set written:false. Not a failure status, not degraded/missing —
  // it would otherwise trip nothing and conclude exit 0. dry-run legitimately
  // produces written:false (validate-only), so exclude it.
  const master = outcomes.find((o) => o.packId === "master");
  const masterSilentlyUnpublished =
    !opts.dryRun && master !== undefined && master.status === "built" && master.written === false;
  if (masterHeld || hasDeterministicFailure || masterSilentlyUnpublished) {
    return 1;
  }
  const hasDegradedOrMissing = outcomes.some(
    (o) => o.status === "degraded" || o.status === "missing",
  );
  return hasDegradedOrMissing ? 2 : 0;
}

/**
 * Phase-1 build 02 — the one-line CRON-DIAG string for the failed-run log tail.
 *
 * The cron-incident logger only sees a log tail; on a master HOLD it saw just
 * "exit code 1" → classifier bucketed UNKNOWN → ledger wrote
 * "_auto-captured; pending triage_" → next green run auto-flipped to RESOLVED.
 * The real cause was in `_build-report.json` but never reached the tail. This
 * surfaces it. The master HOLD outcome pushed by cli.mts carries NO `failureClass`
 * and only a generic reason ("HOLD: critical upstream eligibility expired"); the
 * real deterministic cause ("brains/<id>.md not found") lives on whichever outcome
 * `classifyFailure` marked. So prefer the deterministic outcome, else master, and
 * treat a `missing` master as deterministic. Single line, whitespace collapsed,
 * fields guarded → never throws. classify-cron-failure.mjs keys DETERMINISTIC_HOLD
 * on the `failureClass=deterministic` token this emits (Phase-1 _CONTRACT.md A).
 * Exported for direct unit testing — see resilient-build.test.mts.
 */
export function formatCronDiag(outcomes: BrainBuildOutcome[]): string {
  const masterOut = outcomes.find((o) => o.packId === "master");
  const deterministic = outcomes.find((o) => o.failureClass === "deterministic");
  const cause = deterministic ?? masterOut;
  const failureClass =
    cause?.failureClass ?? (masterOut?.status === "missing" ? "deterministic" : "unknown");
  const reason = String(cause?.reason ?? "unknown")
    .replace(/\s+/g, " ")
    .slice(0, 300);
  return `CRON-DIAG failureClass=${failureClass} reason=${reason}`;
}

// ── buildOne ──────────────────────────────────────────────────────────────

type RunPipelineFn = (
  pack: PackDefinition,
  opts: { dryRun: boolean; degradedUpstreamIds?: ReadonlySet<string> },
) => Promise<OutputResult>;

/**
 * The catch-site error log — THE "silent" IN SILENT-DEGRADE.
 *
 * `buildOne` used to swallow the caught error entirely: it called
 * `classifyFailure(...)` and returned, never printing the throw. The CLI in turn
 * only mutated `degradedIds` and printed nothing. Net effect on a forced rebuild:
 * a pack fails, the operator watches five minutes of silence, the process exits 0,
 * and the error that caused it exists NOWHERE in the log (it lived only in the
 * returned object, and on a transient it never even reached `formatCronDiag`).
 *
 * A degraded build must SAY SO. One line, the three facts that make it actionable:
 * WHICH pack, WHAT class (→ whether it self-heals), and the actual error message.
 * `console.error` (not a injected logger) to match refinery house style and to land
 * on the stream the cron log tail captures — which is also what feeds
 * classify-cron-failure.mjs.
 *
 * Stack goes out on `deterministic` only: that's the class that will NOT self-heal
 * and that a human must debug. A transient blip needs the fact, not the trace.
 */
function logFailure(packId: string, outcome: BrainBuildOutcome, err: unknown): void {
  const reason = String(outcome.reason ?? (err instanceof Error ? err.message : err)).replace(
    /\s+/g,
    " ",
  );
  const heals = outcome.failureClass === "transient" ? "self-heals next run" : "will NOT self-heal";
  console.error(
    `[refinery] BUILD FAILED — pack=${packId} status=${outcome.status} ` +
      `failureClass=${outcome.failureClass} (${heals}) — serving ` +
      `${outcome.status === "degraded" ? `last-good v${outcome.version}` : "NOTHING (no eligible last-good)"}` +
      `\n[refinery]   error: ${reason}`,
  );
  if (outcome.failureClass === "deterministic" && err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

/** Wrap a single pack's runPipeline call with resilience: one retry on
 *  transient errors (5s backoff), then classify as `degraded` or `missing`.
 *  `readBrainOutputFn` and `delaySec` are injectable for unit testing. */
export async function buildOne(
  pack: PackDefinition,
  opts: { dryRun: boolean; degradedUpstreamIds?: ReadonlySet<string> },
  runPipeline: RunPipelineFn,
  readBrainOutputFn: (brainId: string) => Promise<BrainOutputRead> = readBrainOutput,
  delaySec: number = 5,
): Promise<BrainBuildOutcome> {
  let result!: OutputResult;
  try {
    result = await runPipeline(pack, opts);
  } catch (firstErr) {
    if (isTransientError(firstErr)) {
      await new Promise<void>((r) => setTimeout(r, delaySec * 1_000));
      try {
        result = await runPipeline(pack, opts);
      } catch (retryErr) {
        // We chose to retry → this is the transient class regardless of the
        // retry error's wording. A transient degrade stays a quiet exit 2.
        const read = await readBrainOutputFn(pack.brain_id);
        const outcome = classifyFailure(pack, retryErr, read, "transient");
        logFailure(pack.id, outcome, retryErr);
        return outcome;
      }
    } else {
      // Non-transient = a real defect that will NOT self-heal (orphan-concept,
      // spec-validator, type error, harvest throw). Tag deterministic so the
      // exit code goes LOUD (exit 1) instead of silently degrading to exit 2.
      const read = await readBrainOutputFn(pack.brain_id);
      const outcome = classifyFailure(pack, firstErr, read, "deterministic");
      logFailure(pack.id, outcome, firstErr);
      return outcome;
    }
  }
  return {
    packId: pack.id,
    status: "built",
    version: result.version,
    written: result.written,
    brainOutput: result.brainOutput,
  };
}
