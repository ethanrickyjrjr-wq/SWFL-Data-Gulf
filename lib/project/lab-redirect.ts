// lib/project/lab-redirect.ts
// Cockpit D4 — signed-in visits to the standalone labs land in a project's
// Email tab (grid is the default canvas there, so one destination covers both
// /email-lab and /email-lab/grid). Null = no projects; the caller auto-creates.
// A homepage-map ?zip= or a showcase ?recipe=<prompt>&recipeNeeds=<comma
// needs> rides the redirect so the prebuild/prompt survives the hop (zip used
// to be silently dropped — the operator's map-click promise broke for every
// signed-in user; recipe follows the same fix for the "Make this →" carry,
// 07/03/2026 — used identically by the AI pill (BriefcasePanel) and the
// /showcase page (CampaignExamples), so there is exactly one ?recipe= format).
export interface LabDestinationCarry {
  zip?: string | null;
  recipe?: string | null;
  recipeNeeds?: string | null;
}

export function labDestination(
  projects: { id: string }[],
  carry?: LabDestinationCarry,
): string | null {
  const first = projects[0];
  if (!first) return null;
  const params = new URLSearchParams();
  if (carry?.zip && /^\d{5}$/.test(carry.zip)) params.set("zip", carry.zip);
  if (carry?.recipe) params.set("recipe", carry.recipe);
  if (carry?.recipeNeeds) params.set("recipeNeeds", carry.recipeNeeds);
  const q = params.size > 0 ? `?${params.toString()}` : "";
  return `/project/${first.id}/email-lab${q}`;
}
