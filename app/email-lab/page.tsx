import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { signedInLabArrival } from "@/lib/lab-entry/destination";
import { buildZipSeedDoc } from "@/lib/email/zip-seed";
import { EmailLabClient } from "./EmailLabClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Email Lab — Design Surface" };

// Cockpit D4 — signed-in users work in their project's Email tab; the
// standalone lab stays the anonymous taste-surface until Phase 2.
// ?zip=<5-digit> (homepage map click) seeds the ZIP email prebuild on EVERY
// path: anonymous opens it here; signed-in carries it through the redirect so
// the project Email tab seeds the same doc with their brand applied.
export default async function EmailLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const zip = /^\d{5}$/.test(sp.zip ?? "") ? (sp.zip as string) : null;
  // A pill/showcase "Make this →" (?recipe=/?recipeNeeds=) that lands here
  // (the block-canvas standalone) rides through to the grid canvas via the
  // redirect below — the block canvas itself has no Build box to seed, Grid-only.
  const recipe = sp.recipe ?? null;
  const recipeNeeds = sp.recipeNeeds ?? null;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // The dying block-canvas standalone never grows the new-build flow — send
    // signed-in visitors to the grid lab, which owns the project/address popups
    // (spec 2026-07-06 §A). The grid page then asks which project (or auto-creates
    // one when they have none). Params ride the redirect so nothing is dropped.
    redirect(signedInLabArrival({ zip, recipe, recipeNeeds }));
  }

  const seedDoc = zip ? await buildZipSeedDoc(zip) : null;
  // `ref` = outreach attribution (REF_RE-validated at claim time); rides into
  // the send-to-self capture instead of a claim token.
  const refCode = typeof sp.ref === "string" ? sp.ref : null;
  return <EmailLabClient initialDoc={seedDoc} zip={zip} refCode={refCode} />;
}
