/**
 * The bake's exit-code decision — extracted so it is testable and so the rule is
 * stated in one place instead of living in a ternary at the bottom of a 431-line
 * script.
 *
 * WHY THIS EXISTS (08/11/2026): `bake-narratives.mts` ended with
 *   `return t.failed > 0 || t.failures.length > 0 ? 1 : 0;`
 * so ANY validation rejection failed the run. On 08/11 the bake baked 60 surfaces,
 * caught 9 where the model invented numbers ("50", "60", "32") or leaked jargon,
 * kept the previous rows so nothing invented shipped — and exited 1. That is the
 * guard WORKING. But the red run cascaded: `nightly-chain.yml` went red, and
 * `grade-predictions.yml` success-gates on that chain, so prediction grading was
 * skipped every night from 07/22/2026 (grader's last successful run) onward.
 *
 * THE RULE, matching the contract `grade-predictions.yml` already documents for
 * itself ("an empty queue is a SUCCESS; only a Supabase/RPC error fails the run"):
 * a run that did its job exits 0. Only genuine breakage exits 1.
 *
 * THE COUNTER-FAILURE THIS DELIBERATELY GUARDS: a blanket exit 0 would convert a
 * loud problem into a silent one — failing surfaces would serve stale prose
 * indefinitely with nothing surfacing it. That is `stale-source-served-silently`
 * (5 strikes, guard OWED). So partial failure is GREEN BUT LOUD: the caller MUST
 * emit a per-surface annotation (see `formatFailureAnnotation`), and the ratio
 * ceiling below still turns a systemic break red.
 *
 * SOURCE for the 0.50 default (cited per the no-uncited-constants rule — this is a
 * methodology choice, not a free parameter): the observed validator rejection rate
 * on the 08/11/2026 run was 9 of 69 attempted = 13.0%. A first pass set the ceiling
 * at 0.25 and that was WRONG — only ~2x the observed rate, so an ordinary noisy
 * night could cross it by chance and redden the chain, reintroducing the very
 * failure this file exists to remove. The line is now drawn where it means
 * something you can say out loud: the bake failed MORE surfaces than it baked.
 * That is the signature of a real break (a prompt regression, a schema change, the
 * 07/10 input-hash reassembly bug that discarded 72 keys at once), and it is far
 * outside anything validator noise produces. Override per-run with BAKE_FAIL_RATIO.
 */

/** Ceiling on failed/(baked+failed) before a run is treated as systemically broken. */
export const BAKE_FAIL_RATIO_DEFAULT = 0.5;

export interface BakeTallyLike {
  baked: number;
  failed: number;
  skipped: number;
  /** Set by the caller for a genuine infrastructure error (API/DB/auth). Always red. */
  hardError?: boolean;
}

/**
 * 0 = the run did its job (even if some surfaces were correctly rejected).
 * 1 = genuine breakage: a hard error, nothing baked while failures piled up, or a
 *     failure rate above `ratioCeiling`.
 */
export function bakeExitCode(
  t: BakeTallyLike,
  ratioCeiling: number = BAKE_FAIL_RATIO_DEFAULT,
): 0 | 1 {
  if (t.hardError) return 1;

  // Nothing was attempted (everything skipped / nothing due) — not a failure.
  const attempted = t.baked + t.failed;
  if (attempted === 0) return 0;

  // Every attempted surface failed to validate — the bake produced nothing.
  if (t.baked === 0) return 1;

  // Inclusive: exactly at the ceiling passes, above it fails.
  return t.failed / attempted > ratioCeiling ? 1 : 0;
}

/** Resolve the ceiling from env, falling back to the cited default. */
export function resolveFailRatio(env: Record<string, string | undefined>): number {
  const raw = env.BAKE_FAIL_RATIO;
  if (!raw) return BAKE_FAIL_RATIO_DEFAULT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : BAKE_FAIL_RATIO_DEFAULT;
}

/**
 * The loud half of "green but loud". Emits a GitHub Actions warning annotation per
 * failed surface so a green run still surfaces every surface serving a stale row.
 * Returns the lines so the caller can print them (and tests can read them).
 */
export function formatFailureAnnotation(failures: string[]): string[] {
  if (failures.length === 0) return [];
  const lines = failures.map(
    (f) => `::warning title=bake surface serving STALE row::${f.replace(/\r?\n/g, " ")}`,
  );
  lines.push(
    `::warning title=bake stale-surface count::${failures.length} surface(s) failed validation and are serving a PREVIOUS row. Nothing invented shipped. Fix the prompt/inputs or these go stale indefinitely.`,
  );
  return lines;
}
