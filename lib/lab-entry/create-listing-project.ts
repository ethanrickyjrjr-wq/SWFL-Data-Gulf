// lib/lab-entry/create-listing-project.ts
//
// Shared "type an address, get a listing project" helper (spec
// 2026-07-15-gallery-listing-hero-design.md). Third caller of this exact POST /api/projects
// shape — app/email-lab/AutoCreateProject.tsx and EmailLabGridClient's createAndEnter each had
// their own inline copy; the Listing Campaign hero (Task 3) would have been a fourth, so this
// is extracted now instead.
import { projectEmailLabBase } from "./destination";

/** The POST /api/projects body for a fresh listing project — pure, so the shape is testable
 *  without a network call. */
export function listingProjectRequestBody(address: string): {
  title: string;
  kind: "listing";
  subject_address: string;
} {
  return { title: address, kind: "listing", subject_address: address };
}

/** Creates a listing project for `address` and hard-navigates into its Email tab
 *  (window.location.assign, matching the sibling hard-navigation pattern in
 *  EmailLabGridClient.intoProject — a real project switch, not a client-side route). Returns
 *  false (no navigation) on failure so the caller can re-enable its form instead of hanging on a
 *  dead "Setting up…" state. */
export async function createListingProjectAndEnter(address: string): Promise<boolean> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(listingProjectRequestBody(address)),
  });
  const data = (await res.json().catch(() => null)) as { id?: string } | null;
  if (!data?.id) return false;
  window.location.assign(projectEmailLabBase(data.id));
  return true;
}
