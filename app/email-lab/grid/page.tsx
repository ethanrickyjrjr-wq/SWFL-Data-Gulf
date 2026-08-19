import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { buildZipSeedDoc } from "@/lib/email/zip-seed";
import { seedById } from "@/lib/email/doc/default-docs";
import { AutoCreateProject } from "../AutoCreateProject";
import { findPlaceholder } from "@/lib/showcase/recipe";
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
  // Capture-or-blank (spec 2026-07-16): the /showcase start-from door lands here
  // as ?seed= — previously IGNORED (the pick fell through to a plain canvas).
  // ?blank=1 = the user explicitly chose the raw layout.
  const seedId = sp.seed && seedById(sp.seed) ? sp.seed : null;
  const seedBlankChosen = sp.blank === "1";
  // THE RECIPE KEY — the deliverable's identity, set by whichever door sent them
  // here (hero pill, showcase card, campaign button, lab example). `recipe` above is
  // only the seed TEXT the user types over; this is what the builder routes on.
  const rkey = sp.rkey ?? null;
  // Outreach attribution — rides the anonymous funnel into SendToSelfModal's
  // claim-and-send (the /email-lab redirect preserves it; consume it here).
  const refCode = (sp.ref ?? "").trim() || null;

  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    // The full recent list (not just [0]) rides to the client so the address-first
    // door can route a typed address into the project that already owns it
    // (matched on title OR subject_address) instead of minting a duplicate row —
    // the confirm popup that used to let the user redirect is suppressed on that
    // door, so the match has to be automatic (second-order audit 08/10/2026).
    // Capture the error: a FAILED query must never read as "zero projects" — on
    // 08/19/2026 a swallowed error here minted pairs of untitled husk projects for an
    // account holding 8 real ones (the create branch below requires !projectsErr).
    const { data, error: projectsErr } = await supabase
      .from("projects")
      .select("id, title, subject_address")
      .order("updated_at", { ascending: false })
      .limit(50);
    const rows =
      (data as { id: string; title: string | null; subject_address: string | null }[] | null) ?? [];
    const row = rows[0];
    // ADDRESS-FIRST also for the very first project (decree 08/10/2026 — "address
    // IS the project name"): a zero-project account arriving with an address-blank
    // recipe gets the address popup and a project titled by it, NOT AutoCreateProject's
    // untitled kind:"general" row that would then re-ask the address in-project.
    const recipeNeedsAddressPopup = Boolean(recipe && findPlaceholder(recipe) && !addr);
    if (!row && !projectsErr && !recipeNeedsAddressPopup) {
      // Zero projects: make one and carry the recipe/zip/addr/seed into it, where
      // the in-project client runs the same arrival (capture-or-blank included).
      return (
        <AutoCreateProject
          zip={zip}
          recipe={recipe}
          recipeNeeds={recipeNeeds}
          rkey={rkey}
          addr={addr}
          seed={seedId}
          blank={seedBlankChosen}
        />
      );
    }
    // Seed wins over zip, mirroring planArrival's branch order.
    const seedDoc = seedId
      ? (seedById(seedId)?.build() ?? null)
      : zip
        ? await buildZipSeedDoc(zip)
        : null;
    return (
      <EmailLabGridClient
        seedDoc={seedDoc}
        zip={zip}
        addr={addr}
        recipe={recipe}
        recipeNeeds={recipeNeeds}
        rkey={rkey}
        seedId={seedId}
        seedBlankChosen={seedBlankChosen}
        signedIn
        offeredProject={row ? { id: row.id, title: row.title ?? "your project" } : null}
        knownProjects={
          projectsErr
            ? null // UNREADABLE ≠ empty: the client must not create against a blind list
            : rows.map((r) => ({
                id: r.id,
                title: r.title,
                subject_address: r.subject_address,
              }))
        }
      />
    );
  }

  // Anonymous: deterministic ZIP prebuild when present, else the grid seed.
  // Seed wins over zip, mirroring planArrival's branch order.
  const seedDoc = seedId
    ? (seedById(seedId)?.build() ?? null)
    : zip
      ? await buildZipSeedDoc(zip)
      : null;
  return (
    <EmailLabGridClient
      seedDoc={seedDoc}
      zip={zip}
      addr={addr}
      recipe={recipe}
      recipeNeeds={recipeNeeds}
      rkey={rkey}
      seedId={seedId}
      seedBlankChosen={seedBlankChosen}
      refCode={refCode}
      signedIn={false}
      offeredProject={null}
    />
  );
}
