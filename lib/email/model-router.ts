/**
 * Per-request model picker for the Email Lab / SNICKLEFRITZ build surface.
 *
 * Quality builds use a stronger model. Operator decree: "I don't care if we
 * need opus." A single mode string (from the request body / UI) maps to a
 * concrete Anthropic model id here so callers never hard-code an id.
 *
 * Model ids confirmed current via crawl4ai 06/26/2026.
 */

/** Email Lab UI default — cheap/fast, used for interactive token-filling. */
export const EMAIL_MODEL_HAIKU = "claude-haiku-4-5";
/** Quality builds (SNICKLEFRITZ) — stronger synthesis. */
export const EMAIL_MODEL_SONNET = "claude-sonnet-4-6";
/** Max tier — when the operator wants the best, cost be damned. */
export const EMAIL_MODEL_OPUS = "claude-opus-4-8";

const MODE_TO_MODEL: Record<string, string> = {
  interactive: EMAIL_MODEL_HAIKU,
  haiku: EMAIL_MODEL_HAIKU,
  quality: EMAIL_MODEL_SONNET,
  snicklefritz: EMAIL_MODEL_SONNET,
  sonnet: EMAIL_MODEL_SONNET,
  max: EMAIL_MODEL_OPUS,
  opus: EMAIL_MODEL_OPUS,
};

/**
 * Resolve a request `mode` to a concrete Anthropic model id.
 *
 * - `undefined` / `'interactive'` / `'haiku'` -> haiku (default)
 * - `'quality'` / `'snicklefritz'` / `'sonnet'` -> sonnet
 * - `'max'` / `'opus'` -> opus
 * - any unknown value -> haiku default
 *
 * Lookup is case-insensitive and whitespace-trimmed.
 */
export function resolveEmailModel(mode?: string): string {
  if (mode == null) return EMAIL_MODEL_HAIKU;
  const key = mode.trim().toLowerCase();
  return MODE_TO_MODEL[key] ?? EMAIL_MODEL_HAIKU;
}
