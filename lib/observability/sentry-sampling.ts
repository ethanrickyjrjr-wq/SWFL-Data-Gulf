/**
 * Sentry trace-sampling resolution — the ONE authority for how the three Sentry
 * runtime configs (browser / node / edge) turn an env var into a sample rate.
 *
 * Pure and runtime-agnostic: no `process`, `window`, or other host globals are
 * touched here, so this module is safe to import into the browser bundle
 * (`instrumentation-client.ts`) and the edge runtime (`sentry.edge.config.ts`)
 * as well as node. Each caller reads its OWN env var and passes the raw string
 * in; this function only parses/clamps.
 *
 * Why the default is low (RULE 11 — size the decision to our volume, not a
 * hyperscaler default):
 *   - ERRORS, the actual point of this layer, are captured independently at
 *     100% via Sentry's `sampleRate` (default 1.0). This value governs ONLY the
 *     secondary tracing/performance feature.
 *   - Verified 2026-07-21 against sentry.io/pricing: the free "Developer" plan
 *     includes 5,000 errors/mo and 5,000,000 spans/mo. A traced Next.js request
 *     emits ~10-30 spans, so at a 0.1 sample rate we stay well under the 5M span
 *     budget even at a few hundred-thousand requests/mo — while 1.0 would risk
 *     silently blowing it if a crawler or traffic growth hits us (the quota/noise
 *     failure mode this layer is named after).
 *   - Real request volume is not observable from a local worktree, so the honest
 *     default is conservative + tunable UP via the env var once Sentry's own
 *     usage stats confirm headroom.
 */
export const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Resolve a traces sample rate in [0, 1] from a raw env-var string.
 *
 * @param raw       the env var value (or `undefined` when unset)
 * @param fallback  the rate to use when `raw` is missing/blank/invalid; itself
 *                  clamped to [0, 1] so a bad default can never over-sample
 * @returns a finite number in [0, 1]
 */
export function resolveTracesSampleRate(
  raw: string | undefined,
  fallback: number = DEFAULT_TRACES_SAMPLE_RATE,
): number {
  const safeFallback = clamp01(Number.isFinite(fallback) ? fallback : DEFAULT_TRACES_SAMPLE_RATE);
  if (raw === undefined || raw.trim() === "") return safeFallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return safeFallback;
  return clamp01(parsed);
}
