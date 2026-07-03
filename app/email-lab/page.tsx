import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { labDestination } from "@/lib/project/lab-redirect";
import { buildZipSeedDoc } from "@/lib/email/zip-seed";
import { AutoCreateProject } from "./AutoCreateProject";
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
    const dest = labDestination((data as { id: string }[] | null) ?? [], zip);
    if (dest) redirect(dest);
    return <AutoCreateProject zip={zip} />;
  }

  const seedDoc = zip ? await buildZipSeedDoc(zip) : null;
  // `ref` = outreach attribution (REF_RE-validated at claim time); rides into
  // the send-to-self capture instead of a claim token.
  const refCode = typeof sp.ref === "string" ? sp.ref : null;
  return <EmailLabClient initialDoc={seedDoc} zip={zip} refCode={refCode} />;
}
