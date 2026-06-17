/**
 * Piece 2 LLM-accelerator gates — all default OFF.
 *
 * Each deterministic baseline runs regardless of these flags.
 * Set the env var to "1" or "true" to enable the LLM layer in that slot.
 * Never gate a build; only gate speed/polish accelerators.
 */

/** LLM rephrase of deterministic project prompts ("prompt polish"). */
export function promptPolishEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.PROMPT_POLISH_ENABLED;
  return v === "1" || v === "true";
}

/** One-LLM-pass background pre-build of ONE deliverable. */
export function prebuildEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.PREBUILD_ENABLED;
  return v === "1" || v === "true";
}

/** LLM curation pass inside assemble-on-command. */
export function assembleLlmEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.ASSEMBLE_LLM_ENABLED;
  return v === "1" || v === "true";
}
