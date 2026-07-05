import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { labDestination } from "@/lib/project/lab-redirect";
import { buildZipSeedDoc } from "@/lib/email/zip-seed";
import { AutoCreateProject } from "../AutoCreateProject";
import { EmailLabGridClient } from "./EmailLabGridClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Email Lab — Grid (North Star)" };

// Cockpit D4 — same chooser as /email-lab; the project Email tab defaults to
// the grid canvas, so grid visitors lose nothing.
// This is also where the AI pill's "Make this →" (BriefcasePanel.onUseRecipe)
// and "Start building free" (ShowcaseOverlay.onAuthedCta → onBuild) land a
// signed-in visitor with no current project — ?recipe=/?recipeNeeds= rides
// the redirect into their project's Email tab exactly like the homepage-map
// ?zip= (same carry the /showcase page's own handoff uses).
export default async function EmailLabGridPage({
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
    const { data } = await supabase
      .from("projects")
      .select("id")
      .order("updated_at", { ascending: false })
      .limit(1);
    const dest = labDestination((data as { id: string }[] | null) ?? [], {
      zip,
      recipe,
      recipeNeeds,
    });
    if (dest) redirect(dest);
    return <AutoCreateProject zip={zip} recipe={recipe} recipeNeeds={recipeNeeds} />;
  }
  // Anonymous + ?zip= (homepage hero / map click): same deterministic prebuild
  // as /email-lab — the visitor lands on a branded email already on canvas, $0
  // until they engage the builder. EmailLabGridClient still reads ?recipe=/
  // ?recipeNeeds= itself via useSearchParams; only the seed doc is server-built.
  const seedDoc = zip ? await buildZipSeedDoc(zip) : null;
  return <EmailLabGridClient seedDoc={seedDoc} />;
}
