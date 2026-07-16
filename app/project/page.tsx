import { cookies } from "next/headers";
import { PageShell } from "@/components/PageShell";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import { buildScheduleChips } from "@/lib/project/schedule-chips";
import {
  groupProjects,
  toCockpitProjects,
  type ProjectRowInput,
} from "@/lib/project/group-projects";
import { ImportDraftOnLogin } from "./_import/ImportDraftOnLogin";
import { NewProjectButton } from "./NewProjectButton";
import { NewListingButton } from "./NewListingButton";
import { ShowingPrepButton } from "./ShowingPrepButton";
import { ProjectsCockpit } from "./_cockpit/ProjectsCockpit";
import { EmptyLaunchpad } from "./_cockpit/EmptyLaunchpad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your projects — SWFL Data Gulf" };

/**
 * The cockpit hub (spec 2026-07-16, supersedes the 07/03 control-center list):
 * grouped project list + selected-project panel in the shared cockpit chrome.
 * The quick-links row and page-topping campaign starters are gone — starters
 * live in the panel/empty state, Charts/Alerts/Search in the top nav, and
 * Contacts is a first-class panel block.
 */
export default async function ProjectListPage() {
  const supabase = createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Middleware already gates /project, but redirect here too (belt + suspenders).
  if (!user) redirect("/login?next=/project");

  const [{ data }, { data: emailSch }, { data: socialSch }, { data: delivRows }, contactsRes] =
    await Promise.all([
      supabase
        .from("projects")
        .select("id, title, kind, items, updated_at")
        .order("updated_at", { ascending: false }),
      supabase
        .from("email_schedules")
        .select(
          "id, project_id, status, cadence, day_of_week, day_of_month, send_hour_et, audience_slug, next_run_at, deliverable_id",
        )
        .in("status", ["active", "paused"]),
      supabase
        .from("social_schedules")
        .select(
          "id, project_id, status, cadence, day_of_week, day_of_month, send_hour_et, platform, next_run_at",
        )
        .in("status", ["active", "paused"]),
      // Newest-first so the fold keeps the most-recent block-canvas doc per
      // project (same tie-break the tool switcher uses).
      supabase
        .from("deliverables")
        .select("id, project_id, template")
        .order("data_as_of", { ascending: false }),
      supabase.from("contacts").select("id", { count: "exact", head: true }),
    ]);

  const rows = (data as ProjectRowInput[] | null) ?? [];
  const contactsCount = contactsRes.count ?? 0;

  const { chipsByProject, activeCount, upcoming } = buildScheduleChips(
    emailSch ?? [],
    socialSch ?? [],
  );
  const builtByProject = new Map<string, number>();
  const lastDidByProject = new Map<string, string>();
  for (const d of delivRows ?? []) {
    builtByProject.set(d.project_id, (builtByProject.get(d.project_id) ?? 0) + 1);
    if (d.template === "block-canvas" && !lastDidByProject.has(d.project_id)) {
      lastDidByProject.set(d.project_id, d.id);
    }
  }

  const projects = toCockpitProjects(rows, {
    chipsByProject,
    builtByProject,
    lastDidByProject,
  });
  const sections = groupProjects(projects);
  // Rows arrive updated_at desc, so rows[0] is the most recent project.
  const defaultSelectedId = rows[0]?.id ?? null;

  return (
    <PageShell width="wide">
      {/* Migrates an anonymous localStorage draft into a saved project on arrival. */}
      <ImportDraftOnLogin />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Your projects</h1>
        <div className="flex items-center gap-2">
          <NewListingButton />
          <ShowingPrepButton />
          <NewProjectButton />
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyLaunchpad contactsCount={contactsCount} />
      ) : (
        <ProjectsCockpit
          sections={sections}
          defaultSelectedId={defaultSelectedId}
          activeCount={activeCount}
          upcoming={upcoming}
          contactsCount={contactsCount}
        />
      )}
    </PageShell>
  );
}
