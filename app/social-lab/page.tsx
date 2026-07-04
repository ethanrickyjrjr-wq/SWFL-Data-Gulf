import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { AutoCreateSocialProject } from "./AutoCreateSocialProject";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Social — SWFL Data Gulf" };

/**
 * Entry/redirector for a social-target showcase "Make this →" recipe
 * (lib/showcase/recipe.ts recipeDestination) — mirrors /email-lab/grid's
 * signed-in redirect dance (lib/project/lab-redirect.ts), landing the
 * visitor in their project's Social tab instead of Email.
 *
 * No anonymous social composer exists yet (ProjectSocialPage itself requires
 * a session), so a logged-out visitor goes to /login and lands right back
 * here once signed in — app/login/page.tsx's established `?next=` pattern —
 * then this page runs again with a real session and proceeds to the
 * project redirect/auto-create below.
 */
export default async function SocialLabPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const recipe = sp.recipe ?? null;
  const recipeNeeds = sp.recipeNeeds ?? null;
  const params = new URLSearchParams();
  if (recipe) params.set("recipe", recipe);
  if (recipeNeeds) params.set("recipeNeeds", recipeNeeds);
  const q = params.size > 0 ? `?${params.toString()}` : "";

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/social-lab${q}`)}`);
  }

  const { data } = await supabase
    .from("projects")
    .select("id")
    .order("updated_at", { ascending: false })
    .limit(1);
  const first = (data as { id: string }[] | null)?.[0];
  if (first) redirect(`/project/${first.id}/social${q}`);
  return <AutoCreateSocialProject recipe={recipe} recipeNeeds={recipeNeeds} />;
}
