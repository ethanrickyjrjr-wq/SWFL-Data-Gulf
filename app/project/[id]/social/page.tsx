import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { inferScopeFromItems } from "@/lib/project/derive-name";
import type { ProjectItem } from "@/lib/project/items";
import { signedUploadUrls } from "@/lib/project/signed-upload-url";
import { ProjectSocialClient } from "./ProjectSocialClient";
import type { BrandNeed, ShowcaseRecipe } from "@/lib/showcase/recipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Social" };

export default async function ProjectSocialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Showcase "Make this →" carry (pill or the /showcase page, both
  // ?recipe=/?recipeNeeds= — see lib/showcase/recipe.ts recipeDestination).
  const initialRecipe: ShowcaseRecipe | null = sp.recipe
    ? {
        prompt: sp.recipe,
        needs: (sp.recipeNeeds ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean) as BrandNeed[],
        target: "social",
      }
    : null;

  // Quick-start "New Listing Socials" deep-link (?campaign=) — threaded to the
  // client, which auto-generates the launch week (same server-resolve-then-prop
  // pattern as initialRecipe; the client reads no query params itself).
  const initialCampaign = sp.campaign ?? null;

  const supabase = createClient(await cookies());
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) redirect("/login");

  const { data: project } = await supabase
    .from("projects")
    .select("id, title, items, branding, subject_address")
    .eq("id", id)
    .maybeSingle();
  if (!project) notFound();

  const branding = (project.branding ?? {}) as Record<string, string>;
  const items: ProjectItem[] = Array.isArray(project.items) ? project.items : [];
  let scope = inferScopeFromItems(items);
  // A fresh listing project has no filed items yet, so scope from items is empty.
  // Fall back to the saved subject address (a New Listing Socials launch week
  // must be about THE user's listing area, not region-wide) — routed through the
  // ONE scope root as a synthetic note, never re-parsed here.
  const subjectAddress = typeof project.subject_address === "string" ? project.subject_address : "";
  if (!scope.zip && !scope.place && subjectAddress.trim()) {
    scope = inferScopeFromItems([
      { id: "subject", added_at: "", origin: "web", kind: "note", text: subjectAddress },
    ]);
  }

  // Filed image items + 1h signed URLs (same as the email tool's Photos feed).
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

  return (
    <ProjectSocialClient
      projectId={id}
      projectTitle={project.title ?? "Project"}
      branding={branding}
      scope={
        scope.zip
          ? { kind: "zip", value: scope.zip }
          : scope.place
            ? { kind: "place", value: scope.place }
            : undefined
      }
      projectPhotos={projectPhotos}
      initialRecipe={initialRecipe}
      initialCampaign={initialCampaign}
    />
  );
}
