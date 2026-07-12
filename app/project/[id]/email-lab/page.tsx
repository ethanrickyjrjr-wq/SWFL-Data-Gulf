import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { inferScopeFromItems } from "@/lib/project/derive-name";
import type { ProjectItem } from "@/lib/project/items";
import { signedUploadUrls } from "@/lib/project/signed-upload-url";
import { brandingToTokens } from "@/lib/email/brand/branding-to-tokens";
import type { BrandNeed, ShowcaseRecipe } from "@/lib/showcase/recipe";
import { ProjectEmailLabClient } from "./ProjectEmailLabClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Email Lab" };

interface Branding {
  primary_color?: string;
  accent_color?: string;
  text_color?: string;
  backdrop_color?: string;
  agent_name?: string;
  agent_title?: string;
  agent_bio?: string;
  brokerage?: string;
  license?: string;
  nickname?: string;
  quote?: string;
  business_address?: string;
  logo_url?: string;
  photo_url?: string;
  contact_email?: string;
  contact_phone?: string;
  website_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  linkedin_url?: string;
  x_url?: string;
  tiktok_url?: string;
  youtube_url?: string;
  pinterest_url?: string;
  threads_url?: string;
  unsubscribe_url?: string;
}

export default async function ProjectEmailLabPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const did = sp.did ?? null;
  const seedId = sp.seed ?? null;
  // Homepage-map click (Lane B fork 1b): ?zip= seeds the deterministic ZIP
  // email prebuild as a new draft in THIS project, brand applied via the
  // normal token bridge below. No LLM call on arrival.
  const zipSeed = /^\d{5}$/.test(sp.zip ?? "") ? (sp.zip as string) : null;
  // Returning from the contacts-upload detour re-opens the schedule modal (?schedule=1).
  const autoOpenSchedule = sp.schedule === "1";
  // Showcase "Make this →" carry — the AI pill, the lab's own Examples
  // accordion, and the /showcase page all route through the same
  // ?recipe=<prompt>&recipeNeeds=<comma needs> (lib/project/lab-redirect.ts).
  // Grid canvas only; the block canvas has no Build box to seed.
  const recipePrompt = sp.recipe ?? null;
  const recipeNeeds = (sp.recipeNeeds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as BrandNeed[];
  const initialRecipe: ShowcaseRecipe | null = recipePrompt
    ? { prompt: recipePrompt, needs: recipeNeeds }
    : null;
  // A hero handoff carries the typed listing address as ?addr= — it becomes the
  // build's effective scope address (comps), overriding the project's stored one.
  const arrivalAddr = (sp.addr ?? "").trim() || null;

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, items, branding, ui_state, subject_address")
    .eq("id", id)
    .maybeSingle();

  if (!project) notFound();

  // Lifecycle arc: load the armed sequence (if any) for the strip. The arm
  // CTA shows only for listing projects (subject_address present).
  const { data: seqRow } = await supabase
    .from("email_sequences")
    .select("id, status, setup_name, audience_slug, send_hour_et, steps")
    .eq("project_id", id)
    .eq("status", "armed")
    .maybeSingle();
  const arcStep = typeof sp.arcStep === "string" ? sp.arcStep : null;

  // Lane E gallery: does this project have ANY built block-canvas deliverable?
  // head:true count — no rows shipped. RLS-scoped like every read on this page.
  const { count: dCount } = await supabase
    .from("deliverables")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id)
    .eq("template", "block-canvas");
  const hasDeliverables = (dCount ?? 0) > 0;

  const branding: Branding = (project.branding ?? {}) as Branding;
  const items: ProjectItem[] = Array.isArray(project.items) ? project.items : [];
  const scope = inferScopeFromItems(items);

  // Load image file items + 1h signed display URLs for the Photos panel.
  const imageItems = items.filter(
    (i): i is Extract<ProjectItem, { kind: "file" }> =>
      i.kind === "file" && Boolean(i.mime?.startsWith("image/")),
  );
  const imageSignedUrls =
    imageItems.length > 0
      ? await signedUploadUrls(
          supabase,
          imageItems.map((i) => i.storage_path),
        )
      : {};
  const projectPhotos = imageItems
    .filter((i) => imageSignedUrls[i.storage_path])
    .map((i) => ({
      storage_path: i.storage_path,
      signedUrl: imageSignedUrls[i.storage_path],
      caption: i.caption,
    }));

  // Map project branding → email token overrides via the ONE shared brand bridge
  // (same mapping the lab's live brand panel uses → editing brand in either place
  // produces the same email). Scope-derived HERO_LABEL is not brand, added here.
  const initialTokens: Record<string, string> = brandingToTokens(
    branding as Record<string, string>,
  );
  if (scope.place) {
    initialTokens.HERO_LABEL = `${scope.place}${scope.zip ? ` ${scope.zip}` : ""}`;
  } else if (scope.zip) {
    initialTokens.HERO_LABEL = scope.zip;
  }

  let initialDoc: import("@/lib/email/doc/types").EmailDoc | null = null;
  if (did) {
    const { data } = await supabase
      .from("deliverables")
      .select("id, doc")
      .eq("id", did)
      .eq("project_id", id)
      .eq("template", "block-canvas")
      .single();
    if (data?.doc) initialDoc = data.doc as import("@/lib/email/doc/types").EmailDoc;
  } else if (seedId) {
    const { seedById } = await import("@/lib/email/doc/default-docs");
    initialDoc = seedById(seedId)?.build() ?? null;
  } else if (zipSeed) {
    const { buildZipSeedDoc } = await import("@/lib/email/zip-seed");
    initialDoc = await buildZipSeedDoc(zipSeed);
  }

  return (
    <ProjectEmailLabClient
      projectId={id}
      projectTitle={project.title ?? "Project"}
      initialTokens={initialTokens}
      initialBranding={branding as Record<string, string>}
      scope={
        // Address spine (build 2): a listing project's saved subject address
        // rides the scope so the build feed pulls its nearby sold comps. A hero
        // ?addr= overrides it so the build uses the address just typed.
        scope.zip
          ? {
              kind: "zip",
              value: scope.zip,
              address: arrivalAddr ?? project.subject_address ?? undefined,
            }
          : scope.place
            ? {
                kind: "place",
                value: scope.place,
                address: arrivalAddr ?? project.subject_address ?? undefined,
              }
            : (arrivalAddr ?? project.subject_address)
              ? {
                  kind: "region",
                  value: "swfl",
                  // A fresh listing project has zero items (no zip/place scope yet)
                  // but a saved subject address — it must still feed the address lane.
                  address: arrivalAddr ?? project.subject_address ?? undefined,
                }
              : undefined
      }
      initialDoc={initialDoc}
      zipSeeded={Boolean(zipSeed && initialDoc)}
      initialRecipe={initialRecipe}
      deliverableId={did}
      hasDeliverables={hasDeliverables}
      autoOpenSchedule={autoOpenSchedule}
      projectPhotos={projectPhotos}
      uiState={(project.ui_state ?? {}) as import("../workspace/types").ProjectUiState}
      initialSequence={
        (seqRow as import("@/components/email-lab/ArcStrip").ArcSequence | null) ?? null
      }
      arcStep={arcStep}
      subjectAddress={project.subject_address ?? null}
    />
  );
}
