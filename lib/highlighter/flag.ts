/**
 * Server-side gate for the in-page Highlighter UI.
 *
 * Default ON — the UI is production-ready.
 * Set HIGHLIGHTER_UI=0 (or "false") in the environment to disable.
 */
export function highlighterUiEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const v = env.HIGHLIGHTER_UI;
  return v !== "0" && v !== "false";
}
