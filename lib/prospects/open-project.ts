import { resolveZip } from "@/refinery/lib/zip-resolver.mts";
import type { ClaimBrand, ClaimSeed } from "@/lib/claim/claim-store";

/**
 * The "Open your project" bridge plan (FINAL BOSS 05, Unit 2). Turns a funnel
 * prospect's arrival params into the inputs for a claim-token mint: a grounded
 * title, the §I one-click email seed, and the brand to carry onto the project.
 *
 * Pure + grounded: the in-scope gate AND the place name both come from `resolveZip`
 * — the SAME 6-county MOAT authority the enroll/activation path uses — so an
 * out-of-scope ZIP (Miami, Manatee) is rejected here exactly as it is at enroll,
 * and the title reads "Fort Myers Beach 33931", never an invented place. Nothing
 * finer than a ZIP is ever fabricated.
 */
export interface OpenProjectPlan {
  inScope: boolean;
  /** "Fort Myers Beach 33931" — grounded place + ZIP. Empty when out of scope. */
  title: string;
  /** One-click deliverable seed replaying the §I `/project/[id]?seed=` mechanism. */
  seed: ClaimSeed;
  brand: ClaimBrand | null;
}

export function planOpenProject(input: {
  zip: string;
  brand?: ClaimBrand | null;
}): OpenProjectPlan {
  const zip = (input.zip ?? "").trim();
  const seed: ClaimSeed = { template: "email", scopeKind: "zip", scopeValue: zip };
  const out: OpenProjectPlan = { inScope: false, title: "", seed, brand: null };

  if (!/^\d{5}$/.test(zip)) return out;
  const res = resolveZip(zip);
  if (!res.in_scope) return out;

  const place = res.places[0]?.place ?? res.places[0]?.usps_preferred_city ?? `ZIP ${zip}`;
  return { inScope: true, title: `${place} ${zip}`, seed, brand: input.brand ?? null };
}
