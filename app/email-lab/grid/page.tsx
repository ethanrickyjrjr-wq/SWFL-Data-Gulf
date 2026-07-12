import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { buildZipSeedDoc } from "@/lib/email/zip-seed";
import { AutoCreateProject } from "../AutoCreateProject";
import { EmailLabGridClient } from "./EmailLabGridClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Email Lab — Grid (North Star)" };

// Signed-in visitors NO LONGER redirect into projects[0] (spec 2026-07-06 §A):
// the grid client renders a project-confirm popup over a blank skeleton and asks
// which project. Three arrivals:
//   - anonymous              → grid client, no project (taste surface)
//   - signed-in + a project  → grid client + offeredProject (confirm popup)
//   - signed-in + no project → AutoCreateProject (make one, carry into it), so
//     the confirm popup only ever sees a real project to offer.
export default async function EmailLabGridPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const zip = /^\d{5}$/.test(sp.zip ?? "") ? (sp.zip as string) : null;
  const addr = (sp.addr ?? "").trim() || null;
  const recipe = sp.recipe ?? null;
  const recipeNeeds = sp.recipeNeeds ?? null;
  // Outreach attribution — rides the anonymous funnel into SendToSelfModal's
  // claim-and-send (the /email-lab redirect preserves it; consume it here).
  const refCode = (sp.ref ?? "").trim() || null;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase
      .from("projects")
      .select("id, title")
      .order("updated_at", { ascending: false })
      .limit(1);
    const row = (data as { id: string; title: string | null }[] | null)?.[0];
    if (!row) {
      // Zero projects: make one and carry the recipe/zip/addr into it, where the
      // in-project client runs the same arrival (blank skeleton + address popup).
      return <AutoCreateProject zip={zip} recipe={recipe} recipeNeeds={recipeNeeds} addr={addr} />;
    }
    const seedDoc = zip ? await buildZipSeedDoc(zip) : null;
    return (
      <EmailLabGridClient
        seedDoc={seedDoc}
        zip={zip}
        addr={addr}
        recipe={recipe}
        recipeNeeds={recipeNeeds}
        signedIn
        offeredProject={{ id: row.id, title: row.title ?? "your project" }}
      />
    );
  }

  // Anonymous: deterministic ZIP prebuild when present, else the grid seed.
  const seedDoc = zip ? await buildZipSeedDoc(zip) : null;
  return (
    <EmailLabGridClient
      seedDoc={seedDoc}
      zip={zip}
      addr={addr}
      recipe={recipe}
      recipeNeeds={recipeNeeds}
      refCode={refCode}
      signedIn={false}
      offeredProject={null}
    />
  );
}
