// lib/email/showing-prep-intent.ts
//
// Detect the "Showing Prep Packet" recipe in a build prompt — the agent's own
// internal prep document for a showing (comps + subject + market snapshot), NOT a
// buyer-facing listing flyer. Kept tight ("showing prep" / "prep packet") so it
// never overlaps the New-Listing / Just-Sold / Coming-Soon recipes.

const SHOWING_PREP_RECIPE = /\b(showing[-\s]?prep|prep\s+packet)\b/i;

export function isShowingPrepPrompt(prompt: string): boolean {
  return !!prompt && SHOWING_PREP_RECIPE.test(prompt);
}
