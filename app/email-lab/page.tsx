import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { signedInLabArrival } from "@/lib/lab-entry/destination";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Email Lab — Design Surface" };

// Cockpit D4 / retire-block-shell (2026-07-07): the block-canvas standalone is
// gone. The GRID lab is the ONE email surface. Signed-in users go to their
// project's Email tab (which owns the project/address popups); anonymous visitors
// go to the anonymous grid lab. Every param rides the redirect so nothing drops.
export default async function EmailLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const zip = /^\d{5}$/.test(sp.zip ?? "") ? (sp.zip as string) : null;
  const recipe = sp.recipe ?? null;
  const recipeNeeds = sp.recipeNeeds ?? null;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect(signedInLabArrival({ zip, recipe, recipeNeeds }));
  }

  // Anonymous: the grid lab is the taste surface. Carry every param through —
  // zip/addr seed the prebuild, recipe/recipeNeeds ride the Make-this handoff.
  // `ref` (outreach attribution) was a dead prop on the old block shell; it's
  // preserved in the URL for the grid path to consume if/when wired.
  const params = new URLSearchParams();
  if (zip) params.set("zip", zip);
  if (sp.addr) params.set("addr", sp.addr);
  if (recipe) params.set("recipe", recipe);
  if (recipeNeeds) params.set("recipeNeeds", recipeNeeds);
  if (typeof sp.ref === "string" && sp.ref) params.set("ref", sp.ref);
  const qs = params.toString();
  redirect(`/email-lab/grid${qs ? `?${qs}` : ""}`);
}
