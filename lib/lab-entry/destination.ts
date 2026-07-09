// lib/lab-entry/destination.ts
//
// THE ONE ROOT for every URL that navigates INTO the email lab. Before this,
// each door improvised its own href/push (spec 2026-07-06-lab-entry-root):
// campaign clicks, map clicks, open-existing rows, template rails, the arc
// deep link. They all build here now — destination.static.test.ts fails the
// suite if a raw "/email-lab" nav string appears outside this directory.
//
// Re-exports the two recipe/hero builders unchanged (they already live in
// their feature homes and are pure); adds the open-existing / seed / zip / arc
// builders and `signedInLabArrival`, which REPLACES lib/project/lab-redirect's
// labDestination — the projects[0] pick is deleted: a signed-in standalone
// visit lands on /email-lab/grid and the arrival controller asks which project.
export { recipeDestination, type ShowcaseRecipe } from "@/lib/showcase/recipe";
export { heroDestination, type HeroCampaignEntry } from "@/lib/campaigns";

/** The anonymous plain-open landing (block-canvas taste surface). Landing CTAs
 *  point here; the static door-pin test treats this named export as the sanctioned
 *  reference so those hrefs read from ONE place, not scattered literals. */
export const EMAIL_LAB_LANDING = "/email-lab";

export function projectEmailLabBase(projectId: string): string {
  return `/project/${projectId}/email-lab`;
}

/** Open an existing block-canvas deliverable for editing (?did=). */
export function openDoc(projectId: string, did: string, opts: { schedule?: boolean } = {}): string {
  const q = opts.schedule ? `?did=${did}&schedule=1` : `?did=${did}`;
  return `${projectEmailLabBase(projectId)}${q}`;
}

/** Open a template seed by id (?seed=) — an explicit template pick, no popups. */
export function openSeed(projectId: string, seedId: string): string {
  return `${projectEmailLabBase(projectId)}?seed=${encodeURIComponent(seedId)}`;
}

/** A template-gallery pick with NO project context (the /showcase "Start-from
 *  layouts" section). Lands on the anonymous-usable grid lab carrying ?seed= —
 *  planArrival treats it as an explicit template pick (no popups) for both
 *  anonymous and signed-in visitors. In-project hosts keep using openSeed. */
export function seedGalleryDestination(seedId: string): string {
  return `/email-lab/grid?seed=${encodeURIComponent(seedId)}`;
}

/** Homepage-map / zip-report click → the anonymous grid lab's deterministic
 *  ZIP seed doc. Signed-in users hit /email-lab first, which carries this. */
export function openZipLab(
  zip: string,
  opts: { addr?: string | null; ref?: string | null } = {},
): string {
  const params = new URLSearchParams({ zip });
  if (opts.addr) params.set("addr", opts.addr);
  if (opts.ref) params.set("ref", opts.ref);
  return `/email-lab?${params.toString()}`;
}

/** The lifecycle arc strip's deep link into a milestone step. */
export function arcStepDestination(
  projectId: string,
  step: {
    key: string;
    seed_doc_id: string;
    recipe_prompt: string;
    deliverable_id?: string | null;
  },
): string {
  const params = new URLSearchParams({
    arcStep: step.key,
    seed: step.seed_doc_id,
    recipe: step.recipe_prompt,
  });
  if (step.deliverable_id) params.set("did", step.deliverable_id);
  return `${projectEmailLabBase(projectId)}?${params.toString()}`;
}

/** A signed-in visit to a standalone lab (/email-lab or /email-lab/grid). ALWAYS
 *  /email-lab/grid — the arrival controller asks which project once there. This
 *  is the deleted labDestination's replacement: NO projects[0], NO project id. */
export function signedInLabArrival(
  carry: { recipe?: string | null; recipeNeeds?: string | null; zip?: string | null } = {},
): string {
  const params = new URLSearchParams();
  if (carry.zip && /^\d{5}$/.test(carry.zip)) params.set("zip", carry.zip);
  if (carry.recipe) params.set("recipe", carry.recipe);
  if (carry.recipeNeeds) params.set("recipeNeeds", carry.recipeNeeds);
  const q = params.size > 0 ? `?${params.toString()}` : "";
  return `/email-lab/grid${q}`;
}

/** An anonymous visit to /email-lab lands on the grid lab, carrying every
 *  param through (zip/addr seed the prebuild, recipe/recipeNeeds ride the
 *  Make-this handoff, ref is outreach attribution). */
export function anonymousLabArrival(
  carry: {
    zip?: string | null;
    addr?: string | null;
    recipe?: string | null;
    recipeNeeds?: string | null;
    ref?: string | null;
  } = {},
): string {
  const params = new URLSearchParams();
  if (carry.zip) params.set("zip", carry.zip);
  if (carry.addr) params.set("addr", carry.addr);
  if (carry.recipe) params.set("recipe", carry.recipe);
  if (carry.recipeNeeds) params.set("recipeNeeds", carry.recipeNeeds);
  if (carry.ref) params.set("ref", carry.ref);
  const q = params.size > 0 ? `?${params.toString()}` : "";
  return `/email-lab/grid${q}`;
}
